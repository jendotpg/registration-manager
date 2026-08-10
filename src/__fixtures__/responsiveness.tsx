/**
 * Measurement harness for the responsiveness suites.
 *
 * What is being measured, and why this shape:
 *
 * The requirement is that an interaction *registers* immediately - the character
 * appears, the menu opens - while its effects are allowed to lag. So what these
 * suites sample is the work React does between the event being dispatched and the
 * commit that answers it, and the property they assert is that this work does not
 * grow with the size of the tournament.
 *
 * The number comes from a React `Profiler`, not from a stopwatch around
 * `fireEvent`. `actualDuration` is the time React spent rendering the components
 * that actually re-rendered in that commit, so it excludes jsdom's event
 * dispatch, Testing Library's wrappers and the harness itself - all of which are
 * fixed costs that would dilute a ratio. Wall clock is recorded alongside it for
 * the absolute budgets, where the fixed costs are part of what the user feels.
 *
 * `fireEvent` rather than `user-event`: RTL wraps `fireEvent` in `act()`, and a
 * `change` or `click` is a discrete event, so React renders and commits before
 * the call returns and the sample is a real one. `user-event` awaits between
 * every sub-event and runs its own timers, which would dominate the sample.
 *
 * Nothing here may use jest's fake timers. Modern fake timers replace
 * `performance.now`, which is what both the Profiler and the wall clock read, so
 * every measurement would come back as zero.
 *
 * jsdom does no style recalculation, layout or paint - the parts a browser
 * spends most of its time on - while exaggerating node construction and emotion
 * serialization. Absolute numbers from here are therefore not a faithful proxy
 * for the real app in either direction, which is why the scaling ratio, not the
 * millisecond count, is the gate that matters.
 */
import { Profiler, ProfilerOnRenderCallback } from 'react';
import { act, fireEvent } from '@testing-library/react';
import { Tournament } from '../common/types';
import App from '../renderer/App';
import { installElectronMock, installFilterEcho } from './electronApi';
import {
  closeSettingsDialog,
  renderWithTheme,
  setupUser,
} from './renderWithTheme';

/** Discarded samples, then counted ones. A cold first render is not typical. */
export const PERF_WARMUP = 3;
export const PERF_SAMPLES = 9;

export type Sample = {
  /** Sum of the Profiler's actualDuration over the commits this caused. */
  work: number;
  /** Wall clock across the dispatch, including everything React does not own. */
  wall: number;
  /** How many commits it took. */
  commits: number;
};

function total(values: number[]) {
  return values.reduce((sum, value) => sum + value, 0);
}

/**
 * Render the real App against a stubbed bridge, with the settings dialog it
 * opens on mount dismissed and `tournament` already pushed down.
 *
 * `echo: false` leaves updateParticipantsFiltered a no-op, so the grid stays
 * exactly as large as it started. That is what the keystroke samples want: if
 * the search were allowed to narrow the table between samples, later keystrokes
 * would be measured against a smaller grid than earlier ones and the median
 * would flatter whatever it is measuring.
 */
export async function renderPerfApp(
  tournament: Tournament,
  { echo = true }: { echo?: boolean } = {},
) {
  const electron = installElectronMock();
  const filterEcho = echo ? installFilterEcho(electron, tournament) : undefined;

  const durations: number[] = [];
  const onRender: ProfilerOnRenderCallback = (id, phase, actualDuration) => {
    durations.push(actualDuration);
  };

  const rendered = renderWithTheme(
    <Profiler id="app" onRender={onRender}>
      <App />
    </Profiler>,
  );

  const user = setupUser();
  await closeSettingsDialog(user);
  // getAdminedTournaments() settles a microtask after render() returns, outside
  // the act() that render wrapped it in. See App.test.tsx's renderApp.
  await act(async () => {});
  await (filterEcho ? filterEcho.load() : electron.emit.tournament(tournament));

  return {
    ...rendered,
    user,
    api: electron.api,
    filterEcho,
    durations,
    /** Time one synchronous dispatch. */
    measure: (action: () => void): Sample => {
      durations.length = 0;
      const started = performance.now();
      action();
      const wall = performance.now() - started;
      return { wall, work: total(durations), commits: durations.length };
    },
    /** Time a dispatch plus everything that settles behind it. */
    measureSettled: async (action: () => void): Promise<Sample> => {
      durations.length = 0;
      const started = performance.now();
      await act(async () => {
        action();
      });
      const wall = performance.now() - started;
      return { wall, work: total(durations), commits: durations.length };
    },
    /**
     * Drain anything still in flight before unmounting. An interaction leaves a
     * fire-and-forget IPC promise behind it, and one that settled inside the
     * next test's render would push a tournament at the wrong app.
     */
    teardown: async () => {
      await act(async () => {});
      rendered.unmount();
      electron.restore();
    },
  };
}

export type PerfApp = Awaited<ReturnType<typeof renderPerfApp>>;

export function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

/** The search box, addressed the way the app's own hotkey addresses it. */
export function searchBox() {
  return document.getElementById('search-bar') as HTMLInputElement;
}

/**
 * Type one character at a time and sample each keystroke.
 *
 * Every character is a fresh `change` with the whole prefix as its value, which
 * is what a real keystroke into a text field looks like to React.
 */
export function sampleKeystrokes(
  app: PerfApp,
  text: string = 'abcdefghijkl'.slice(0, PERF_WARMUP + PERF_SAMPLES),
) {
  const input = searchBox();
  const samples: Sample[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const value = text.slice(0, index + 1);
    const sample = app.measure(() => {
      fireEvent.change(input, { target: { value } });
    });
    if (index >= PERF_WARMUP) {
      samples.push(sample);
    }
  }
  return samples;
}

function filterButtons() {
  const buttons = Array.from(
    document.querySelectorAll<HTMLButtonElement>(
      'button[aria-label="Apply Filter"]',
    ),
  );
  if (buttons.length === 0) {
    throw new Error('No filter buttons rendered. Is a menu still open?');
  }
  return buttons;
}

async function dismissMenu() {
  await act(async () => {
    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: 'Escape',
      code: 'Escape',
    });
  });
}

/**
 * Open a filter menu, sample the click, then dismiss it again.
 *
 * The dismissal is deliberately outside the sample, and each sample uses a
 * different button, because MUI marks the rest of the tree aria-hidden while a
 * menu is up - a second open without a close in between cannot find its button.
 */
export async function sampleFilterClicks(app: PerfApp, count: number) {
  const samples: Sample[] = [];
  for (let index = 0; index < count; index += 1) {
    const buttons = filterButtons();
    const sample = await app.measureSettled(() => {
      fireEvent.click(buttons[index % buttons.length]);
    });
    samples.push(sample);
    await dismissMenu();
  }
  return samples;
}
