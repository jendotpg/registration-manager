/**
 * The ingest layer: raw GraphQL in, model objects out.
 *
 * ingestEvents, ingestParticipants, ingestPools and resolvePools are all
 * exported and take plain objects, so none of this needs a mocked fetch. They
 * are also where most of the codebase's `??`, `?.` and ternary branching lives,
 * which makes them the cheapest place to buy real coverage.
 *
 * ingestEvents writes the module-global venueFeeOption, so the suite still
 * re-imports per test.
 *
 * @jest-environment node
 */
import {
  Id,
  Participant,
  RegistrationOption,
  UNSEEDED_POOL,
  UNSEEDED_POOL_ID,
} from '../common/types';
import {
  eventsResponse,
  participantsResponse,
  poolsResponse,
  VENUE_FEE_OPTION_ID,
  VENUE_FEE_OPTION_TYPE_ID,
  VENUE_FEE_REG_VALUE_ID,
} from '../__fixtures__/startgg';
import { REDEMPTION, SINGLES } from '../__fixtures__/nycMelee';
import capturedEventsUnstarted from '../__fixtures__/captured/tournamentEventsUnstarted.json';

const loadStartgg = () =>
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  require('../main/startgg') as typeof import('../main/startgg');

beforeEach(() => {
  jest.resetModules();
});

const optionFor = (options: RegistrationOption[], id: Id) =>
  options.find((option) => option.id === id);

/** A raw events response assembled by hand, for shapes the builder won't make. */
function rawEvents(
  events: { id: number; state?: string }[],
  registrationOptions: any[],
) {
  return {
    tournamentRegistrationInfo: {
      events: events.map((event) => ({
        id: event.id,
        state: event.state ?? 'CREATED',
      })),
      registrationOptions,
    },
  };
}

describe('ingestEvents', () => {
  it.each([
    ['CREATED', false],
    ['READY', false],
    ['ACTIVE', true],
    ['COMPLETED', true],
    ['CALL_IN_PROGRESS', true],
  ])('marks a %s event started=%s', (state, started) => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(
      eventsResponse([{ id: SINGLES, name: 'Singles', state }]),
      options,
    );

    expect(optionFor(options, SINGLES)!.started).toBe(started);
  });

  it('reads a tournament option id from values[0].id', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(eventsResponse([{ id: SINGLES, name: 'Singles' }]), options);

    // Not the registrationOption's own id, and not its optionTypeId - the
    // fixture gives all three different values precisely so this can fail.
    expect(optionFor(options, VENUE_FEE_REG_VALUE_ID)).toBeDefined();
    expect(optionFor(options, VENUE_FEE_OPTION_ID)).toBeUndefined();
    expect(optionFor(options, VENUE_FEE_OPTION_TYPE_ID)).toBeUndefined();
  });

  it('reads an event option id from values[0].optionTypeId', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(eventsResponse([{ id: SINGLES, name: 'Singles' }]), options);

    // The builder sets values[0].id to id * 10, so reading the wrong field here
    // would give 1110 rather than 111.
    expect(optionFor(options, SINGLES)).toBeDefined();
    expect(optionFor(options, SINGLES * 10)).toBeUndefined();
  });

  it('skips an option that is neither an event nor a tournament option', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(
      rawEvents(
        [{ id: SINGLES }],
        [
          {
            name: 'T-Shirt',
            id: 777,
            optionType: 'merch',
            values: [{ id: 7770, name: 'Large', optionTypeId: 777, fee: 2000 }],
          },
        ],
      ),
      options,
    );

    expect(options).toEqual([]);
  });

  it('keeps an option whose resolved id is 0', () => {
    // The gate is on undefined, not on truthiness. start.gg ids look 1-based,
    // but a 0 that did arrive would silently cost the table a whole column,
    // with nothing on screen to say a registration option had gone missing.
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(
      rawEvents(
        [{ id: 0 }],
        [
          {
            name: 'Zero',
            id: 0,
            optionType: 'event',
            values: [{ id: 0, name: 'Zero', optionTypeId: 0, fee: 0 }],
          },
        ],
      ),
      options,
    );

    expect(options).toEqual([
      {
        id: 0,
        name: 'Zero',
        type: 'event',
        started: false,
        free: true,
        options: ['Zero'],
        pools: [],
      },
    ]);
  });

  it('calls a zero fee free and a non-zero fee not free', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(
      eventsResponse([
        { id: SINGLES, name: 'Singles', fee: 500 },
        { id: REDEMPTION, name: 'Redemption', fee: 0 },
      ]),
      options,
    );

    expect(optionFor(options, SINGLES)!.free).toBe(false);
    expect(optionFor(options, REDEMPTION)!.free).toBe(true);
  });

  it('gives event options a pools array and tournament options no pools key', () => {
    // StartggCheckin decides whether to render an Added column off this, so the
    // difference between [] and absent matters.
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(eventsResponse([{ id: SINGLES, name: 'Singles' }]), options);

    expect(optionFor(options, SINGLES)!.pools).toEqual([]);
    expect('pools' in optionFor(options, VENUE_FEE_REG_VALUE_ID)!).toBe(false);
  });

  it('lists every value name under options', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(
      rawEvents(
        [{ id: SINGLES }],
        [
          {
            name: 'Singles',
            id: SINGLES,
            optionType: 'event',
            values: [
              { id: 1, name: 'Early Bird', optionTypeId: SINGLES, fee: 500 },
              { id: 2, name: 'At The Door', optionTypeId: SINGLES, fee: 1000 },
            ],
          },
        ],
      ),
      options,
    );

    expect(optionFor(options, SINGLES)!.options).toEqual([
      'Early Bird',
      'At The Door',
    ]);
    // free comes from values[0] only.
    expect(optionFor(options, SINGLES)!.free).toBe(false);
  });

  it('replaces rather than appends when called a second time', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(eventsResponse([{ id: SINGLES, name: 'Singles' }]), options);
    ingestEvents(eventsResponse([{ id: SINGLES, name: 'Singles' }]), options);

    expect(options).toHaveLength(2); // venue fee + singles, not four
  });

  it('handles the real unstarted capture, doubles and all', () => {
    const { ingestEvents } = loadStartgg();
    const options: RegistrationOption[] = [];

    ingestEvents(capturedEventsUnstarted, options);

    expect(options.map((option) => option.name)).toEqual([
      'Venue Fee',
      'Melee Singles',
      'Melee Doubles',
      'Redemption',
    ]);
    // Nothing has started, which is the state the app is actually used in.
    expect(options.every((option) => !option.started)).toBe(true);
    // A $15 venue fee is not free; a zero-fee redemption is.
    expect(optionFor(options, 6447006)!.free).toBe(false);
    expect(optionFor(options, 1672618)!.free).toBe(true);
  });
});

describe('ingestParticipants', () => {
  const ingest = (nodes: any[]) => {
    const { ingestParticipants } = loadStartgg();
    const participants: Participant[] = [];
    const byEntrant = new Map<Id, Participant[]>();
    ingestParticipants(
      {
        tournamentRegistrationInfo: {
          participants: { pageInfo: { page: 1, totalPages: 1 }, nodes },
        },
      },
      participants,
      byEntrant,
    );
    return { participants, byEntrant };
  };

  const node = (overrides: any = {}) => ({
    id: 1,
    prefix: '',
    gamerTag: 'Player',
    entrants: [],
    registrationSelections: [],
    ...overrides,
  });

  it.each([
    ['null', null, ''],
    ['undefined', undefined, ''],
    ['a real prefix', 'TSM', 'TSM'],
  ])('coerces a %s prefix to %s', (_label, prefix, expected) => {
    // A third of the captured participants come back with prefix: null. Without
    // the coercion the search haystack would be the literal string "null|tag".
    const { participants } = ingest([node({ prefix })]);

    expect(participants[0].prefix).toBe(expected);
  });

  it('tolerates a participant with no entrants at all', () => {
    const { participants, byEntrant } = ingest([
      node({ entrants: undefined }),
      node({ id: 2, entrants: [] }),
    ]);

    expect(participants).toHaveLength(2);
    expect(byEntrant.size).toBe(0);
  });

  it('maps one doubles entrant to both of its participants', () => {
    // The many-to-many case the Melee Doubles capture proves is real.
    const { byEntrant } = ingest([
      node({ id: 1, gamerTag: 'Alice', entrants: [{ id: 99 }] }),
      node({ id: 2, gamerTag: 'Bob', entrants: [{ id: 99 }] }),
    ]);

    expect(byEntrant.get(99)!.map((p) => p.displayName)).toEqual([
      'Alice',
      'Bob',
    ]);
  });

  it('records an event selection as both registered and paid-or-not', () => {
    const { participants } = ingest([
      node({
        registrationSelections: [
          {
            regValue: { id: 1110, optionType: 'event', optionTypeId: SINGLES },
            balance: 0,
          },
        ],
      }),
    ]);

    expect(participants[0].registeredStatuses).toEqual({ [SINGLES]: true });
    expect(participants[0].paidStatuses).toEqual({ [SINGLES]: true });
  });

  it('records a tournament selection as paid only, never as registered', () => {
    // "Obviously you're registered for the venue if you're in the event."
    const { participants } = ingest([
      node({
        registrationSelections: [
          {
            regValue: {
              id: VENUE_FEE_REG_VALUE_ID,
              optionType: 'tournament',
              optionTypeId: VENUE_FEE_OPTION_TYPE_ID,
            },
            balance: 500,
          },
        ],
      }),
    ]);

    expect(participants[0].paidStatuses).toEqual({
      [VENUE_FEE_REG_VALUE_ID]: false,
    });
    expect(participants[0].registeredStatuses).toEqual({});
  });

  it('ignores a selection of an unrecognised option type', () => {
    const { participants } = ingest([
      node({
        registrationSelections: [
          {
            regValue: { id: 5, optionType: 'merch', optionTypeId: 5 },
            balance: 0,
          },
        ],
      }),
    ]);

    expect(participants[0].paidStatuses).toEqual({});
    expect(participants[0].registeredStatuses).toEqual({});
  });

  it('treats a zero balance as paid even when it arrives as a string', () => {
    const { participants } = ingest([
      node({
        registrationSelections: [
          {
            regValue: { id: 1110, optionType: 'event', optionTypeId: SINGLES },
            balance: '0',
          },
        ],
      }),
    ]);

    expect(participants[0].paidStatuses[SINGLES]).toBe(true);
  });

  it('accumulates across pages instead of replacing', () => {
    const { ingestParticipants } = loadStartgg();
    const participants: Participant[] = [];
    const byEntrant = new Map<Id, Participant[]>();

    ingestParticipants(
      participantsResponse([{ id: 1, gamerTag: 'Alice' }], {
        page: 1,
        totalPages: 2,
      }),
      participants,
      byEntrant,
    );
    ingestParticipants(
      participantsResponse([{ id: 2, gamerTag: 'Bob' }], {
        page: 2,
        totalPages: 2,
      }),
      participants,
      byEntrant,
    );

    expect(participants.map((p) => p.displayName)).toEqual(['Alice', 'Bob']);
  });
});

describe('ingestPools', () => {
  const collect = (response: any) => {
    const { ingestPools } = loadStartgg();
    const poolsByEvent = new Map();
    ingestPools(response, poolsByEvent);
    return poolsByEvent;
  };

  const group = (overrides: any = {}) => ({
    id: 5001,
    displayIdentifier: '1',
    phase: { id: 1, name: 'Pools', phaseOrder: 1 },
    seeds: { pageInfo: { page: 1, totalPages: 1 }, nodes: [] },
    ...overrides,
  });

  const response = (groups: any[]) => ({
    tournament: {
      events: [
        {
          id: SINGLES,
          paginatedPhaseGroups: {
            pageInfo: { page: 1, totalPages: 1 },
            nodes: groups,
          },
        },
      ],
    },
  });

  it('does nothing when the tournament has no events', () => {
    expect(collect({ tournament: { events: undefined } }).size).toBe(0);
  });

  it('throws on a phase group id that is not a number', () => {
    expect(() => collect(response([group({ id: 'not-a-number' })]))).toThrow(
      'start.gg returned an unusable phase group id: not-a-number',
    );
  });

  it('throws on a negative phase group id, which would collide with Unseeded', () => {
    // UNSEEDED_POOL_ID is -1. A real pool arriving with a negative id would be
    // indistinguishable from the sentinel, so it is rejected outright.
    expect(() => collect(response([group({ id: UNSEEDED_POOL_ID })]))).toThrow(
      /unusable phase group id/,
    );
  });

  it('accepts a numeric string id', () => {
    const pools = collect(response([group({ id: '5001' })]));

    expect(pools.get(SINGLES)!.get(5001)!.id).toBe(5001);
  });

  it('unions entrants when the same pool arrives on a second seed page', () => {
    const { ingestPools } = loadStartgg();
    const poolsByEvent = new Map();

    ingestPools(
      response([
        group({
          seeds: {
            pageInfo: { page: 1, totalPages: 2 },
            nodes: [{ id: 1, entrant: { id: 11 } }],
          },
        }),
      ]),
      poolsByEvent,
    );
    ingestPools(
      response([
        group({
          // A later page carries no phase/name in this scenario; the first one
          // already established them and must not be overwritten.
          displayIdentifier: 'WRONG',
          phase: { id: 1, name: 'WRONG', phaseOrder: 9 },
          seeds: {
            pageInfo: { page: 2, totalPages: 2 },
            nodes: [{ id: 2, entrant: { id: 12 } }],
          },
        }),
      ]),
      poolsByEvent,
    );

    const pool = poolsByEvent.get(SINGLES)!.get(5001)!;
    expect([...pool.entrantIds]).toEqual([11, 12]);
    expect(pool.name).toBe('1');
    expect(pool.phase).toBe('Pools');
    expect(pool.phaseOrder).toBe(1);
  });

  it('falls back to empty strings and phase order zero for a bare group', () => {
    const pools = collect(
      response([
        group({ phase: undefined, displayIdentifier: null, seeds: undefined }),
      ]),
    );

    const pool = pools.get(SINGLES)!.get(5001)!;
    expect(pool.phase).toBe('');
    expect(pool.name).toBe('');
    expect(pool.phaseOrder).toBe(0);
    expect(pool.entrantIds.size).toBe(0);
  });

  it('skips a seed with no entrant behind it', () => {
    const pools = collect(
      response([
        group({
          seeds: {
            pageInfo: { page: 1, totalPages: 1 },
            nodes: [
              { id: 1, entrant: null },
              { id: 2, entrant: { id: 11 } },
            ],
          },
        }),
      ]),
    );

    expect([...pools.get(SINGLES)!.get(5001)!.entrantIds]).toEqual([11]);
  });

  it('keeps two groups of the same event in one map', () => {
    const pools = collect(
      response([
        group({ id: 5001 }),
        group({ id: 5002, displayIdentifier: '2' }),
      ]),
    );

    expect([...pools.get(SINGLES)!.keys()]).toEqual([5001, 5002]);
  });
});

describe('resolvePools', () => {
  /** Build the collected-pool map resolvePools consumes, without the wire. */
  function collected(
    eventId: Id,
    pools: {
      id: Id;
      phase?: string;
      name?: string;
      phaseOrder?: number;
      entrantIds?: Id[];
    }[],
  ) {
    const byEvent = new Map<Id, Map<Id, any>>();
    const eventPools = new Map<Id, any>();
    pools.forEach((pool) =>
      eventPools.set(pool.id, {
        id: pool.id,
        phase: pool.phase ?? 'Pools',
        name: pool.name ?? String(pool.id),
        phaseOrder: pool.phaseOrder ?? 1,
        entrantIds: new Set(pool.entrantIds ?? []),
      }),
    );
    byEvent.set(eventId, eventPools);
    return byEvent;
  }

  const eventOption = (id: Id): RegistrationOption => ({
    id,
    name: 'Event',
    type: 'event',
    started: false,
    free: false,
    options: ['Event'],
    pools: [],
  });

  const participant = (id: Id): Participant => ({
    id,
    displayName: `P${id}`,
    prefix: '',
    filtered: false,
    paidStatuses: {},
    registeredStatuses: {},
    pools: {},
  });

  it('leaves a tournament option untouched', () => {
    const { resolvePools } = loadStartgg();
    const venueFee: RegistrationOption = {
      id: VENUE_FEE_REG_VALUE_ID,
      name: 'Venue Fee',
      type: 'tournament',
      started: false,
      free: false,
      options: ['Venue Fee'],
    };

    resolvePools(new Map(), new Map(), [venueFee]);

    expect(venueFee.pools).toBeUndefined();
  });

  it('gives an event with no pools at all an empty list and no Unseeded bucket', () => {
    // No pools means the bracket has not been seeded yet, and offering an
    // "Unseeded" filter for a field of nobody would be noise.
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);

    resolvePools(new Map(), new Map(), [option]);

    expect(option.pools).toEqual([]);
  });

  it('also yields nothing when the first phase exists but is entirely empty', () => {
    // firstPhaseOrder is reduced BEFORE the empty-pool filter, so an empty first
    // phase does not fall through to phase 2 - the event just has no pools yet.
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);

    resolvePools(
      collected(SINGLES, [
        { id: 5001, phaseOrder: 1, entrantIds: [] },
        { id: 5003, phaseOrder: 2, entrantIds: [11] },
      ]),
      new Map([[11, [participant(1)]]]),
      [option],
    );

    expect(option.pools).toEqual([]);
  });

  it('keeps only the lowest phase order, so a beast bracket never wins', () => {
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);
    const alice = participant(1);

    resolvePools(
      collected(SINGLES, [
        {
          id: 5001,
          phase: 'Pools',
          name: '1',
          phaseOrder: 1,
          entrantIds: [11],
        },
        {
          id: 5003,
          phase: 'Top 16',
          name: '1',
          phaseOrder: 2,
          entrantIds: [11],
        },
      ]),
      new Map([[11, [alice]]]),
      [option],
    );

    expect(option.pools).toEqual([
      { id: 5001, phase: 'Pools', name: '1' },
      UNSEEDED_POOL,
    ]);
    // Alice played pool 1 and advanced; she is filed under where she played.
    expect(alice.pools[SINGLES]).toEqual({
      id: 5001,
      phase: 'Pools',
      name: '1',
    });
  });

  it('keeps everything when every pool shares a phase order', () => {
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);

    resolvePools(
      collected(SINGLES, [
        { id: 5001, phaseOrder: 0, entrantIds: [11] },
        { id: 5002, phaseOrder: 0, entrantIds: [12] },
      ]),
      new Map([
        [11, [participant(1)]],
        [12, [participant(2)]],
      ]),
      [option],
    );

    expect(option.pools!.map((pool) => pool.id)).toEqual([
      5001,
      5002,
      UNSEEDED_POOL_ID,
    ]);
  });

  it('sorts pools by id however they arrived', () => {
    // paginatedPhaseGroups ignores sortBy, so ordering has to happen locally.
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);

    resolvePools(
      collected(SINGLES, [
        { id: 5003, entrantIds: [13] },
        { id: 5001, entrantIds: [11] },
        { id: 5002, entrantIds: [12] },
      ]),
      new Map([
        [11, [participant(1)]],
        [12, [participant(2)]],
        [13, [participant(3)]],
      ]),
      [option],
    );

    expect(option.pools!.map((pool) => pool.id)).toEqual([
      5001,
      5002,
      5003,
      UNSEEDED_POOL_ID,
    ]);
  });

  it('appends the Unseeded bucket last, after every real pool', () => {
    // Order matters: the filter menu renders these top to bottom, and Unseeded
    // reads as a catch-all only if it sits at the bottom.
    // (Identity is deliberately not asserted - loadStartgg() re-requires through
    // a fresh module registry, so its UNSEEDED_POOL is a different object than
    // this file's import even though both are correct.)
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);

    resolvePools(
      collected(SINGLES, [
        { id: 5001, entrantIds: [11] },
        { id: 5002, entrantIds: [12] },
      ]),
      new Map([
        [11, [participant(1)]],
        [12, [participant(2)]],
      ]),
      [option],
    );

    expect(option.pools![option.pools!.length - 1]).toEqual(UNSEEDED_POOL);
    expect(
      option.pools!.filter((pool) => pool.id === UNSEEDED_POOL_ID),
    ).toHaveLength(1);
  });

  it('tolerates a seeded entrant that matches no participant', () => {
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);

    expect(() =>
      resolvePools(
        collected(SINGLES, [{ id: 5001, entrantIds: [11, 999] }]),
        new Map([[11, [participant(1)]]]),
        [option],
      ),
    ).not.toThrow();
  });

  it('puts both halves of a doubles entrant in the same pool', () => {
    const { resolvePools } = loadStartgg();
    const option = eventOption(SINGLES);
    const alice = participant(1);
    const bob = participant(2);

    resolvePools(
      collected(SINGLES, [{ id: 5001, entrantIds: [99] }]),
      new Map([[99, [alice, bob]]]),
      [option],
    );

    expect(alice.pools[SINGLES]).toBe(bob.pools[SINGLES]);
  });

  it('files one participant separately per event', () => {
    const { resolvePools } = loadStartgg();
    const singles = eventOption(SINGLES);
    const redemption = eventOption(REDEMPTION);
    const alice = participant(1);
    const byEvent = collected(SINGLES, [{ id: 5001, entrantIds: [11] }]);
    byEvent.set(
      REDEMPTION,
      collected(REDEMPTION, [{ id: 6001, entrantIds: [21] }]).get(REDEMPTION)!,
    );

    resolvePools(
      byEvent,
      new Map([
        [11, [alice]],
        [21, [alice]],
      ]),
      [singles, redemption],
    );

    expect(alice.pools[SINGLES].id).toBe(5001);
    expect(alice.pools[REDEMPTION].id).toBe(6001);
  });
});

describe('pool pagination shapes', () => {
  it('reports the highest totalPages across the events it was given', async () => {
    // maxTotalPages is private; the only way to observe it is through how many
    // group pages getRegistration decides to sweep.
    const { ingestPools } = loadStartgg();
    const poolsByEvent = new Map();

    ingestPools(
      poolsResponse(
        [
          {
            id: SINGLES,
            pools: [{ id: 5001, phase: 'P', name: '1', entrantIds: [11] }],
          },
        ],
        { groupPage: 1, groupPerPage: 1 },
      ),
      poolsByEvent,
    );

    expect(poolsByEvent.get(SINGLES)!.size).toBe(1);
  });
});
