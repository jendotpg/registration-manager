/**
 * Rendering helpers shared by the renderer suites.
 */
import { ReactElement } from 'react';
import { render, RenderOptions, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider, createTheme } from '@mui/material';

/**
 * MUI's ripple settles on its own timer after a click resolves, which React
 * reports as an un-acted state update. No test here is about the ripple, so it
 * is off everywhere rather than being suppressed suite by suite.
 *
 * The zeroed durations are the same problem one layer down. Every MUI
 * transition (the Fade behind a Dialog, the Grow behind a Tooltip) is a
 * react-transition-group Transition, which waits for a transitionend event and
 * arms a setTimeout(duration) as the fallback for when one never arrives. In
 * jsdom one never arrives - there is no layout, so nothing transitions - so the
 * fallback is the only thing that ever fires, and unmounting mid-transition
 * cancels the callback without clearing the timer. A suite that opens a couple
 * of dialogs therefore ends with a fistful of live 225ms timers holding its
 * worker's event loop open, which is what makes jest intermittently report
 * "a worker process has failed to exit gracefully". At 0ms they drain on the
 * next tick instead.
 */
export const TEST_THEME = createTheme({
  components: { MuiButtonBase: { defaultProps: { disableRipple: true } } },
  transitions: {
    duration: {
      shortest: 0,
      shorter: 0,
      short: 0,
      standard: 0,
      complex: 0,
      enteringScreen: 0,
      leavingScreen: 0,
    },
  },
});

export function renderWithTheme(ui: ReactElement, options?: RenderOptions) {
  const result = render(
    <ThemeProvider theme={TEST_THEME}>{ui}</ThemeProvider>,
    options,
  );

  return {
    ...result,
    /** Re-render inside the same provider; the bare `rerender` would drop it. */
    rerenderWithTheme: (next: ReactElement) =>
      result.rerender(<ThemeProvider theme={TEST_THEME}>{next}</ThemeProvider>),
  };
}

export const setupUser = () => userEvent.setup();

/**
 * user-event schedules its own delays, which hang forever under fake timers
 * unless it is told how to advance them. Needed by any suite that asserts on a
 * MUI Tooltip, since those carry a real enterDelay.
 */
export const setupUserWithFakeTimers = () =>
  userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

/**
 * Settings renders its dialog open on mount (useState(true)), and MUI marks the
 * rest of the app aria-hidden while a modal is up. Testing Library's *ByRole
 * queries skip hidden subtrees, so anything asserting on the table underneath
 * has to dismiss this first.
 */
export async function closeSettingsDialog(user: ReturnType<typeof setupUser>) {
  // Keyed on the Settings heading rather than on role=dialog: an error dialog
  // can be open at the same time, and waiting for "no dialog at all" would then
  // never resolve.
  if (!screen.queryByText('Settings')) {
    return;
  }
  await user.keyboard('{Escape}');
  // waitFor rather than waitForElementToBeRemoved: TEST_THEME zeroes the
  // transition durations, so the dialog is often gone by the time this runs,
  // and waitForElementToBeRemoved treats "already removed" as an error.
  await waitFor(() =>
    expect(screen.queryByText('Settings')).not.toBeInTheDocument(),
  );
}
