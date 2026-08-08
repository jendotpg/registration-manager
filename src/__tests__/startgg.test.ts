/**
 * Main process tests for the start.gg layer, driven entirely by fixtures over
 * a mocked global.fetch - no cookies and no network.
 *
 * startgg.ts keeps module-global state (currentTournament, venueFeeOption,
 * currentFilters), so every test re-imports it through a fresh module registry.
 *
 * @jest-environment node
 */
import type { Cookie } from 'electron';
import {
  DEFAULT_FILTER_STATE,
  FilterState,
  Id,
  NullableBoolean,
  UNSEEDED_POOL_ID,
} from '../common/types';
import {
  eventsResponse,
  LOGGED_OUT_RESPONSE,
  mockGql,
  participantsResponse,
  poolsResponse,
  FakePoolEvent,
} from '../__fixtures__/startgg';
import capturedEvents from '../__fixtures__/captured/tournamentEvents.json';
import capturedParticipants from '../__fixtures__/captured/tournamentParticipants.json';
import capturedPools from '../__fixtures__/captured/tournamentPools.json';

const COOKIES: Cookie[] = [{ name: 'session', value: 'fake' } as Cookie];

const SINGLES = 111;
const REDEMPTION = 222;

// eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
const loadStartgg = () =>
  require('../main/startgg') as typeof import('../main/startgg');

/** Every delay the throttle asked for, in order. */
let requestedSleeps: number[] = [];
const sleepDurations = () => requestedSleeps;

beforeEach(() => {
  jest.resetModules();
  requestedSleeps = [];
  // Record and collapse the throttle's breather. Nothing else on these code
  // paths schedules work (wrappedFetch only retries on 5xx, which the fixtures
  // never return), so firing every timeout immediately is safe - and it keeps
  // the cap tests from spending real seconds asleep.
  jest.spyOn(global, 'setTimeout').mockImplementation(((
    callback: () => void,
    ms: number,
  ) => {
    requestedSleeps.push(ms);
    callback();
    return 0;
  }) as unknown as typeof setTimeout);
});

afterEach(() => {
  jest.restoreAllMocks();
});

/**
 * The NYC Melee shape: singles with two seeded pools plus a beast bracket that
 * is itself seeded with the entrants who progressed out of those pools.
 */
function nycMeleePools(): FakePoolEvent[] {
  return [
    {
      id: SINGLES,
      pools: [
        { id: 5001, phase: 'Pools', name: '1', entrantIds: [11, 12] },
        { id: 5002, phase: 'Pools', name: '2', entrantIds: [13] },
        {
          id: 5003,
          phase: 'Top 16 (Beast Bracket)',
          phaseOrder: 2,
          name: '1',
          entrantIds: [11, 13],
        },
      ],
    },
    {
      id: REDEMPTION,
      pools: [{ id: 6001, phase: 'Redemption', name: '1', entrantIds: [21] }],
    },
  ];
}

const NYC_MELEE_PARTICIPANTS = [
  {
    id: 1,
    gamerTag: 'Alice',
    prefix: 'TSM',
    entrantIds: [11],
    eventIds: [SINGLES],
    paidEventIds: [SINGLES],
  },
  { id: 2, gamerTag: 'Bob', entrantIds: [12], eventIds: [SINGLES] },
  { id: 3, gamerTag: 'Carol', entrantIds: [13], eventIds: [SINGLES] },
  // Registered for singles but never seeded.
  { id: 4, gamerTag: 'Dave', entrantIds: [14], eventIds: [SINGLES] },
  // Redemption only.
  { id: 5, gamerTag: 'Erin', entrantIds: [21], eventIds: [REDEMPTION] },
];

function mockNycMelee(overrides: { poolEvents?: FakePoolEvent[] } = {}) {
  return mockGql({
    TournamentEvents: () =>
      eventsResponse([
        { id: SINGLES, name: 'Melee Singles' },
        { id: REDEMPTION, name: 'Redemption Bracket' },
      ]),
    TournamentParticipants: () => participantsResponse(NYC_MELEE_PARTICIPANTS),
    TournamentPools: (variables) =>
      poolsResponse(overrides.poolEvents ?? nycMeleePools(), {
        name: 'NYC Melee 100',
        slug: 'tournament/nyc-melee-100',
        groupPage: variables.groupPage,
        seedPage: variables.seedPage,
      }),
  });
}

function optionFor(registrationOptions: any[], id: Id) {
  return registrationOptions.find((option) => option.id === id);
}

describe('getRegistration', () => {
  it('assembles pools per event and assigns them by entrant id', async () => {
    const gql = mockNycMelee();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'nyc-melee-100');

    expect(registration).toBeDefined();
    // name/slug now come from the pools query, not the events query.
    expect(registration!.name).toBe('NYC Melee 100');
    expect(registration!.slug).toBe('tournament/nyc-melee-100');

    const singles = optionFor(registration!.registrationOptions, SINGLES);
    expect(singles.pools).toEqual([
      { id: 5001, phase: 'Pools', name: '1' },
      { id: 5002, phase: 'Pools', name: '2' },
      { id: UNSEEDED_POOL_ID, phase: 'Unseeded', name: '' },
    ]);

    const redemption = optionFor(registration!.registrationOptions, REDEMPTION);
    expect(redemption.pools).toEqual([
      { id: 6001, phase: 'Redemption', name: '1' },
      { id: UNSEEDED_POOL_ID, phase: 'Unseeded', name: '' },
    ]);

    const byName = Object.fromEntries(
      registration!.participants.map((p) => [p.displayName, p]),
    );
    expect(byName.Alice.pools[SINGLES].id).toBe(5001);
    expect(byName.Bob.pools[SINGLES].id).toBe(5001);
    expect(byName.Carol.pools[SINGLES].id).toBe(5002);
    expect(byName.Dave.pools[SINGLES]).toBeUndefined();
    expect(byName.Erin.pools[REDEMPTION].id).toBe(6001);

    // One request per query in the common case.
    expect(gql.callsTo('TournamentPools')).toHaveLength(1);
  });

  it('drops later phases even though their progression seeds exist', async () => {
    mockNycMelee();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'nyc-melee-100');
    const singles = optionFor(registration!.registrationOptions, SINGLES);

    expect(singles.pools.map((pool: any) => pool.id)).not.toContain(5003);

    // Entrants 11 and 13 are seeded into the beast bracket too. They must keep
    // the pool they actually played, not the bracket they advanced to.
    const byName = Object.fromEntries(
      registration!.participants.map((p) => [p.displayName, p]),
    );
    expect(byName.Alice.pools[SINGLES].id).toBe(5001);
    expect(byName.Carol.pools[SINGLES].id).toBe(5002);
  });

  it('never stores a pool that has no seeds', async () => {
    mockNycMelee({
      poolEvents: [
        {
          id: SINGLES,
          pools: [
            { id: 5001, phase: 'Pools', name: '1', entrantIds: [11, 12] },
            // Created but not yet seeded, in the same first phase.
            { id: 5002, phase: 'Pools', name: '2', entrantIds: [] },
          ],
        },
        { id: REDEMPTION, pools: [] },
      ],
    });
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'nyc-melee-100');
    const singles = optionFor(registration!.registrationOptions, SINGLES);

    expect(singles.pools.map((pool: any) => pool.id)).toEqual([
      5001,
      UNSEEDED_POOL_ID,
    ]);
  });

  it('leaves tournament-type options without pools', async () => {
    mockNycMelee();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'nyc-melee-100');
    const venueFee = registration!.registrationOptions.find(
      (option) => option.type === 'tournament',
    );

    expect(venueFee).toBeDefined();
    expect(venueFee!.pools).toBeUndefined();
  });

  it('omits Unseeded for an event with no seeded pools at all', async () => {
    mockNycMelee({
      poolEvents: [
        {
          id: SINGLES,
          pools: [{ id: 5003, phase: 'Pools', name: '1', entrantIds: [] }],
        },
        { id: REDEMPTION, pools: [] },
      ],
    });
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'nyc-melee-100');

    expect(optionFor(registration!.registrationOptions, SINGLES).pools).toEqual(
      [],
    );
    expect(
      optionFor(registration!.registrationOptions, REDEMPTION).pools,
    ).toEqual([]);
  });

  it('assigns one entrant to every participant on it (doubles)', async () => {
    mockGql({
      TournamentEvents: () =>
        eventsResponse([{ id: SINGLES, name: 'Melee Doubles' }]),
      TournamentParticipants: () =>
        participantsResponse([
          { id: 1, gamerTag: 'Alice', entrantIds: [99], eventIds: [SINGLES] },
          { id: 2, gamerTag: 'Bob', entrantIds: [99], eventIds: [SINGLES] },
        ]),
      TournamentPools: (variables) =>
        poolsResponse(
          [
            {
              id: SINGLES,
              pools: [
                { id: 5001, phase: 'Pools', name: '1', entrantIds: [99] },
              ],
            },
          ],
          { groupPage: variables.groupPage, seedPage: variables.seedPage },
        ),
    });
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'doubles');

    expect(registration!.participants.map((p) => p.pools[SINGLES]?.id)).toEqual(
      [5001, 5001],
    );
  });

  it('returns undefined when the pool sweep comes back logged out', async () => {
    mockGql({
      TournamentEvents: () =>
        eventsResponse([{ id: SINGLES, name: 'Melee Singles' }]),
      TournamentParticipants: () =>
        participantsResponse([
          { id: 1, gamerTag: 'Alice', entrantIds: [11], eventIds: [SINGLES] },
        ]),
      TournamentPools: () => LOGGED_OUT_RESPONSE,
    });
    const { getRegistration } = loadStartgg();

    await expect(
      getRegistration(COOKIES, 'nyc-melee-100'),
    ).resolves.toBeUndefined();
  });
});

// Real responses from NYCMelee's Stock Exchange #60. See the fixtures README
// for the one hand-edit (phase.id / phase.phaseOrder, added after capture).
describe('against captured start.gg responses', () => {
  const CAPTURED_SINGLES = 1682236;
  const CAPTURED_REDEMPTION = 1682237;

  function mockCaptured() {
    return mockGql({
      TournamentEvents: () => capturedEvents,
      TournamentParticipants: () => capturedParticipants,
      TournamentPools: () => capturedPools,
    });
  }

  it('reads the tournament and its registration options', async () => {
    mockCaptured();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'x');

    expect(registration!.name).toBe("NYCMelee's Stock Exchange #60");
    expect(registration!.slug).toBe('tournament/nycmelee-s-stock-exchange-60');
    expect(
      registration!.registrationOptions.map(({ id, name, type }) => ({
        id,
        name,
        type,
      })),
    ).toEqual([
      { id: 6484088, name: 'Venue Fee', type: 'tournament' },
      { id: CAPTURED_SINGLES, name: 'Melee Singles', type: 'event' },
      { id: CAPTURED_REDEMPTION, name: 'Redemption Bracket', type: 'event' },
    ]);
    expect(registration!.participants).toHaveLength(61);
  });

  it('keeps only the first phase, dropping the seeded beast bracket', async () => {
    mockCaptured();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'x');

    expect(
      optionFor(registration!.registrationOptions, CAPTURED_SINGLES).pools,
    ).toEqual([
      { id: 3410359, phase: 'Bracket', name: '1' },
      { id: 3410360, phase: 'Bracket', name: '2' },
      { id: UNSEEDED_POOL_ID, phase: 'Unseeded', name: '' },
    ]);
    expect(
      optionFor(registration!.registrationOptions, CAPTURED_REDEMPTION).pools,
    ).toEqual([
      { id: 3410362, phase: 'Bracket', name: '1' },
      { id: UNSEEDED_POOL_ID, phase: 'Unseeded', name: '' },
    ]);
  });

  it('gives progressed players their real pool, not the beast bracket', async () => {
    mockCaptured();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'x');
    const byTag = Object.fromEntries(
      registration!.participants.map((p) => [p.displayName, p]),
    );

    // Epoodle (entrant 24306599) is seeded in Bracket 1 and in the beast
    // bracket. Bigcoyotes (24305460) likewise, but in Bracket 2.
    expect(byTag.Epoodle.pools[CAPTURED_SINGLES]).toEqual({
      id: 3410359,
      phase: 'Bracket',
      name: '1',
    });
    expect(byTag.Bigcoyotes.pools[CAPTURED_SINGLES]).toEqual({
      id: 3410360,
      phase: 'Bracket',
      name: '2',
    });
  });

  it('resolves a participant to a different pool in each event', async () => {
    mockCaptured();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'x');
    const strawman = registration!.participants.find(
      (p) => p.displayName === 'Strawman',
    )!;

    // Entrant 24313088 in singles, 24313819 in redemption.
    expect(strawman.pools[CAPTURED_SINGLES].id).toBe(3410359);
    expect(strawman.pools[CAPTURED_REDEMPTION].id).toBe(3410362);
  });

  it('normalizes a null prefix to an empty string', async () => {
    mockCaptured();
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'x');
    const surreal = registration!.participants.find(
      (p) => p.displayName === 'surreal',
    )!;

    // The capture has "prefix": null here, which would otherwise leak into the
    // search haystack as the literal string "null".
    expect(surreal.prefix).toBe('');
  });

  it('needs three requests and never waits for a tournament this size', async () => {
    const gql = mockCaptured();
    const { getRegistration } = loadStartgg();

    await getRegistration(COOKIES, 'x');

    expect(gql.calls).toHaveLength(3);
    // Not incidental: a normal tournament finishing without a single breather
    // is the point of the free window. If shrinking FREE_REQUESTS breaks this,
    // the guarantee is what broke, not the test.
    expect(sleepDurations()).toEqual([]);
  });

  it('shows the redemption-only players under Unseeded in singles', async () => {
    mockCaptured();
    const startgg = loadStartgg();
    await startgg.getTournament(COOKIES, 'x');

    const tournament = startgg.getCurrentTournament()!;
    startgg.updateParticipantsFiltered('', {
      [CAPTURED_SINGLES]: {
        ...DEFAULT_FILTER_STATE,
        pools: { 3410359: false, 3410360: false, [UNSEEDED_POOL_ID]: true },
      },
    });

    // All 59 singles entrants are seeded, so the only people without a singles
    // pool are surreal and SHED|ssjruben, who only entered redemption.
    expect(
      startgg
        .getCurrentTournament()!
        .participants.filter((participant) => !participant.filtered)
        .map((participant) => participant.displayName),
    ).toEqual(['surreal', 'ssjruben']);
    expect(tournament.participants).toHaveLength(61);
  });
});

describe('pool pagination', () => {
  /** Forces both axes to paginate: 2 groups at 1/page, 2 seeds at 1/page. */
  const TINY_PAGE_EVENTS: FakePoolEvent[] = [
    {
      id: SINGLES,
      pools: [
        { id: 5001, phase: 'Pools', name: '1', entrantIds: [11, 12] },
        { id: 5002, phase: 'Pools', name: '2', entrantIds: [13] },
      ],
    },
  ];

  function mockPaginated(perPage: number) {
    return mockGql({
      TournamentEvents: () =>
        eventsResponse([{ id: SINGLES, name: 'Melee Singles' }]),
      TournamentParticipants: () =>
        participantsResponse([
          { id: 1, gamerTag: 'Alice', entrantIds: [11], eventIds: [SINGLES] },
          { id: 2, gamerTag: 'Bob', entrantIds: [12], eventIds: [SINGLES] },
          { id: 3, gamerTag: 'Carol', entrantIds: [13], eventIds: [SINGLES] },
        ]),
      TournamentPools: (variables) =>
        poolsResponse(TINY_PAGE_EVENTS, {
          groupPage: variables.groupPage,
          groupPerPage: perPage,
          seedPage: variables.seedPage,
          seedPerPage: perPage,
        }),
    });
  }

  it('sweeps both axes without duplicating pools', async () => {
    const gql = mockPaginated(1);
    const { getRegistration } = loadStartgg();

    const registration = await getRegistration(COOKIES, 'nyc-melee-100');
    const singles = optionFor(registration!.registrationOptions, SINGLES);

    expect(singles.pools).toEqual([
      { id: 5001, phase: 'Pools', name: '1' },
      { id: 5002, phase: 'Pools', name: '2' },
      { id: UNSEEDED_POOL_ID, phase: 'Unseeded', name: '' },
    ]);

    const byName = Object.fromEntries(
      registration!.participants.map((p) => [p.displayName, p]),
    );
    // Bob's seed only exists on seed page 2 of group page 1.
    expect(byName.Alice.pools[SINGLES].id).toBe(5001);
    expect(byName.Bob.pools[SINGLES].id).toBe(5001);
    expect(byName.Carol.pools[SINGLES].id).toBe(5002);

    // group page 1 x seed pages 1-2, then group page 2 x seed page 1.
    expect(
      gql
        .callsTo('TournamentPools')
        .map(({ variables }) => [variables.groupPage, variables.seedPage]),
    ).toEqual([
      [1, 1],
      [1, 2],
      [2, 1],
    ]);
  });

  it('throws instead of looping when the API lies about its pagination', async () => {
    const gql = mockGql({
      TournamentEvents: () =>
        eventsResponse([{ id: SINGLES, name: 'Melee Singles' }]),
      TournamentParticipants: () =>
        participantsResponse([
          { id: 1, gamerTag: 'Alice', entrantIds: [11], eventIds: [SINGLES] },
        ]),
      // Always claims 99 seed pages regardless of which page was asked for.
      TournamentPools: () => {
        const response: any = poolsResponse([
          {
            id: SINGLES,
            pools: [{ id: 5001, phase: 'Pools', name: '1', entrantIds: [11] }],
          },
        ]);
        response.tournament.events[0].paginatedPhaseGroups.nodes[0].seeds.pageInfo.totalPages = 99;
        return response;
      },
    });
    const { getRegistration } = loadStartgg();

    const error: Error = await getRegistration(COOKIES, 'liar').then(
      () => {
        throw new Error('expected the sweep to give up');
      },
      (thrown) => thrown,
    );
    expect(error.message).toMatch(/pages of seeds/);

    // Stops at the cap rather than grinding through the 99 pages it was
    // promised. The cap is read back out of the error rather than hardcoded so
    // that retuning MAX_POOL_PAGES doesn't break this - what's under test is
    // "stops at exactly the limit it reports", not the limit's value.
    const cap = Number(/more than (\d+) pages/.exec(error.message)![1]);
    expect(cap).toBeGreaterThan(0);
    expect(gql.callsTo('TournamentPools')).toHaveLength(cap);
  });

  it('grants a free window, then ramps 50ms up to 300ms and holds', async () => {
    const gql = mockGql({
      TournamentEvents: () =>
        eventsResponse([{ id: SINGLES, name: 'Melee Singles' }]),
      // Unbounded pages, so the sweep runs until MAX_PARTICIPANT_PAGES stops
      // it. That saturates the ramp whatever those two knobs are set to; the
      // resulting throw is expected and irrelevant here.
      TournamentParticipants: (variables) =>
        participantsResponse(
          [{ id: 1, gamerTag: 'Alice', entrantIds: [11], eventIds: [SINGLES] }],
          { page: variables.page ?? 1, totalPages: 999 },
        ),
      TournamentPools: () => poolsResponse([]),
    });
    const { getRegistration } = loadStartgg();

    await getRegistration(COOKIES, 'busy').catch(() => {});

    // Asserted as a shape rather than a literal list so that retuning
    // FREE_REQUESTS doesn't break this: some leading requests wait not at all,
    // and every wait after that is 50ms more than the last until it pins at
    // 300ms.
    const sleeps = sleepDurations();
    expect(sleeps.length).toBeLessThan(gql.calls.length);
    expect(sleeps).toEqual(sleeps.map((_, i) => Math.min(300, 50 + i * 50)));
    expect(sleeps[sleeps.length - 1]).toBe(300);
  });

  it('throws when participants claim more pages than the cap allows', async () => {
    mockGql({
      TournamentEvents: () =>
        eventsResponse([{ id: SINGLES, name: 'Melee Singles' }]),
      TournamentParticipants: (variables) =>
        participantsResponse(
          [{ id: 1, gamerTag: 'Alice', entrantIds: [11], eventIds: [SINGLES] }],
          { page: variables.page ?? 1, totalPages: 999 },
        ),
      TournamentPools: () => poolsResponse([]),
    });
    const { getRegistration } = loadStartgg();

    await expect(getRegistration(COOKIES, 'huge')).rejects.toThrow(
      /pages of participants/,
    );
  });
});

describe('pool filtering', () => {
  async function loadFiltered(filters: Record<Id, Partial<FilterState>>) {
    mockNycMelee();
    const startgg = loadStartgg();
    await startgg.getTournament(COOKIES, 'nyc-melee-100');

    const tournament = startgg.getCurrentTournament()!;
    const allPoolsOn = (optionId: Id) =>
      Object.fromEntries(
        (
          tournament.registrationOptions.find(
            (option) => option.id === optionId,
          )?.pools ?? []
        ).map((pool) => [pool.id, true]),
      );

    const filterState = Object.fromEntries(
      tournament.registrationOptions.map((option) => [
        option.id,
        {
          ...DEFAULT_FILTER_STATE,
          pools: allPoolsOn(option.id),
          ...(filters[option.id] ?? {}),
        },
      ]),
    );

    startgg.updateParticipantsFiltered('', filterState);
    return startgg
      .getCurrentTournament()!
      .participants.filter((participant) => !participant.filtered)
      .map((participant) => participant.displayName);
  }

  it('is inert while every pool is checked', async () => {
    await expect(loadFiltered({})).resolves.toEqual([
      'Alice',
      'Bob',
      'Carol',
      'Dave',
      'Erin',
    ]);
  });

  it('hides other pools, the unseeded, and non-entrants of that event', async () => {
    const visible = await loadFiltered({
      [SINGLES]: {
        pools: { 5001: true, 5002: false, [UNSEEDED_POOL_ID]: false },
      },
    });

    // Erin is redemption-only, so filtering singles by pool excludes her too.
    expect(visible).toEqual(['Alice', 'Bob']);
  });

  it('puts everyone with no pool for the event in the Unseeded bucket', async () => {
    const visible = await loadFiltered({
      [SINGLES]: {
        pools: { 5001: false, 5002: false, [UNSEEDED_POOL_ID]: true },
      },
    });

    // Dave is registered for singles but unseeded; Erin isn't in singles at
    // all. Neither has a singles pool, so both are Unseeded there.
    expect(visible).toEqual(['Dave', 'Erin']);
  });

  it('keeps the same people visible when the last box is unticked', async () => {
    // Regression: ticking every box is inert, so going from all-ticked to
    // Unseeded-only must not drop anyone who was already only matching
    // Unseeded. Previously non-entrants vanished at that boundary.
    const allTicked = await loadFiltered({});
    const unseededOnly = await loadFiltered({
      [SINGLES]: {
        pools: { 5001: false, 5002: false, [UNSEEDED_POOL_ID]: true },
      },
    });

    expect(allTicked).toEqual(expect.arrayContaining(unseededOnly));
    expect(unseededOnly).toContain('Erin');
  });

  it('narrows Unseeded to real entrants when Added is combined with it', async () => {
    const visible = await loadFiltered({
      [SINGLES]: {
        added: NullableBoolean.Include,
        pools: { 5001: false, 5002: false, [UNSEEDED_POOL_ID]: true },
      },
    });

    // Added excludes Erin, who was never registered for singles.
    expect(visible).toEqual(['Dave']);
  });

  it('shows nobody when every pool is unchecked', async () => {
    const visible = await loadFiltered({
      [SINGLES]: {
        pools: { 5001: false, 5002: false, [UNSEEDED_POOL_ID]: false },
      },
    });

    expect(visible).toEqual([]);
  });

  it('composes with the paid filter rather than overriding it', async () => {
    const visible = await loadFiltered({
      [SINGLES]: {
        paid: NullableBoolean.Include,
        pools: { 5001: true, 5002: false, [UNSEEDED_POOL_ID]: false },
      },
    });

    // Alice and Bob are both in pool 1; only Alice has paid for singles.
    expect(visible).toEqual(['Alice']);
  });

  it('filters each event independently', async () => {
    const visible = await loadFiltered({
      [REDEMPTION]: { pools: { 6001: true, [UNSEEDED_POOL_ID]: false } },
    });

    expect(visible).toEqual(['Erin']);
  });
});

describe('getVisibleParticipantsText', () => {
  async function loadNycMelee() {
    mockNycMelee();
    const startgg = loadStartgg();
    await startgg.getTournament(COOKIES, 'nyc-melee-100');
    return startgg;
  }

  /** Every box ticked - the state the renderer filters down from. */
  function allPoolsOn(startgg: ReturnType<typeof loadStartgg>) {
    return Object.fromEntries(
      startgg
        .getCurrentTournament()!
        .registrationOptions.map((option): [Id, FilterState] => [
          option.id,
          {
            ...DEFAULT_FILTER_STATE,
            pools: Object.fromEntries(
              (option.pools ?? []).map((pool) => [pool.id, true]),
            ),
          },
        ]),
    );
  }

  it('is empty before a tournament is loaded', () => {
    expect(loadStartgg().getVisibleParticipantsText()).toBe('');
  });

  it('joins on a comma and a space, prefixing only who has a prefix', async () => {
    const startgg = await loadNycMelee();

    // The separator is what start.gg's add-players box expects on paste, so
    // it is the contract - not incidental formatting.
    expect(startgg.getVisibleParticipantsText()).toBe(
      'TSM|Alice, Bob, Carol, Dave, Erin',
    );
  });

  it('lists only who survived the pool filter', async () => {
    const startgg = await loadNycMelee();

    startgg.updateParticipantsFiltered('', {
      ...allPoolsOn(startgg),
      [SINGLES]: {
        ...DEFAULT_FILTER_STATE,
        pools: { 5001: true, 5002: false, [UNSEEDED_POOL_ID]: false },
      },
    });

    expect(startgg.getVisibleParticipantsText()).toBe('TSM|Alice, Bob');
  });

  it('lists only who survived the search, matching on the prefix too', async () => {
    const startgg = await loadNycMelee();

    startgg.updateParticipantsFiltered('tsm', allPoolsOn(startgg));

    expect(startgg.getVisibleParticipantsText()).toBe('TSM|Alice');
  });

  it('is empty when everyone is filtered out', async () => {
    const startgg = await loadNycMelee();

    startgg.updateParticipantsFiltered('nobody', allPoolsOn(startgg));

    expect(startgg.getVisibleParticipantsText()).toBe('');
  });
});
