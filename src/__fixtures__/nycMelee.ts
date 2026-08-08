/**
 * The mock tournament the main-process tests run against.
 *
 * Two events with a shape borrowed from a real NYC Melee bracket: singles with
 * two seeded pools plus a beast bracket that is itself seeded with the entrants
 * who progressed out of those pools, and a redemption bracket. Five participants
 * chosen so that every interesting position is occupied by exactly one person -
 * paid, unpaid, seeded, registered-but-unseeded, and in-the-other-event-only -
 * which keeps assertions readable ("Dave is the unseeded one") instead of
 * index-based.
 *
 * This lives here rather than in a test file because several suites need it.
 */
import type { Cookie } from 'electron';
import {
  eventsResponse,
  mockGql,
  participantsResponse,
  poolsResponse,
  FakeEvent,
  FakeParticipant,
  FakePoolEvent,
  HandlerSpec,
} from './startgg';

/** Any non-empty cookie jar will do; nothing in the tests inspects it. */
export const COOKIES: Cookie[] = [{ name: 'session', value: 'fake' } as Cookie];

export const SINGLES = 111;
export const REDEMPTION = 222;

export const NYC_MELEE_NAME = 'NYC Melee 100';
export const NYC_MELEE_SLUG = 'tournament/nyc-melee-100';

/** Participant ids, named so tests don't have to remember the numbers. */
export const ALICE = 1;
export const BOB = 2;
export const CAROL = 3;
export const DAVE = 4;
export const ERIN = 5;

/**
 * Singles has two pools at phaseOrder 1 and a beast bracket at phaseOrder 2.
 * The beast bracket carries seeds too - that is the whole point, and why
 * resolvePools filters on phaseOrder rather than on "has seeds".
 */
export function nycMeleePools(): FakePoolEvent[] {
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

export const NYC_MELEE_PARTICIPANTS: FakeParticipant[] = [
  {
    id: ALICE,
    gamerTag: 'Alice',
    prefix: 'TSM',
    entrantIds: [11],
    eventIds: [SINGLES],
    paidEventIds: [SINGLES],
  },
  { id: BOB, gamerTag: 'Bob', entrantIds: [12], eventIds: [SINGLES] },
  { id: CAROL, gamerTag: 'Carol', entrantIds: [13], eventIds: [SINGLES] },
  // Registered for singles but never seeded.
  { id: DAVE, gamerTag: 'Dave', entrantIds: [14], eventIds: [SINGLES] },
  // Redemption only.
  { id: ERIN, gamerTag: 'Erin', entrantIds: [21], eventIds: [REDEMPTION] },
];

export const NYC_MELEE_EVENTS: FakeEvent[] = [
  { id: SINGLES, name: 'Melee Singles' },
  { id: REDEMPTION, name: 'Redemption Bracket' },
];

export type NycMeleeOverrides = {
  poolEvents?: FakePoolEvent[];
  participants?: FakeParticipant[];
  events?: FakeEvent[];
  /**
   * Drop the venue fee option. This is the only lever that leaves
   * venueFeeOption undefined, which is the only way to reach the early-return
   * guards in toggleParticipantPaid and updateParticipantRegistration.
   */
  withVenueFee?: boolean;
  name?: string;
  slug?: string;
  /** Raw handler specs, merged last - for transport failures and queues. */
  responses?: Parameters<typeof mockGql>[0];
};

export function mockNycMelee(overrides: NycMeleeOverrides = {}) {
  const {
    poolEvents = nycMeleePools(),
    participants = NYC_MELEE_PARTICIPANTS,
    events = NYC_MELEE_EVENTS,
    withVenueFee = true,
    name = NYC_MELEE_NAME,
    slug = NYC_MELEE_SLUG,
    responses = {},
  } = overrides;

  const defaults: { [key: string]: HandlerSpec } = {
    TournamentEvents: () => eventsResponse(events, withVenueFee),
    TournamentParticipants: () => participantsResponse(participants),
    TournamentPools: (variables: Record<string, any>) =>
      poolsResponse(poolEvents, {
        name,
        slug,
        groupPage: variables.groupPage,
        seedPage: variables.seedPage,
      }),
  };

  return mockGql({ ...defaults, ...responses });
}

/**
 * Mock the API, load startgg.ts fresh, and fetch the tournament.
 *
 * startgg.ts keeps module-global state, so every test needs its own module
 * registry - callers are expected to have called jest.resetModules() first
 * (the suites do it in beforeEach).
 */
export async function loadNycMelee(
  overrides: NycMeleeOverrides & { cookies?: Cookie[] } = {},
) {
  const { cookies = COOKIES, ...rest } = overrides;
  const gql = mockNycMelee(rest);
  const startgg =
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    require('../main/startgg') as typeof import('../main/startgg');
  const tournament = await startgg.getTournament(
    cookies,
    rest.slug ?? NYC_MELEE_SLUG,
  );
  return { startgg, gql, tournament };
}
