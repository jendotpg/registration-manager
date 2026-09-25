/**
 * The check-in table itself.
 *
 * This is the screen somebody actually works from at the desk, so the tests
 * lean on what is on screen and what happens when it is clicked. Geometry and
 * tooltips live in StartggCheckin.layout.test.tsx, which needs prototype stubs
 * and fake timers that would perturb everything here.
 *
 * The checkboxes carry no accessible name - they are bare MUI Checkboxes inside
 * tooltip spans - so they are addressed by position within a participant's row.
 * With the NYC Melee fixture that is five per row, in registration option order:
 * venue fee paid, singles paid, singles added, redemption paid, redemption
 * added.
 *
 * @jest-environment jsdom
 */
import { screen, waitFor, within } from '@testing-library/react';
import { FilterState, Id, NullableBoolean, Tournament } from '../common/types';
import StartggCheckin from '../renderer/StartggCheckin';
import { disabledReason } from '../renderer/ParticipantRow';
import { installElectronMock } from '../__fixtures__/electronApi';
import { renderWithTheme, setupUser } from '../__fixtures__/renderWithTheme';
import {
  EMPTY_TOURNAMENT,
  freeOptionTournament,
  makeParticipant,
  makeRegistrationOption,
  makeTournament,
  nycMeleeTournament,
  POOL_A,
  POOL_B,
  startedEventTournament,
  updatingTournament,
  VENUE_FEE,
} from '../__fixtures__/tournament';
import {
  ALICE,
  BOB,
  ERIN,
  REDEMPTION,
  SINGLES,
} from '../__fixtures__/nycMelee';

/** Column order within one participant's row. */
const VENUE_PAID = 0;
const SINGLES_PAID = 1;
const SINGLES_ADDED = 2;
const REDEMPTION_PAID = 3;

let electron: ReturnType<typeof installElectronMock>;

beforeEach(() => {
  electron = installElectronMock();
});

afterEach(() => {
  electron.restore();
  jest.clearAllMocks();
});

function renderCheckin(
  props: Partial<Parameters<typeof StartggCheckin>[0]> = {},
) {
  const copyFilteredParticipants = jest.fn();
  const setGettingTournament = jest.fn();
  const setSearchText = jest.fn();
  const showErrorDialog = jest.fn();
  const setFilterState = jest.fn();
  const setPaidMenuOpen = jest.fn();
  const setRegisteredMenuOpen = jest.fn();
  const setPoolMenuOpen = jest.fn();
  const resetFilters = jest.fn();
  const checkin = (menusOpen: boolean) => (
    <StartggCheckin
      startggTournament={nycMeleeTournament()}
      copyFilteredParticipants={copyFilteredParticipants}
      gettingTournament={false}
      searchText=""
      setGettingTournament={setGettingTournament}
      setSearchText={setSearchText}
      showErrorDialog={showErrorDialog}
      filterState={{}}
      setFilterState={setFilterState}
      setPaidMenuOpen={setPaidMenuOpen}
      setRegisteredMenuOpen={setRegisteredMenuOpen}
      setPoolMenuOpen={setPoolMenuOpen}
      resetFilters={resetFilters}
      {...props}
      paidMenuOpen={menusOpen ? props.paidMenuOpen ?? {} : {}}
      registeredMenuOpen={menusOpen ? props.registeredMenuOpen ?? {} : {}}
      poolMenuOpen={menusOpen ? props.poolMenuOpen ?? {} : {}}
    />
  );

  // A menu anchors to a filter button through a ref, and refs are only
  // populated once a render has committed. Opening one on the very first
  // render therefore hands MUI an anchor of undefined, which it rejects - and
  // it is not how the app behaves either, since a menu only ever opens in
  // response to a click on a button that has already been rendered. So the
  // first pass always has the menus shut, and the requested state arrives in a
  // second render, by which point the buttons exist.
  const result = renderWithTheme(checkin(false));
  if (props.paidMenuOpen || props.registeredMenuOpen || props.poolMenuOpen) {
    result.rerenderWithTheme(checkin(true));
  }

  return {
    copyFilteredParticipants,
    setGettingTournament,
    setSearchText,
    showErrorDialog,
    setFilterState,
    setPaidMenuOpen,
    setRegisteredMenuOpen,
    setPoolMenuOpen,
    resetFilters,
    ...result,
  };
}

/**
 * One participant's row.
 *
 * The name Typography sits inside the sticky name cell, which sits inside the
 * row - so two steps up from the text. Nothing in the markup carries a test id
 * or role to key off instead.
 */
function rowFor(displayedName: string) {
  const nameCell = screen.getByText(displayedName).parentElement!;
  return nameCell.parentElement!;
}

const checkboxesIn = (displayedName: string) =>
  within(rowFor(displayedName)).getAllByRole('checkbox') as HTMLInputElement[];

const checkbox = (displayedName: string, column: number) =>
  checkboxesIn(displayedName)[column];

const button = (name: string) => screen.getByRole('button', { name });

describe('before a tournament is chosen', () => {
  it('says so instead of rendering an empty table', () => {
    renderCheckin({ startggTournament: EMPTY_TOURNAMENT });

    expect(screen.getByText('No tournament selected!')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search players')).not.toBeInTheDocument();
  });
});

describe('while a tournament is loading', () => {
  it('shows a spinner instead of the rows', () => {
    renderCheckin({ gettingTournament: true });

    expect(
      screen.getByText('Getting tournament attendees ...'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('keeps the header controls usable while it loads', () => {
    // The search box and the option columns stay put, so the header does not
    // jump around once the rows arrive.
    renderCheckin({ gettingTournament: true });

    expect(screen.getByLabelText('Search players')).toBeInTheDocument();
    // Two matches: the visible column heading, plus the off-screen copy the
    // component measures to size that column.
    expect(screen.getAllByText('Melee Singles')).toHaveLength(2);
  });
});

describe('the rows', () => {
  it('lists every unfiltered participant', () => {
    renderCheckin();

    ['TSM | Alice', 'Bob', 'Carol', 'Dave', 'Erin'].forEach((name) =>
      expect(screen.getByText(name)).toBeInTheDocument(),
    );
  });

  it('leaves out anyone the filter hid', () => {
    // The decision itself is made in the main process; the table just honours
    // the `filtered` flag it was handed.
    const tournament = nycMeleeTournament();
    tournament.participants[1].filtered = true;
    renderCheckin({ startggTournament: tournament });

    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('Carol')).toBeInTheDocument();
  });

  it('shows a sponsor prefix separated by a spaced pipe', () => {
    // Note the spaces. getVisibleParticipantsText writes "TSM|Alice" with none,
    // because that is start.gg's paste format; the search normalises the spacing
    // away so either form finds this row. See startgg.filters.test.ts.
    renderCheckin();

    expect(screen.getByText('TSM | Alice')).toBeInTheDocument();
  });

  it('shows a bare display name when there is no prefix', () => {
    renderCheckin();

    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('gives an event two checkboxes and the venue fee one', () => {
    renderCheckin();

    // 1 venue fee + 2 singles + 2 redemption.
    expect(checkboxesIn('Bob')).toHaveLength(5);
  });

  it('reflects each paid and added status', () => {
    renderCheckin();

    // Alice has paid for singles but not the venue fee.
    expect(checkbox('TSM | Alice', VENUE_PAID).checked).toBe(false);
    expect(checkbox('TSM | Alice', SINGLES_PAID).checked).toBe(true);
    expect(checkbox('TSM | Alice', SINGLES_ADDED).checked).toBe(true);
  });

  it('reads a missing status as unticked', () => {
    // Erin is redemption-only, so she has no singles entries at all.
    renderCheckin();

    expect(checkbox('Erin', SINGLES_PAID).checked).toBe(false);
    expect(checkbox('Erin', SINGLES_ADDED).checked).toBe(false);
    expect(checkbox('Erin', REDEMPTION_PAID).checked).toBe(false);
  });
});

describe('clicking a checkbox', () => {
  it('reports a paid toggle with the attendee and the option', async () => {
    const user = setupUser();
    renderCheckin();

    await user.click(checkbox('Bob', SINGLES_PAID));

    expect(electron.api.toggleParticipantPaid).toHaveBeenCalledWith(
      BOB,
      SINGLES,
    );
  });

  it('reports an added toggle with the attendee and the option', async () => {
    const user = setupUser();
    renderCheckin();

    await user.click(checkbox('Erin', SINGLES_ADDED));

    expect(electron.api.toggleParticipantAdded).toHaveBeenCalledWith(
      ERIN,
      SINGLES,
    );
  });

  it('reports the venue fee against the tournament option', async () => {
    const user = setupUser();
    renderCheckin();

    await user.click(checkbox('Bob', VENUE_PAID));

    expect(electron.api.toggleParticipantPaid).toHaveBeenCalledWith(
      BOB,
      VENUE_FEE,
    );
  });

  it('shows the message when a paid toggle fails', async () => {
    const user = setupUser();
    electron.api.toggleParticipantPaid.mockRejectedValue(
      new Error('401 - Unauthorized.'),
    );
    const { showErrorDialog } = renderCheckin();

    await user.click(checkbox('Bob', SINGLES_PAID));

    expect(showErrorDialog).toHaveBeenCalledWith(['401 - Unauthorized.']);
  });

  it('shows a non-Error rejection as-is', async () => {
    // The catch coerces with `e instanceof Error ? e.message : e`, so both arms
    // have to survive reaching the dialog.
    const user = setupUser();
    electron.api.toggleParticipantPaid.mockRejectedValue('something odd');
    const { showErrorDialog } = renderCheckin();

    await user.click(checkbox('Bob', SINGLES_PAID));

    expect(showErrorDialog).toHaveBeenCalledWith(['something odd']);
  });

  it('shows the message when a venue fee toggle fails', async () => {
    // The tournament-type column renders its own single checkbox with a
    // separate copy of the same handler, so it needs its own test.
    const user = setupUser();
    electron.api.toggleParticipantPaid.mockRejectedValue(
      new Error('venue fee failed'),
    );
    const { showErrorDialog } = renderCheckin();

    await user.click(checkbox('Bob', VENUE_PAID));

    expect(showErrorDialog).toHaveBeenCalledWith(['venue fee failed']);
  });

  it('shows a non-Error venue fee rejection as-is', async () => {
    const user = setupUser();
    electron.api.toggleParticipantPaid.mockRejectedValue('venue string');
    const { showErrorDialog } = renderCheckin();

    await user.click(checkbox('Bob', VENUE_PAID));

    expect(showErrorDialog).toHaveBeenCalledWith(['venue string']);
  });

  it('shows the message when an added toggle fails', async () => {
    const user = setupUser();
    electron.api.toggleParticipantAdded.mockRejectedValue(
      new Error('500 - Internal Server Error.'),
    );
    const { showErrorDialog } = renderCheckin();

    await user.click(checkbox('Bob', SINGLES_ADDED));

    expect(showErrorDialog).toHaveBeenCalledWith([
      '500 - Internal Server Error.',
    ]);
  });

  it('shows a non-Error added rejection as-is', async () => {
    const user = setupUser();
    electron.api.toggleParticipantAdded.mockRejectedValue('added string');
    const { showErrorDialog } = renderCheckin();

    await user.click(checkbox('Bob', SINGLES_ADDED));

    expect(showErrorDialog).toHaveBeenCalledWith(['added string']);
  });
});

describe('disabledReason', () => {
  const tournament = (overrides: Partial<Tournament> = {}) =>
    makeTournament({ updatingCheckboxes: [], ...overrides });
  const participant = makeParticipant({ id: ALICE });
  const event = makeRegistrationOption({ id: SINGLES, type: 'event' });
  const venueFee = makeRegistrationOption({
    id: VENUE_FEE,
    type: 'tournament',
  });

  it('reports an in-flight toggle', () => {
    const inFlight = tournament({
      updatingCheckboxes: [`${ALICE};${SINGLES}`],
    });

    expect(disabledReason(inFlight, participant, event, 'paid')).toBe(
      'Updating…',
    );
    expect(disabledReason(inFlight, participant, event, 'added')).toBe(
      'Updating…',
    );
  });

  it('only blocks the checkbox that is actually in flight', () => {
    const inFlight = tournament({
      updatingCheckboxes: [`${ALICE};${REDEMPTION}`],
    });

    expect(disabledReason(inFlight, participant, event, 'paid')).toBe('');
  });

  it('refuses to add anyone to an event that has started', () => {
    const started = makeRegistrationOption({
      id: SINGLES,
      type: 'event',
      started: true,
    });

    expect(disabledReason(tournament(), participant, started, 'added')).toBe(
      'EVENT STARTED — cannot add',
    );
  });

  it('allows adding to an event that has not started', () => {
    expect(disabledReason(tournament(), participant, event, 'added')).toBe('');
  });

  it('takes no payment for a free option', () => {
    const free = makeRegistrationOption({ id: SINGLES, free: true });

    expect(disabledReason(tournament(), participant, free, 'paid')).toBe(
      'FREE — no payment required',
    );
  });

  it('refuses payment from someone not already in a started event', () => {
    // Paying implies adding, and the bracket has already been generated.
    const started = makeRegistrationOption({
      id: SINGLES,
      type: 'event',
      started: true,
    });

    expect(disabledReason(tournament(), participant, started, 'paid')).toBe(
      'EVENT STARTED — cannot add',
    );
  });

  it('still takes payment from someone already in a started event', () => {
    // The non-obvious one, and the reason the registered check is there: if
    // they are already in the bracket, collecting their money adds nobody.
    const started = makeRegistrationOption({
      id: SINGLES,
      type: 'event',
      started: true,
    });
    const registered = makeParticipant({
      id: ALICE,
      registeredStatuses: { [SINGLES]: true },
    });

    expect(disabledReason(tournament(), registered, started, 'paid')).toBe('');
  });

  it('still takes the venue fee after events have started', () => {
    // `started` on a tournament option is meaningless - people pay the venue
    // fee at the door all night.
    const started = { ...venueFee, started: true };

    expect(disabledReason(tournament(), participant, started, 'paid')).toBe('');
  });

  it('allows an ordinary paid toggle', () => {
    expect(disabledReason(tournament(), participant, event, 'paid')).toBe('');
  });
});

describe('disabled checkboxes on screen', () => {
  it('locks both boxes of a cell while its toggle is in flight', () => {
    renderCheckin({ startggTournament: updatingTournament(ALICE, SINGLES) });

    expect(checkbox('TSM | Alice', SINGLES_PAID)).toBeDisabled();
    expect(checkbox('TSM | Alice', SINGLES_ADDED)).toBeDisabled();
  });

  it('leaves every other cell alone', () => {
    renderCheckin({ startggTournament: updatingTournament(ALICE, SINGLES) });

    expect(checkbox('TSM | Alice', VENUE_PAID)).toBeEnabled();
    expect(checkbox('TSM | Alice', REDEMPTION_PAID)).toBeEnabled();
    expect(checkbox('Bob', SINGLES_PAID)).toBeEnabled();
  });

  it('locks the add box once the event has started', () => {
    renderCheckin({ startggTournament: startedEventTournament() });

    expect(checkbox('Bob', SINGLES_ADDED)).toBeDisabled();
  });

  it('keeps paying open for someone already in the started event', () => {
    renderCheckin({ startggTournament: startedEventTournament() });

    // Bob is registered for singles, Erin is not.
    expect(checkbox('Bob', SINGLES_PAID)).toBeEnabled();
    expect(checkbox('Erin', SINGLES_PAID)).toBeDisabled();
  });

  it('locks payment for a free option', () => {
    renderCheckin({ startggTournament: freeOptionTournament() });

    expect(checkbox('Bob', SINGLES_PAID)).toBeDisabled();
    // Adding is still fine - it just costs nothing.
    expect(checkbox('Bob', SINGLES_ADDED)).toBeEnabled();
  });
});

describe('the header controls', () => {
  it('shows the current search text', () => {
    renderCheckin({ searchText: 'alice' });

    expect(screen.getByLabelText('Search players')).toHaveValue('alice');
  });

  it('reports the search once the typing stops, not once per keystroke', async () => {
    // The box holds its own text so that a keystroke costs one TextField rather
    // than the whole table, and reports upwards on a trailing debounce. What
    // must not lag is the text itself. The call count is asserted loosely rather
    // than as exactly one: a slow enough machine could let the debounce elapse
    // mid-word, which is correct behaviour, but nothing may make it per-character.
    const user = setupUser();
    const { setSearchText } = renderCheckin();
    const input = screen.getByLabelText('Search players');

    await user.type(input, 'abc');

    expect(input).toHaveValue('abc');
    await waitFor(() => expect(setSearchText).toHaveBeenLastCalledWith('abc'));
    expect(setSearchText.mock.calls.length).toBeLessThan(3);
  });

  it('copies the listed participants', async () => {
    const user = setupUser();
    const { copyFilteredParticipants } = renderCheckin();

    await user.click(button('Copy Listed Participants'));

    expect(copyFilteredParticipants).toHaveBeenCalledTimes(1);
  });

  it('clears every filter', async () => {
    const user = setupUser();
    const { resetFilters } = renderCheckin();

    await user.click(button('Clear all filters'));

    expect(resetFilters).toHaveBeenCalledTimes(1);
  });

  it('refetches the tournament and stops the spinner', async () => {
    const user = setupUser();
    const { setGettingTournament } = renderCheckin();

    await user.click(button('Refresh'));

    expect(electron.api.getStartggTournament).toHaveBeenCalledWith(
      'tournament/nyc-melee-100',
    );
    expect(setGettingTournament).toHaveBeenNthCalledWith(1, true);
    expect(setGettingTournament).toHaveBeenNthCalledWith(2, false);
  });

  it('stops the spinner when a refresh fails', async () => {
    // The spinner replaces the whole table with "Getting tournament attendees
    // ...", so leaving it up after a failure takes the screen away mid-event.
    // The error dialog is not a substitute - it is dismissed, and then there is
    // nothing behind it.
    const user = setupUser();
    electron.api.getStartggTournament.mockRejectedValue(new Error('offline'));
    const { setGettingTournament, showErrorDialog } = renderCheckin();

    await user.click(button('Refresh'));

    expect(showErrorDialog).toHaveBeenCalledWith(['offline']);
    expect(setGettingTournament).toHaveBeenLastCalledWith(false);
  });

  it('shows a non-Error refresh rejection as-is', async () => {
    const user = setupUser();
    electron.api.getStartggTournament.mockRejectedValue('refresh string');
    const { showErrorDialog } = renderCheckin();

    await user.click(button('Refresh'));

    expect(showErrorDialog).toHaveBeenCalledWith(['refresh string']);
  });
});

describe('the filter menus', () => {
  it('offers one filter button for the venue fee and three per pooled event', () => {
    renderCheckin();

    // venue fee paid + singles paid/added/pool + redemption paid/added/pool.
    expect(
      screen.getAllByRole('button', { name: 'Apply Filter' }),
    ).toHaveLength(7);
  });

  it('labels the paid and added filters', () => {
    renderCheckin();

    // venue fee + singles + redemption.
    expect(screen.getAllByText('Paid')).toHaveLength(3);
    expect(screen.getAllByText('Added')).toHaveLength(2);
  });

  it('opens the pool menu from the Pool column', async () => {
    const user = setupUser();
    const { setPoolMenuOpen } = renderCheckin();

    const filters = screen.getAllByRole('button', { name: 'Apply Filter' });
    await user.click(filters[3]); // singles "pool"

    const update = setPoolMenuOpen.mock.calls[0][0] as (
      prev: Record<Id, boolean>,
    ) => Record<Id, boolean>;
    expect(update({})).toEqual({ [SINGLES]: true });
  });

  it('opens the paid menu for the column that was clicked', async () => {
    const user = setupUser();
    const { setPaidMenuOpen } = renderCheckin();

    const [venueFilter] = screen.getAllByRole('button', {
      name: 'Apply Filter',
    });
    await user.click(venueFilter);

    const update = setPaidMenuOpen.mock.calls[0][0] as (
      prev: Record<Id, boolean>,
    ) => Record<Id, boolean>;
    expect(update({})).toEqual({ [VENUE_FEE]: true });
  });

  it('opens the added menu from the second button of an event column', async () => {
    const user = setupUser();
    const { setRegisteredMenuOpen } = renderCheckin();

    const filters = screen.getAllByRole('button', { name: 'Apply Filter' });
    await user.click(filters[2]); // singles "added"

    const update = setRegisteredMenuOpen.mock.calls[0][0] as (
      prev: Record<Id, boolean>,
    ) => Record<Id, boolean>;
    expect(update({})).toEqual({ [SINGLES]: true });
  });

  it('closes the menu again when it is dismissed', async () => {
    const user = setupUser();
    const { setPaidMenuOpen } = renderCheckin({
      paidMenuOpen: { [VENUE_FEE]: true },
    });

    await user.keyboard('{Escape}');

    const update = setPaidMenuOpen.mock.calls[0][0] as (
      prev: Record<Id, boolean>,
    ) => Record<Id, boolean>;
    expect(update({ [VENUE_FEE]: true })).toEqual({ [VENUE_FEE]: false });
  });

  it('records a paid filter change against the right option', async () => {
    const user = setupUser();
    const { setFilterState } = renderCheckin({
      paidMenuOpen: { [SINGLES]: true },
    });

    await user.click(screen.getByRole('checkbox', { name: 'Paid' }));

    const update = setFilterState.mock.calls[0][0] as (
      prev: Record<Id, FilterState>,
    ) => Record<Id, FilterState>;
    expect(update({})[SINGLES]).toEqual({
      paid: NullableBoolean.Include,
      added: NullableBoolean.Indeterminate,
      pools: {},
    });
  });

  it('records an added filter change against the right option', async () => {
    const user = setupUser();
    const { setFilterState } = renderCheckin({
      registeredMenuOpen: { [SINGLES]: true },
    });

    await user.click(screen.getByRole('checkbox', { name: 'Added' }));

    const update = setFilterState.mock.calls[0][0] as (
      prev: Record<Id, FilterState>,
    ) => Record<Id, FilterState>;
    expect(update({})[SINGLES].added).toBe(NullableBoolean.Include);
  });

  it('records a pool change without disturbing the other filters', async () => {
    const user = setupUser();
    const existing = {
      [SINGLES]: {
        paid: NullableBoolean.Include,
        added: NullableBoolean.Indeterminate,
        pools: { [POOL_A.id]: true, [POOL_B.id]: true },
      },
    };
    const { setFilterState } = renderCheckin({
      poolMenuOpen: { [SINGLES]: true },
      filterState: existing,
    });

    await user.click(screen.getByRole('checkbox', { name: 'Pools 1' }));

    const update = setFilterState.mock.calls[0][0] as (
      prev: Record<Id, FilterState>,
    ) => Record<Id, FilterState>;
    const next = update(existing)[SINGLES];
    expect(next.pools).toEqual({ [POOL_A.id]: false, [POOL_B.id]: true });
    expect(next.paid).toBe(NullableBoolean.Include);
  });

  it('shows the option filter state it was given', () => {
    renderCheckin({
      paidMenuOpen: { [SINGLES]: true },
      filterState: {
        [SINGLES]: {
          paid: NullableBoolean.Include,
          added: NullableBoolean.Indeterminate,
          pools: {},
        },
      },
    });

    expect(
      (screen.getByRole('checkbox', { name: 'Paid' }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it('falls back to a blank filter for an option with no state yet', () => {
    renderCheckin({ paidMenuOpen: { [SINGLES]: true }, filterState: {} });

    const paid = screen.getByRole('checkbox', {
      name: 'Paid',
    }) as HTMLInputElement;
    expect(paid.checked).toBe(false);
    expect(paid.getAttribute('data-indeterminate')).toBe('true');
  });

  it('renders an added menu for an event that has no pools yet', () => {
    // registrationOption.pools is `?? []`-guarded; a bracket that has not been
    // seeded must not take the menu down with it.
    const tournament = nycMeleeTournament();
    delete tournament.registrationOptions[1].pools;
    renderCheckin({
      startggTournament: tournament,
      registeredMenuOpen: { [SINGLES]: true },
    });

    expect(screen.getByRole('checkbox', { name: 'Added' })).toBeInTheDocument();
    expect(
      screen.queryByRole('checkbox', { name: 'Pools' }),
    ).not.toBeInTheDocument();
  });

  it('renders a pool column next to events with pools configured', () => {
    renderCheckin();
    const poolHeaders = screen
      .getAllByText('Pool')
      .filter((el) => el.closest('[data-pool-header]'));
    // Both Melee Singles and Redemption Bracket have pools
    expect(poolHeaders).toHaveLength(2);

    // Bob is in Singles Pool 1 and unseeded in Redemption
    const bobRow = rowFor('Bob');
    expect(within(bobRow).getByText('1')).toBeInTheDocument();
  });

  it('omits the pool column for events that do not have pools configured', () => {
    const tournament = nycMeleeTournament();
    delete tournament.registrationOptions[1].pools;
    delete tournament.registrationOptions[2].pools;
    renderCheckin({ startggTournament: tournament });

    expect(screen.queryByText('Pool')).not.toBeInTheDocument();
  });
});
