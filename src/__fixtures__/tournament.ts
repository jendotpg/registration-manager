/**
 * In-memory Tournament builders for renderer tests.
 *
 * These are the *post-ingest* shapes from common/types.ts - what the renderer
 * actually receives over the `tournament` IPC channel - as opposed to
 * __fixtures__/startgg.ts, which builds the raw GraphQL wire shapes.
 *
 * Nothing here imports main/startgg.ts. Renderer tests must not drag the domain
 * layer (and its module-global state, and its global.fetch expectations) into a
 * jsdom environment. The cost of that separation is that nycMeleeTournament()
 * below is hand-written rather than derived, so it could drift from what the
 * pipeline really produces - which is why startgg.ingest.test.ts asserts the two
 * are identical.
 */
import {
  Id,
  Participant,
  Pool,
  RegistrationOption,
  Tournament,
  UNSEEDED_POOL,
} from '../common/types';
import {
  ALICE,
  BOB,
  CAROL,
  DAVE,
  ERIN,
  NYC_MELEE_NAME,
  NYC_MELEE_SLUG,
  REDEMPTION,
  SINGLES,
} from './nycMelee';
import { VENUE_FEE_REG_VALUE_ID } from './startgg';

export const VENUE_FEE = VENUE_FEE_REG_VALUE_ID;

export const POOL_A: Pool = { id: 5001, phase: 'Pools', name: '1' };
export const POOL_B: Pool = { id: 5002, phase: 'Pools', name: '2' };
export const POOL_REDEMPTION: Pool = {
  id: 6001,
  phase: 'Redemption',
  name: '1',
};

export function makePool(overrides: Partial<Pool> = {}): Pool {
  return { id: 1, phase: 'Pools', name: '1', ...overrides };
}

export function makeRegistrationOption(
  overrides: Partial<RegistrationOption> = {},
): RegistrationOption {
  const type = overrides.type ?? 'event';
  return {
    id: 1,
    name: 'Event',
    type,
    started: false,
    free: false,
    options: [overrides.name ?? 'Event'],
    // Only event options carry pools; ingestEvents omits the key entirely for
    // tournament options, and StartggCheckin relies on that to decide whether to
    // render an Added column.
    ...(type === 'event' ? { pools: [] } : {}),
    ...overrides,
  };
}

export function makeParticipant(
  overrides: Partial<Participant> = {},
): Participant {
  return {
    id: 1,
    displayName: 'Player',
    prefix: '',
    filtered: false,
    paidStatuses: {},
    registeredStatuses: {},
    pools: {},
    ...overrides,
  };
}

export function makeTournament(
  overrides: Partial<Tournament> = {},
): Tournament {
  return {
    slug: NYC_MELEE_SLUG,
    name: NYC_MELEE_NAME,
    participants: [],
    registrationOptions: [],
    updatingCheckboxes: [],
    ...overrides,
  };
}

/**
 * The shape ipc.logOut sends, and what App holds before anything is loaded.
 * The empty slug is what StartggCheckin keys its "No tournament selected!"
 * placeholder off, so it matters that it is '' and not undefined.
 */
export const EMPTY_TOURNAMENT: Tournament = {
  slug: '',
  name: '',
  participants: [],
  registrationOptions: [],
  updatingCheckboxes: [],
};

/**
 * The same tournament __fixtures__/nycMelee.ts serves over the wire, as the
 * renderer sees it: venue fee plus two events, five participants covering paid,
 * unpaid, each pool, unseeded, and other-event-only.
 */
export function nycMeleeTournament(
  overrides: Partial<Tournament> = {},
): Tournament {
  return {
    slug: NYC_MELEE_SLUG,
    name: NYC_MELEE_NAME,
    registrationOptions: [
      {
        id: VENUE_FEE,
        name: 'Venue Fee',
        type: 'tournament',
        started: false,
        free: false,
        options: ['Venue Fee'],
      },
      {
        id: SINGLES,
        name: 'Melee Singles',
        type: 'event',
        started: false,
        free: false,
        options: ['Melee Singles'],
        pools: [POOL_A, POOL_B, UNSEEDED_POOL],
      },
      {
        id: REDEMPTION,
        name: 'Redemption Bracket',
        type: 'event',
        started: false,
        free: false,
        options: ['Redemption Bracket'],
        pools: [POOL_REDEMPTION, UNSEEDED_POOL],
      },
    ],
    participants: [
      {
        id: ALICE,
        displayName: 'Alice',
        prefix: 'TSM',
        filtered: false,
        paidStatuses: { [SINGLES]: true, [VENUE_FEE]: false },
        registeredStatuses: { [SINGLES]: true },
        pools: { [SINGLES]: POOL_A },
      },
      {
        id: BOB,
        displayName: 'Bob',
        prefix: '',
        filtered: false,
        paidStatuses: { [SINGLES]: false, [VENUE_FEE]: false },
        registeredStatuses: { [SINGLES]: true },
        pools: { [SINGLES]: POOL_A },
      },
      {
        id: CAROL,
        displayName: 'Carol',
        prefix: '',
        filtered: false,
        paidStatuses: { [SINGLES]: false, [VENUE_FEE]: false },
        registeredStatuses: { [SINGLES]: true },
        pools: { [SINGLES]: POOL_B },
      },
      {
        // Registered for singles but never seeded - lands in Unseeded.
        id: DAVE,
        displayName: 'Dave',
        prefix: '',
        filtered: false,
        paidStatuses: { [SINGLES]: false, [VENUE_FEE]: false },
        registeredStatuses: { [SINGLES]: true },
        pools: {},
      },
      {
        // Redemption only - unseeded in singles because he isn't in it at all.
        id: ERIN,
        displayName: 'Erin',
        prefix: '',
        filtered: false,
        paidStatuses: { [REDEMPTION]: false, [VENUE_FEE]: false },
        registeredStatuses: { [REDEMPTION]: true },
        pools: { [REDEMPTION]: POOL_REDEMPTION },
      },
    ],
    updatingCheckboxes: [],
    ...overrides,
  };
}

/** Singles has started: the "cannot add" paths become reachable. */
export function startedEventTournament(): Tournament {
  const tournament = nycMeleeTournament();
  tournament.registrationOptions[1].started = true;
  return tournament;
}

/** Singles costs nothing: the "no payment required" path becomes reachable. */
export function freeOptionTournament(): Tournament {
  const tournament = nycMeleeTournament();
  tournament.registrationOptions[1].free = true;
  return tournament;
}

/** A toggle is in flight for Alice's singles registration. */
export function updatingTournament(
  attendee: Id = ALICE,
  option: Id = SINGLES,
): Tournament {
  return nycMeleeTournament({ updatingCheckboxes: [`${attendee};${option}`] });
}

/*
 * Below here: the load generator for the responsiveness suites.
 *
 * Everything above is a fidelity fixture - it is the shape start.gg really
 * hands back, and fixtureConsistency.test.ts holds it to that. bigTournament is
 * the opposite: nobody asserts that a real tournament looks like this, only that
 * the interface stays responsive when one is this big. Its ids are deliberately
 * far away from the NYC Melee ones so a suite that mixes the two cannot get a
 * false pass from a collision.
 */

const BIG_OPTION_ID_BASE = 10_000;
const BIG_POOL_ID_BASE = 20_000;
const BIG_PARTICIPANT_ID_BASE = 100_000;

/** The venue fee option every bigTournament leads with. */
export const BIG_VENUE_FEE: Id = BIG_OPTION_ID_BASE;

/**
 * A sponsor prefix carried by exactly BIG_RARE_COUNT participants, so a search
 * of three characters takes any size of tournament down to a handful of rows.
 * Without it "Player" matches everyone and "Player 1" matches a third of them,
 * neither of which exercises the narrowing path.
 */
export const BIG_RARE_PREFIX = 'ZEPHYR';
export const BIG_RARE_COUNT = 3;

export function bigTournamentOptionId(index: number): Id {
  return BIG_OPTION_ID_BASE + 1 + index;
}

export function bigTournamentParticipantId(index: number): Id {
  return BIG_PARTICIPANT_ID_BASE + index;
}

/**
 * A tournament of arbitrary size: one venue fee option plus `events` event
 * options, each with `poolsPerEvent` pools, and `participants` attendees spread
 * deterministically across paid / added / pooled states.
 *
 * The venue fee option is not optional decoration. It is the only option type
 * that renders a medium Checkbox, which is what sets the row height, so a
 * fixture without one would measure rows 4px shorter than production ones.
 *
 * The status spread is deliberately uneven. Uniform statuses let a memoised row
 * bail out for the wrong reason - every row identical means every row's props
 * compare equal by luck - and would flatter any measurement taken here.
 */
export function bigTournament({
  participants = 300,
  events = 8,
  poolsPerEvent = 4,
}: {
  participants?: number;
  events?: number;
  poolsPerEvent?: number;
} = {}): Tournament {
  const eventOptions = Array.from({ length: events }, (unused, eventIndex) => {
    const id = bigTournamentOptionId(eventIndex);
    const name = `Event ${eventIndex + 1}`;
    return makeRegistrationOption({
      id,
      name,
      type: 'event',
      options: [name],
      pools: [
        ...Array.from({ length: poolsPerEvent }, (alsoUnused, poolIndex) =>
          makePool({
            id: BIG_POOL_ID_BASE + eventIndex * 100 + poolIndex,
            phase: 'Pools',
            name: `${poolIndex + 1}`,
          }),
        ),
        UNSEEDED_POOL,
      ],
    });
  });

  const registrationOptions: RegistrationOption[] = [
    makeRegistrationOption({
      id: BIG_VENUE_FEE,
      name: 'Venue Fee',
      type: 'tournament',
      options: ['Venue Fee'],
    }),
    ...eventOptions,
  ];

  const rareEvery = Math.max(1, Math.floor(participants / BIG_RARE_COUNT));

  const attendees = Array.from({ length: participants }, (unused, index) => {
    const paidStatuses: Record<Id, boolean> = {
      [BIG_VENUE_FEE]: index % 2 === 0,
    };
    const registeredStatuses: Record<Id, boolean> = {};
    const pools: Record<Id, Pool> = {};

    eventOptions.forEach((option, eventIndex) => {
      // Every participant is in every event, so the grid is dense: a sparse one
      // would render fewer checked boxes but exactly as many checkboxes, and
      // the mount cost is what is being measured.
      registeredStatuses[option.id] = (index + eventIndex) % 4 !== 0;
      paidStatuses[option.id] = (index + eventIndex) % 3 === 0;
      const poolOptions = option.pools ?? [];
      pools[option.id] =
        poolOptions[(index + eventIndex) % poolOptions.length] ?? UNSEEDED_POOL;
    });

    const rare = index % rareEvery === rareEvery - 1;
    return makeParticipant({
      id: bigTournamentParticipantId(index),
      displayName: `Player ${String(index).padStart(3, '0')}`,
      prefix: rare ? BIG_RARE_PREFIX : '',
      paidStatuses,
      registeredStatuses,
      pools,
    });
  });

  return makeTournament({
    slug: 'tournament/big-tournament',
    name: 'Big Tournament',
    registrationOptions,
    participants: attendees,
  });
}
