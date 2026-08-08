/**
 * The settings dialog: login state, the current tournament, and log out.
 *
 * Note it mounts with its own `open` state already true, so the dialog is up on
 * first paint with no interaction. That is why App.test.tsx has to dismiss it
 * before it can see the table underneath.
 *
 * @jest-environment jsdom
 */
import { screen, waitFor } from '@testing-library/react';
import Settings from '../renderer/Settings';
import { installElectronMock } from '../__fixtures__/electronApi';
import { renderWithTheme, setupUser } from '../__fixtures__/renderWithTheme';
import {
  EMPTY_TOURNAMENT,
  nycMeleeTournament,
} from '../__fixtures__/tournament';

let electron: ReturnType<typeof installElectronMock>;

beforeEach(() => {
  electron = installElectronMock();
});

afterEach(() => {
  electron.restore();
  jest.clearAllMocks();
});

function renderSettings(props: Partial<Parameters<typeof Settings>[0]> = {}) {
  const setSlugDialogOpen = jest.fn();
  const setGettingAdminedTournaments = jest.fn();
  const setGettingTournament = jest.fn();
  const showErrorDialog = jest.fn();
  const getStartggTournament = jest.fn().mockResolvedValue(undefined);
  renderWithTheme(
    <Settings
      loggedInStatus
      slugDialogOpen={false}
      gettingTournament={false}
      startggTournament={EMPTY_TOURNAMENT}
      adminedTournaments={[]}
      gettingAdminedTournaments={false}
      setSlugDialogOpen={setSlugDialogOpen}
      setGettingTournament={setGettingTournament}
      setGettingAdminedTournaments={setGettingAdminedTournaments}
      showErrorDialog={showErrorDialog}
      getStartggTournament={getStartggTournament}
      {...props}
    />,
  );
  return {
    setSlugDialogOpen,
    setGettingAdminedTournaments,
    setGettingTournament,
    showErrorDialog,
    getStartggTournament,
  };
}

describe('on mount', () => {
  it('opens the dialog without waiting to be asked', () => {
    // There is nothing useful to do in the app until a tournament is picked, so
    // the settings dialog shows itself.
    renderSettings();

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});

describe('while logged out', () => {
  it('offers only a login button', () => {
    renderSettings({ loggedInStatus: false });

    expect(
      screen.getByRole('button', { name: /Login to Startgg!/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Log Out/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Set start.gg tournament' }),
    ).not.toBeInTheDocument();
  });

  it('opens the start.gg login window when asked', async () => {
    const user = setupUser();
    renderSettings({ loggedInStatus: false });

    await user.click(screen.getByRole('button', { name: /Login to Startgg!/ }));

    expect(electron.api.openStartggLoginWindow).toHaveBeenCalledTimes(1);
  });
});

describe('while logged in', () => {
  it('prompts for a tournament when none is set', () => {
    renderSettings({ startggTournament: EMPTY_TOURNAMENT });

    expect(
      screen.getByDisplayValue('Set start.gg tournament...'),
    ).toBeInTheDocument();
  });

  it('shows the current slug once one is set', () => {
    renderSettings({ startggTournament: nycMeleeTournament() });

    expect(
      screen.getByDisplayValue('tournament/nyc-melee-100'),
    ).toBeInTheDocument();
  });

  it('leaves the slug field read-only', () => {
    // It is a display, not an input - the slug is changed through the picker.
    renderSettings({ startggTournament: nycMeleeTournament() });

    expect(screen.getByDisplayValue('tournament/nyc-melee-100')).toBeDisabled();
  });

  it('opens the tournament picker from the edit button', async () => {
    const user = setupUser();
    const { setSlugDialogOpen } = renderSettings();

    await user.click(
      screen.getByRole('button', { name: 'Set start.gg tournament' }),
    );

    expect(setSlugDialogOpen).toHaveBeenCalledWith(true);
  });

  it('nests the picker inside the settings dialog when open', () => {
    renderSettings({ slugDialogOpen: true });

    expect(screen.getByLabelText('Tournament Slug')).toBeInTheDocument();
  });

  it('keeps the picker hidden while closed', () => {
    renderSettings({ slugDialogOpen: false });

    expect(screen.queryByLabelText('Tournament Slug')).not.toBeInTheDocument();
  });

  it('reports the picker being dismissed back up to App', async () => {
    // slugDialogOpen lives in App, so Escape on the inner dialog has to be
    // relayed rather than handled locally.
    const user = setupUser();
    const { setSlugDialogOpen } = renderSettings({ slugDialogOpen: true });

    await user.keyboard('{Escape}');

    expect(setSlugDialogOpen).toHaveBeenCalledWith(false);
  });

  it('logs out through the bridge', async () => {
    const user = setupUser();
    renderSettings();

    await user.click(screen.getByRole('button', { name: /Log Out/ }));

    expect(electron.api.logOut).toHaveBeenCalledTimes(1);
  });
});

describe('dismissing and reopening', () => {
  it('closes on Escape', async () => {
    const user = setupUser();
    renderSettings();

    await user.keyboard('{Escape}');

    await waitFor(() =>
      expect(screen.queryByText('Settings')).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Settings')).not.toBeInTheDocument();
  });

  it('does not disturb the picker state when it closes itself', async () => {
    // The settings dialog owns `open` locally; slugDialogOpen belongs to App.
    const user = setupUser();
    const { setSlugDialogOpen } = renderSettings();

    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText('Settings')).not.toBeInTheDocument(),
    );

    expect(setSlugDialogOpen).not.toHaveBeenCalled();
  });

  it('reopens from the settings button', async () => {
    const user = setupUser();
    renderSettings();
    await user.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByText('Settings')).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByText('Settings')).toBeInTheDocument();
  });
});
