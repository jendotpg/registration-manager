/**
 * applyFilters: which of the five NYC Melee participants stay visible.
 *
 * This is the densest branching in the codebase, and the highest-stakes: the
 * table is what somebody at a desk reads to decide whether a person in front of
 * them has paid. A filter that hides the wrong person turns into an argument at
 * the venue, so the awkward arms get named tests rather than being folded into a
 * matrix.
 *
 * The end-to-end pool-filter and copy-text cases live in startgg.test.ts; this
 * file covers what makes a filter count as active in the first place, and how
 * the search text is matched.
 *
 * @jest-environment node
 */
import { FilterState, NullableBoolean } from '../common/types';
import { VENUE_FEE_REG_VALUE_ID } from '../__fixtures__/startgg';
import { loadNycMelee, REDEMPTION, SINGLES } from '../__fixtures__/nycMelee';
import { installSyntheticTimers } from '../__fixtures__/timers';

const { Include, Exclude, Indeterminate } = NullableBoolean;

const loadStartgg = () =>
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  require('../main/startgg') as typeof import('../main/startgg');

let timers: ReturnType<typeof installSyntheticTimers>;

beforeEach(() => {
  jest.resetModules();
  timers = installSyntheticTimers();
});

afterEach(() => {
  timers.restore();
  jest.restoreAllMocks();
});

/** A filter state with everything inert unless overridden. */
const filter = (overrides: Partial<FilterState> = {}): FilterState => ({
  paid: Indeterminate,
  added: Indeterminate,
  pools: {},
  ...overrides,
});

const POOL_A = 5001;
const POOL_B = 5002;
const UNSEEDED = -1;

/** Load NYC Melee, apply a filter, and report who survives, in order. */
async function visibleAfter(
  filters: Record<number, FilterState>,
  searchText = '',
) {
  const { startgg } = await loadNycMelee();
  startgg.updateParticipantsFiltered(searchText, filters);
  return startgg
    .getCurrentTournament()!
    .participants.filter((participant) => !participant.filtered)
    .map((participant) => participant.displayName);
}

const EVERYONE = ['Alice', 'Bob', 'Carol', 'Dave', 'Erin'];

describe('what counts as an active filter', () => {
  it('shows everyone when nothing is set', async () => {
    await expect(visibleAfter({})).resolves.toEqual(EVERYONE);
  });

  it('shows everyone when a filter is present but entirely inert', async () => {
    await expect(visibleAfter({ [SINGLES]: filter() })).resolves.toEqual(
      EVERYONE,
    );
  });

  it('applies a paid filter on an event', async () => {
    // Alice is the only one who has paid for singles.
    await expect(
      visibleAfter({ [SINGLES]: filter({ paid: Include }) }),
    ).resolves.toEqual(['Alice']);
  });

  it('applies a paid filter on the venue fee, which is not an event', async () => {
    // The paid arm deliberately does not require an event option - the venue fee
    // is the single most filtered-on column at a real desk.
    await expect(
      visibleAfter({ [VENUE_FEE_REG_VALUE_ID]: filter({ paid: Include }) }),
    ).resolves.toEqual([]);

    await expect(
      visibleAfter({ [VENUE_FEE_REG_VALUE_ID]: filter({ paid: Exclude }) }),
    ).resolves.toEqual(EVERYONE);
  });

  it('applies an added filter on an event', async () => {
    // Erin is redemption-only, so she is not added to singles.
    await expect(
      visibleAfter({ [SINGLES]: filter({ added: Include }) }),
    ).resolves.toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });

  it('ignores an added filter set on the venue fee', async () => {
    // "Added" is meaningless for a tournament-level option, so the activation
    // check requires an event. Nobody is registered for the venue fee, so if
    // this ever became active it would hide the entire table.
    await expect(
      visibleAfter({ [VENUE_FEE_REG_VALUE_ID]: filter({ added: Include }) }),
    ).resolves.toEqual(EVERYONE);
  });

  it('ignores a pool filter set on the venue fee', async () => {
    // Same reasoning: a tournament option has no pools to filter by.
    await expect(
      visibleAfter({
        [VENUE_FEE_REG_VALUE_ID]: filter({ pools: { [POOL_A]: false } }),
      }),
    ).resolves.toEqual(EVERYONE);
  });

  it('applies a pool filter on an event', async () => {
    await expect(
      visibleAfter({
        [SINGLES]: filter({
          pools: { [POOL_A]: false, [POOL_B]: true, [UNSEEDED]: true },
        }),
      }),
    ).resolves.toEqual(['Carol', 'Dave', 'Erin']);
  });

  it('treats a filter for an option that no longer exists as paid-only', async () => {
    // Left-over state after a tournament swap. The id is not in the option list,
    // so `added` is ignored, but `paid` still activates - and nobody has a paid
    // status under an unknown id.
    await expect(
      visibleAfter({ 999999: filter({ added: Include }) }),
    ).resolves.toEqual(EVERYONE);

    await expect(
      visibleAfter({ 999999: filter({ paid: Include }) }),
    ).resolves.toEqual([]);
  });
});

describe('poolFilterActive', () => {
  it('is inert with no pool record at all', async () => {
    await expect(
      visibleAfter({ [SINGLES]: filter({ pools: {} }) }),
    ).resolves.toEqual(EVERYONE);
  });

  it('is inert while every box is ticked', async () => {
    await expect(
      visibleAfter({
        [SINGLES]: filter({
          pools: { [POOL_A]: true, [POOL_B]: true, [UNSEEDED]: true },
        }),
      }),
    ).resolves.toEqual(EVERYONE);
  });

  it('activates as soon as one box is unticked', async () => {
    await expect(
      visibleAfter({
        [SINGLES]: filter({
          pools: { [POOL_A]: true, [POOL_B]: true, [UNSEEDED]: false },
        }),
      }),
    ).resolves.toEqual(['Alice', 'Bob', 'Carol']);
  });

  it('hides someone whose pool is missing from the record entirely', async () => {
    // An unlisted pool reads as unticked, so a stale record hides people rather
    // than showing them. Worth knowing, since it fails toward hiding.
    await expect(
      visibleAfter({ [SINGLES]: filter({ pools: { [POOL_A]: false } }) }),
    ).resolves.toEqual([]);
  });
});

describe('matching one participant', () => {
  it.each([
    { label: 'Include', paid: Include, expected: ['Alice'] },
    {
      label: 'Exclude',
      paid: Exclude,
      expected: ['Bob', 'Carol', 'Dave', 'Erin'],
    },
    { label: 'Indeterminate', paid: Indeterminate, expected: EVERYONE },
  ])('paid $label on singles keeps $expected', async ({ paid, expected }) => {
    await expect(
      visibleAfter({ [SINGLES]: filter({ paid }) }),
    ).resolves.toEqual(expected);
  });

  it('reads an absent paid status as unpaid, not as unknown', async () => {
    // Erin has no singles registration at all, so paidStatuses[SINGLES] is
    // undefined. `!!undefined` is false, which means she matches Exclude.
    const excluded = await visibleAfter({
      [SINGLES]: filter({ paid: Exclude }),
    });
    expect(excluded).toContain('Erin');

    const included = await visibleAfter({
      [SINGLES]: filter({ paid: Include }),
    });
    expect(included).not.toContain('Erin');
  });

  it('requires every active filter to match, not just one', async () => {
    // Paid for singles AND added to redemption: Alice passes the first and
    // fails the second, Erin the other way round, so nobody survives.
    await expect(
      visibleAfter({
        [SINGLES]: filter({ paid: Include }),
        [REDEMPTION]: filter({ added: Include }),
      }),
    ).resolves.toEqual([]);
  });

  it('combines filters across two events for someone who satisfies both', async () => {
    await expect(
      visibleAfter({
        [SINGLES]: filter({ added: Include }),
        [REDEMPTION]: filter({ added: Exclude }),
      }),
    ).resolves.toEqual(['Alice', 'Bob', 'Carol', 'Dave']);
  });
});

describe('the search box', () => {
  it('shows everyone when the search is empty', async () => {
    await expect(visibleAfter({}, '')).resolves.toEqual(EVERYONE);
  });

  it('matches part of a display name, case-insensitively', async () => {
    await expect(visibleAfter({}, 'ALI')).resolves.toEqual(['Alice']);
    await expect(visibleAfter({}, 'ali')).resolves.toEqual(['Alice']);
  });

  it('matches on the sponsor prefix', async () => {
    await expect(visibleAfter({}, 'tsm')).resolves.toEqual(['Alice']);
  });

  it('matches across the pipe that joins prefix and name', async () => {
    await expect(visibleAfter({}, 'TSM|Ali')).resolves.toEqual(['Alice']);
  });

  it('matches the spaced form the table actually displays', async () => {
    // The table renders "TSM | Alice" with spaces around the pipe. Typing what
    // is on screen has to find the person on screen.
    await expect(visibleAfter({}, 'TSM | Ali')).resolves.toEqual(['Alice']);
  });

  it('shows nobody when nothing matches', async () => {
    await expect(visibleAfter({}, 'zzz')).resolves.toEqual([]);
  });

  it('narrows an already-filtered list rather than replacing it', async () => {
    await expect(
      visibleAfter({ [SINGLES]: filter({ added: Include }) }, 'a'),
    ).resolves.toEqual(['Alice', 'Carol', 'Dave']);
  });

  it('can rule out everyone the filter allowed', async () => {
    await expect(
      visibleAfter({ [SINGLES]: filter({ paid: Include }) }, 'bob'),
    ).resolves.toEqual([]);
  });
});

describe('updateParticipantsFiltered', () => {
  it('does nothing before a tournament is loaded', () => {
    const startgg = loadStartgg();

    expect(() => startgg.updateParticipantsFiltered('alice', {})).not.toThrow();
    expect(startgg.getCurrentTournament()).toBeUndefined();
  });

  it('remembers the search so a later re-filter still applies it', async () => {
    const { startgg } = await loadNycMelee();
    startgg.updateParticipantsFiltered('alice', {});

    // Toggling re-runs applyFilters for one participant using the stored search.
    await startgg.toggleParticipantPaid(2, SINGLES);

    expect(
      startgg.getCurrentTournament()!.participants.find((p) => p.id === 2)!
        .filtered,
    ).toBe(true);
  });
});
