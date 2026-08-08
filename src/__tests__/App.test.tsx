/**
 * App, wired end to end against a stubbed electron bridge.
 *
 * IndexPage is the whole renderer's state: it owns the tournament, the search
 * text, the filter state and the login status, and every other component just
 * receives props from it. So this suite is about the effects - what happens when
 * main pushes something down, and what gets pushed back up in response.
 *
 * Settings renders its dialog open on mount and MUI marks the rest of the app
 * aria-hidden while a modal is up, so anything looking at the table has to
 * dismiss it first.
 *
 * @jest-environment jsdom
 */
import { act, screen, waitFor } from '@testing-library/react';
import { AdminedTournament, NullableBoolean } from '../common/types';
import App from '../renderer/App';
import {
  installElectronMock,
  lastFilterPayload,
} from '../__fixtures__/electronApi';
import { linkNamedFormControls } from '../__fixtures__/namedFormControls';
import {
  closeSettingsDialog,
  renderWithTheme,
  setupUser,
} from '../__fixtures__/renderWithTheme';
import {
  EMPTY_TOURNAMENT,
  makeRegistrationOption,
  makeTournament,
  nycMeleeTournament,
  POOL_A,
  POOL_B,
  VENUE_FEE,
} from '../__fixtures__/tournament';
import { REDEMPTION, SINGLES } from '../__fixtures__/nycMelee';

const ADMINED: AdminedTournament[] = [
  { slug: 'nyc-melee-100', name: 'NYC Melee 100' },
];

let electron: ReturnType<typeof installElectronMock>;

beforeEach(() => {
  electron = installElectronMock();
});

afterEach(() => {
  electron.restore();
  jest.clearAllMocks();
});

/** Render App and dismiss the settings dialog it opens on mount. */
async function renderApp({ dismissSettings = true } = {}) {
  const result = renderWithTheme(<App />);
  const user = setupUser();
  if (dismissSettings) {
    await closeSettingsDialog(user);
  }
  // The mount effect calls getAdminedTournaments(), and its .then settles a
  // microtask after render() returns - after the act() that render wrapped it
  // in has already exited. Flush it here so the setState lands inside an act()
  // rather than mid-assertion. It has to come after the settings dialog is
  // dismissed: a rejected fetch opens the error dialog on top of settings, and
  // the escape key would then go to the error dialog instead.
  await act(async () => {});
  return { user, ...result };
}

describe('on mount', () => {
  it('subscribes to everything main can push', async () => {
    await renderApp();

    expect(electron.api.onLoggedInStatus).toHaveBeenCalled();
    expect(electron.api.onAdminedTournaments).toHaveBeenCalled();
    expect(electron.api.onTournament).toHaveBeenCalled();
    expect(electron.api.refreshTournament).toHaveBeenCalled();
  });

  it('asks for the admined tournaments straight away', async () => {
    await renderApp();

    expect(electron.api.getAdminedTournaments).toHaveBeenCalledTimes(1);
  });

  it('shows nothing selected until a tournament arrives', async () => {
    await renderApp();

    expect(screen.getByText('No tournament selected!')).toBeInTheDocument();
  });

  it('reports a failed startup fetch in the error dialog', async () => {
    electron.api.getAdminedTournaments.mockRejectedValue(
      new Error('401 - Unauthorized.'),
    );
    await renderApp();

    expect(await screen.findByText('401 - Unauthorized.')).toBeInTheDocument();
  });

  it('reports a non-Error rejection as-is', async () => {
    electron.api.getAdminedTournaments.mockRejectedValue('went sideways');
    await renderApp();

    expect(await screen.findByText('went sideways')).toBeInTheDocument();
  });
});

describe('when the login status changes', () => {
  it('ignores a repeat of the status it already holds', async () => {
    // The ref guard exists to stop this: main pushes loggedInStatus:false on
    // every failed call, and acting on each one would reopen the login window
    // over and over.
    await renderApp();

    await electron.emit.loggedInStatus(false);

    expect(electron.api.openStartggLoginWindow).not.toHaveBeenCalled();
  });

  it('refetches the tournament list on becoming logged in', async () => {
    await renderApp();
    electron.api.getAdminedTournaments.mockClear();

    await electron.emit.loggedInStatus(true);

    expect(electron.api.getAdminedTournaments).toHaveBeenCalledTimes(1);
  });

  it('opens the login window on being logged out', async () => {
    await renderApp();
    await electron.emit.loggedInStatus(true);

    await electron.emit.loggedInStatus(false);

    expect(electron.api.openStartggLoginWindow).toHaveBeenCalledTimes(1);
  });

  it('acts once when the same status arrives twice', async () => {
    await renderApp();
    electron.api.getAdminedTournaments.mockClear();

    await electron.emit.loggedInStatus(true);
    await electron.emit.loggedInStatus(true);

    expect(electron.api.getAdminedTournaments).toHaveBeenCalledTimes(1);
  });

  it('surfaces a refetch failure', async () => {
    await renderApp();
    electron.api.getAdminedTournaments.mockRejectedValue(new Error('offline'));

    await electron.emit.loggedInStatus(true);

    expect(await screen.findByText('offline')).toBeInTheDocument();
  });
});

describe('when a tournament list arrives', () => {
  /** Settings only shows the picker once main says we are logged in. */
  async function openPicker(user: ReturnType<typeof setupUser>) {
    await electron.emit.loggedInStatus(true);
    await user.click(
      screen.getByRole('button', { name: 'Set start.gg tournament' }),
    );
  }

  it('offers each one in the picker', async () => {
    const { user } = await renderApp({ dismissSettings: false });
    await electron.emit.adminedTournaments(ADMINED);

    await openPicker(user);

    expect(screen.getByText(/NYC Melee 100/)).toBeInTheDocument();
  });

  it('ignores an undefined list', async () => {
    // The guard means a logged-out push does not blank out a list the desk is
    // already looking at.
    const { user } = await renderApp({ dismissSettings: false });
    await electron.emit.adminedTournaments(ADMINED);
    await electron.emit.adminedTournaments(undefined);

    await openPicker(user);

    expect(screen.getByText(/NYC Melee 100/)).toBeInTheDocument();
  });
});

describe('picking a tournament', () => {
  async function openPicker(user: ReturnType<typeof setupUser>) {
    await electron.emit.loggedInStatus(true);
    await electron.emit.adminedTournaments(ADMINED);
    await user.click(
      screen.getByRole('button', { name: 'Set start.gg tournament' }),
    );
  }

  it('loads the tournament that was chosen from the list', async () => {
    const { user } = await renderApp({ dismissSettings: false });
    await openPicker(user);

    await user.click(screen.getByText(/NYC Melee 100/));

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'nyc-melee-100',
    );
  });

  it('loads a slug typed in by hand', async () => {
    const { user } = await renderApp({ dismissSettings: false });
    await openPicker(user);
    // The picker lives in a MUI Dialog, which portals outside the render
    // container - so this has to walk the whole document.
    linkNamedFormControls();

    await user.type(screen.getByLabelText('Tournament Slug'), 'typed-slug');
    await user.click(screen.getByRole('button', { name: /Get!/ }));

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'typed-slug',
    );
  });

  it('ignores an empty slug without calling out to main', async () => {
    const { user } = await renderApp({ dismissSettings: false });
    await openPicker(user);
    // The picker lives in a MUI Dialog, which portals outside the render
    // container - so this has to walk the whole document.
    linkNamedFormControls();

    await user.click(screen.getByRole('button', { name: /Get!/ }));

    expect(electron.api.getStartggTournament).not.toHaveBeenCalled();
  });

  it('reports a failed load with the error message', async () => {
    // Every other catch in the app shows e.message. Using e.toString() here
    // leaks a raw "Error: " prefix into the dialog that no other failure has.
    const { user } = await renderApp({ dismissSettings: false });
    electron.api.getStartggTournament.mockRejectedValue(new Error('offline'));
    await openPicker(user);

    await user.click(screen.getByText(/NYC Melee 100/));

    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(screen.queryByText('Error: offline')).not.toBeInTheDocument();
  });

  it('shows a non-Error load rejection as-is', async () => {
    const { user } = await renderApp({ dismissSettings: false });
    electron.api.getStartggTournament.mockRejectedValue('load string');
    await openPicker(user);

    await user.click(screen.getByText(/NYC Melee 100/));

    expect(await screen.findByText('load string')).toBeInTheDocument();
  });
});

describe('when a tournament arrives', () => {
  it('renders its participants', async () => {
    await renderApp();

    await electron.emit.tournament(nycMeleeTournament());

    expect(screen.getByText('TSM | Alice')).toBeInTheDocument();
    expect(screen.getByText('Erin')).toBeInTheDocument();
  });

  it('ignores an undefined tournament rather than clearing the table', async () => {
    await renderApp();
    await electron.emit.tournament(nycMeleeTournament());

    await electron.emit.tournament(undefined);

    expect(screen.getByText('TSM | Alice')).toBeInTheDocument();
  });
});

describe('the filter state pushed back to main', () => {
  it('seeds every option with an inert filter and all pools ticked', async () => {
    await renderApp();

    await electron.emit.tournament(nycMeleeTournament());

    const [searchText, filters] = lastFilterPayload(electron.api);
    expect(searchText).toBe('');
    expect(Object.keys(filters).map(Number).sort()).toEqual(
      [VENUE_FEE, SINGLES, REDEMPTION].sort(),
    );
    expect(filters[SINGLES]).toEqual({
      paid: NullableBoolean.Indeterminate,
      added: NullableBoolean.Indeterminate,
      pools: { [POOL_A.id]: true, [POOL_B.id]: true, '-1': true },
    });
  });

  it('gives an option with no pools an empty pool record', async () => {
    await renderApp();
    const tournament = nycMeleeTournament();
    delete tournament.registrationOptions[1].pools;

    await electron.emit.tournament(tournament);

    const [, filters] = lastFilterPayload(electron.api);
    expect(filters[SINGLES].pools).toEqual({});
  });

  it('reports each search keystroke', async () => {
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());

    await user.type(screen.getByLabelText('Search players'), 'ali');

    await waitFor(() => {
      const [searchText] = lastFilterPayload(electron.api);
      expect(searchText).toBe('ali');
    });
  });
});

describe('switching tournaments', () => {
  /** The same options, so only poolsKey can change. */
  const withPools = (poolIds: number[]) =>
    nycMeleeTournament({
      registrationOptions: [
        makeRegistrationOption({
          id: VENUE_FEE,
          name: 'Venue Fee',
          type: 'tournament',
        }),
        makeRegistrationOption({
          id: SINGLES,
          name: 'Melee Singles',
          pools: poolIds.map((id) => ({ id, phase: 'Pools', name: `${id}` })),
        }),
        makeRegistrationOption({
          id: REDEMPTION,
          name: 'Redemption Bracket',
          pools: [],
        }),
      ],
    });

  it('clears the search when the events themselves change', async () => {
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());
    await user.type(screen.getByLabelText('Search players'), 'alice');

    await electron.emit.tournament(
      makeTournament({
        slug: 'tournament/other',
        registrationOptions: [
          makeRegistrationOption({ id: 999, name: 'Other Event' }),
        ],
        participants: [],
      }),
    );

    expect(screen.getByLabelText('Search players')).toHaveValue('');
  });

  it('keeps the search across a refresh of the same tournament', async () => {
    // This is the point of keying the reset on the option ids rather than on
    // the tournament object: a refresh must not wipe what the desk had typed.
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());
    await user.type(screen.getByLabelText('Search players'), 'alice');

    await electron.emit.tournament(nycMeleeTournament());

    expect(screen.getByLabelText('Search players')).toHaveValue('alice');
  });

  it('defaults a newly appeared pool to ticked', async () => {
    await renderApp();
    await electron.emit.tournament(withPools([POOL_A.id]));

    await electron.emit.tournament(withPools([POOL_A.id, POOL_B.id]));

    const [, filters] = lastFilterPayload(electron.api);
    expect(filters[SINGLES].pools).toEqual({
      [POOL_A.id]: true,
      [POOL_B.id]: true,
    });
  });

  it('drops a pool that no longer exists', async () => {
    await renderApp();
    await electron.emit.tournament(withPools([POOL_A.id, POOL_B.id]));

    await electron.emit.tournament(withPools([POOL_A.id]));

    const [, filters] = lastFilterPayload(electron.api);
    expect(filters[SINGLES].pools).toEqual({ [POOL_A.id]: true });
  });

  it('remembers a pool the user unticked across a refresh', async () => {
    // The regression the merge effect exists for. Unticking a finished pool and
    // then hitting refresh must not bring everyone back.
    const { user } = await renderApp();
    await electron.emit.tournament(withPools([POOL_A.id, POOL_B.id]));

    // Open the singles "added" menu and untick the first pool.
    const filterButtons = screen.getAllByRole('button', {
      name: 'Apply Filter',
    });
    await user.click(filterButtons[2]);
    await user.click(screen.getByRole('checkbox', { name: 'Pools 5001' }));
    await user.keyboard('{Escape}');

    await electron.emit.tournament(withPools([POOL_A.id, POOL_B.id]));

    const [, filters] = lastFilterPayload(electron.api);
    expect(filters[SINGLES].pools).toEqual({
      [POOL_A.id]: false,
      [POOL_B.id]: true,
    });
  });
});

describe('refreshTournament from the menu', () => {
  it('refetches the tournament that is loaded', async () => {
    await renderApp();
    await electron.emit.tournament(nycMeleeTournament());

    await electron.emit.refreshTournament();

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'tournament/nyc-melee-100',
    );
  });

  it('does nothing when no tournament is loaded', async () => {
    await renderApp();

    await electron.emit.refreshTournament();

    expect(electron.api.getStartggTournament).not.toHaveBeenCalled();
  });

  it('follows the tournament that is loaded now, not the one it started with', async () => {
    // The listener is re-registered whenever the tournament changes; a stale
    // closure here would silently refresh the wrong event.
    await renderApp();
    await electron.emit.tournament(nycMeleeTournament());
    await electron.emit.tournament(
      makeTournament({ slug: 'tournament/second-event' }),
    );

    await electron.emit.refreshTournament();

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'tournament/second-event',
    );
  });

  it('reports a failed refresh instead of leaving the spinner up', async () => {
    // "Getting tournament attendees ..." stands in for the whole table, so a
    // refresh that fails silently takes the screen away mid-event.
    await renderApp();
    await electron.emit.tournament(nycMeleeTournament());
    electron.api.getStartggTournament.mockRejectedValue(new Error('offline'));

    await electron.emit.refreshTournament();

    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(
      screen.queryByText('Getting tournament attendees ...'),
    ).not.toBeInTheDocument();
  });
});

describe('hotkeys', () => {
  const press = async (user: ReturnType<typeof setupUser>, combo: string) =>
    user.keyboard(combo);

  it('focuses the search box on the find shortcut', async () => {
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());

    await press(user, '{Control>}f{/Control}');

    expect(screen.getByLabelText('Search players')).toHaveFocus();
  });

  it('refreshes on the refresh shortcut', async () => {
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());

    await press(user, '{Control>}r{/Control}');

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'tournament/nyc-melee-100',
    );
  });

  it('does not refresh when nothing is loaded', async () => {
    const { user } = await renderApp();

    await press(user, '{Control>}r{/Control}');

    expect(electron.api.getStartggTournament).not.toHaveBeenCalled();
  });

  it('reports a failed refresh from the shortcut too', async () => {
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());
    electron.api.getStartggTournament.mockRejectedValue(new Error('offline'));

    await press(user, '{Control>}r{/Control}');

    expect(await screen.findByText('offline')).toBeInTheDocument();
    expect(
      screen.queryByText('Getting tournament attendees ...'),
    ).not.toBeInTheDocument();
  });

  it('uses the command key on a mac', async () => {
    electron.restore();
    electron = installElectronMock({ isMac: true });
    const { user } = await renderApp();
    await electron.emit.tournament(nycMeleeTournament());

    await press(user, '{Meta>}r{/Meta}');

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'tournament/nyc-melee-100',
    );
  });

});

describe('copying the listed participants', () => {
  it('shows what would be copied', async () => {
    const { user } = await renderApp();
    electron.api.getCopyText.mockResolvedValue('TSM|Alice, Bob');
    await electron.emit.tournament(nycMeleeTournament());

    await user.click(
      screen.getByRole('button', { name: 'Copy Listed Participants' }),
    );

    expect(
      await screen.findByDisplayValue('TSM|Alice, Bob'),
    ).toBeInTheDocument();
  });

  it('closes the copy dialog again', async () => {
    const { user } = await renderApp();
    electron.api.getCopyText.mockResolvedValue('TSM|Alice, Bob');
    await electron.emit.tournament(nycMeleeTournament());
    await user.click(
      screen.getByRole('button', { name: 'Copy Listed Participants' }),
    );
    await screen.findByDisplayValue('TSM|Alice, Bob');

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(
        screen.queryByDisplayValue('TSM|Alice, Bob'),
      ).not.toBeInTheDocument(),
    );
  });

  it('reports a failure instead of opening the dialog', async () => {
    const { user } = await renderApp();
    electron.api.getCopyText.mockRejectedValue(new Error('nothing to copy'));
    await electron.emit.tournament(nycMeleeTournament());

    await user.click(
      screen.getByRole('button', { name: 'Copy Listed Participants' }),
    );

    expect(await screen.findByText('nothing to copy')).toBeInTheDocument();
    // Exactly one dialog, and it is the error - the copy dialog never opened.
    const dialogs = screen.getAllByRole('dialog');
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]).toHaveTextContent('nothing to copy');
  });
});

describe('the error dialog', () => {
  it('clears its messages when dismissed', async () => {
    electron.api.getAdminedTournaments.mockRejectedValue(new Error('first'));
    const { user } = await renderApp();
    expect(await screen.findByText('first')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(screen.queryByText('first')).not.toBeInTheDocument(),
    );
  });
});

describe('the empty tournament main sends on log out', () => {
  it('puts the table back to nothing selected', async () => {
    await renderApp();
    await electron.emit.tournament(nycMeleeTournament());
    expect(screen.getByText('TSM | Alice')).toBeInTheDocument();

    await electron.emit.tournament(EMPTY_TOURNAMENT);

    expect(screen.getByText('No tournament selected!')).toBeInTheDocument();
  });
});
