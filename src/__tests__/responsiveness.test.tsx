/**
 * The interface has to keep up with a big tournament.
 *
 * A check-in desk at a hundred-plus entrant event types into the search box,
 * clicks filter icons and ticks checkboxes continuously, and the one thing that
 * is not acceptable is an interaction that does not register. The effects may
 * lag - the search can settle a beat later, the table can take a few hundred
 * milliseconds to redraw - but the character has to appear as it is typed and
 * the menu has to open when it is clicked.
 *
 * That requirement is not "the app is fast on this machine", it is "the cost of
 * an interaction does not depend on how big the tournament is". So the gates
 * here are of two kinds:
 *
 *   - structural, asserting on counts nobody's CPU can influence: how many rows
 *     are mounted, how many IPC calls a burst of typing produces;
 *   - scaling, measuring the same interaction on two sizes of tournament in the
 *     same process and requiring the larger one not to cost proportionally more.
 *     Which two sizes depends on the interaction; see MAX_SCALING below.
 *
 * The scaling gates are doing double duty. "Does a keystroke re-render the grid"
 * has no structural answer available from outside the component - a re-render
 * with unchanged props mutates no DOM and adds no commit that a Profiler at the
 * app's root can attribute - but it cannot re-render a few thousand checkboxes
 * and still cost what a few dozen cost. The ratio is the observable form of that
 * question.
 *
 * The one absolute millisecond budget lives in responsiveness.budget.test.tsx,
 * which also explains why there is only one. The measurement mechanics, and why
 * they are what they are, are documented in __fixtures__/responsiveness.tsx.
 *
 * @jest-environment jsdom
 */
import { fireEvent, act, waitFor } from '@testing-library/react';
import { Tournament } from '../common/types';
import { bigTournament, nycMeleeTournament } from '../__fixtures__/tournament';
import {
  median,
  renderPerfApp,
  sampleFilterClicks,
  sampleKeystrokes,
  searchBox,
  type PerfApp,
  type Sample,
} from '../__fixtures__/responsiveness';

// A jsdom document holding thousands of MUI Checkboxes takes real time to build,
// and every test here builds at least two of them.
jest.setTimeout(120_000);

/**
 * Big enough that anything scaling with tournament size is unmistakable, small
 * enough that a run without the virtualisation fails on an assertion rather than
 * on a timeout. 100 participants x (1 venue fee + 8 events x 2 controls) = 1700
 * checkboxes.
 */
const BIG = { participants: 100, events: 8 };
/** Four times the entrants, the same number of them on screen. */
const BIGGER = { participants: 400, events: 8 };
const CELLS_PER_ROW = 1 + BIG.events * 2;

/**
 * How the comparisons are shaped.
 *
 * Two different questions get asked, because the honest comparator is different
 * for each.
 *
 * Typing touches no rows at all, so it is compared against the five-participant
 * tournament and expected to cost about the same. The factor is 4 rather than
 * something tighter because at five participants the sample is nearly all fixed
 * cost, which makes the ratio noisy upwards even when nothing scales.
 *
 * A click on a checkbox or a filter icon does touch the rows: main answers a
 * toggle by re-sending the tournament, and whatever is on screen re-renders. So
 * comparing 100 entrants against 5 would fail on nothing worse than the window
 * having room for fifteen rows instead of five. What actually matters is that
 * the cost is bounded by the window rather than by the tournament, and that is
 * what quadrupling the entrants without changing the window asks.
 */
const MAX_SCALING = 4;
const MAX_GROWTH = 2;

/**
 * Below this, a measurement is not evidence of anything.
 *
 * Both halves of these comparisons are now sub-millisecond or thereabouts, and a
 * ratio between two numbers that small is noise - on a loaded machine, 0.4ms
 * against 0.1ms is a "4x regression" that means nothing. A full re-render of the
 * grid this suite builds costs tens of milliseconds, so anything under 8ms is
 * comfortably on the right side of the only distinction being drawn, whatever
 * the ratio says.
 */
const NOISE_FLOOR_MS = 8;

/**
 * Assert `measured` has not grown out of proportion to `reference`.
 *
 * Two-sided on purpose: a failure needs the cost to be both a multiple of the
 * comparator and large enough in absolute terms to be a real cost.
 */
function expectNoGrowth(measured: number, reference: number, factor: number) {
  if (measured < NOISE_FLOOR_MS) {
    return;
  }
  expect(measured).toBeLessThan(reference * factor);
}

afterEach(() => {
  jest.clearAllMocks();
});

/** Run body against two tournaments in turn and hand back the medians. */
async function medianWorkFor(
  tournaments: [Tournament, Tournament],
  options: { echo?: boolean },
  body: (app: PerfApp) => Promise<Sample[]> | Sample[],
) {
  const results: number[] = [];
  for (const tournament of tournaments) {
    const app = await renderPerfApp(tournament, options);
    try {
      const samples = await body(app);
      results.push(median(samples.map((sample) => sample.work)));
    } finally {
      await app.teardown();
    }
  }
  return results;
}

describe('the rows that get mounted', () => {
  it('mounts only the rows that could be on screen', async () => {
    // The grid is the whole cost of everything else in this file: an interaction
    // cannot be cheap if answering it means reconciling every entrant in the
    // tournament. jsdom reports a 768px window, so only about fifteen 50px rows
    // can be visible at once however many entrants there are.
    const app = await renderPerfApp(bigTournament(BIGGER));
    try {
      const checkboxes = app.container.querySelectorAll(
        'input[type="checkbox"]',
      );

      expect(checkboxes.length).toBeLessThan(30 * CELLS_PER_ROW);
    } finally {
      await app.teardown();
    }
  });

  it('does not mount more of them just because a menu opened', async () => {
    const app = await renderPerfApp(bigTournament(BIG));
    try {
      const before = app.container.querySelectorAll(
        'input[type="checkbox"]',
      ).length;

      await sampleFilterClicks(app, 1);

      expect(
        app.container.querySelectorAll('input[type="checkbox"]').length,
      ).toBe(before);
    } finally {
      await app.teardown();
    }
  });
});

describe('typing in the search box', () => {
  it('shows every character as it is typed', async () => {
    // The debounce is allowed to delay the search. It is not allowed to delay
    // the text, and it must not drop or reorder a character on the way.
    const app = await renderPerfApp(bigTournament(BIG), { echo: false });
    try {
      const input = searchBox();
      const seen: string[] = [];
      'zephyr'.split('').forEach((character, index) => {
        fireEvent.change(input, {
          target: { value: 'zephyr'.slice(0, index + 1) },
        });
        seen.push(input.value);
      });

      expect(seen).toEqual(['z', 'ze', 'zep', 'zeph', 'zephy', 'zephyr']);
    } finally {
      await app.teardown();
    }
  });

  it('asks main to filter once for a burst, not once per character', async () => {
    const app = await renderPerfApp(bigTournament(BIG));
    try {
      const input = searchBox();
      // App reports the empty search on mount; the burst is what is being counted.
      app.api.updateParticipantsFiltered.mockClear();

      'zephyr'.split('').forEach((character, index) => {
        fireEvent.change(input, {
          target: { value: 'zephyr'.slice(0, index + 1) },
        });
      });

      await waitFor(() =>
        expect(app.api.updateParticipantsFiltered).toHaveBeenCalledTimes(1),
      );
      expect(app.api.updateParticipantsFiltered.mock.calls[0][0]).toBe(
        'zephyr',
      );
    } finally {
      await app.teardown();
    }
  });

  it('costs no more with a hundred entrants than with five', async () => {
    // Measured with the echo switched off, so both grids stay exactly the size
    // they started at and no sample is taken against a table the search has
    // already narrowed.
    const [big, small] = await medianWorkFor(
      [bigTournament(BIG), nycMeleeTournament()],
      { echo: false },
      (app) => sampleKeystrokes(app),
    );

    expectNoGrowth(big, small, MAX_SCALING);
  });
});

describe('clicking a filter icon', () => {
  it('costs no more with four times the entrants', async () => {
    const [bigger, big] = await medianWorkFor(
      [bigTournament(BIGGER), bigTournament(BIG)],
      {},
      (app) => sampleFilterClicks(app, 3),
    );

    expectNoGrowth(bigger, big, MAX_GROWTH);
  });
});

describe('ticking a checkbox', () => {
  it('costs no more with four times the entrants', async () => {
    // The desk's real hot path, and the most expensive one: main answers a
    // toggle with two whole tournaments, one optimistic and one once the
    // mutation settles, so each sample is two rebuilds of everything on screen.
    // What must stay constant is that "everything on screen" is a windowful.
    const [bigger, big] = await medianWorkFor(
      [bigTournament(BIGGER), bigTournament(BIG)],
      {},
      async (app) => {
        const samples: Sample[] = [];
        const checkboxes = Array.from(
          app.container.querySelectorAll<HTMLInputElement>(
            'input[type="checkbox"]:not(:disabled)',
          ),
        );
        for (let index = 0; index < 5; index += 1) {
          const checkbox = checkboxes[index % checkboxes.length];
          samples.push(
            await app.measureSettled(() => fireEvent.click(checkbox)),
          );
        }
        return samples;
      },
    );

    expectNoGrowth(bigger, big, MAX_GROWTH);
  });
});

describe('the search still works', () => {
  it('narrows the table once the debounce settles', async () => {
    // Everything above is about cost, so this is the one that says the
    // optimisations did not simply stop the feature working: three characters of
    // a rare sponsor prefix take a hundred rows down to a handful.
    const app = await renderPerfApp(bigTournament(BIG));
    try {
      const before = app.container.querySelectorAll(
        'input[type="checkbox"]',
      ).length;
      expect(before).toBeGreaterThan(0);

      await act(async () => {
        fireEvent.change(searchBox(), { target: { value: 'zep' } });
      });

      await waitFor(() =>
        expect(
          app.container.querySelectorAll('input[type="checkbox"]').length,
        ).toBe(3 * CELLS_PER_ROW),
      );
    } finally {
      await app.teardown();
    }
  });
});
