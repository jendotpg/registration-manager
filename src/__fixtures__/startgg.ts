/**
 * Builders for fake start.gg responses, shaped like the unofficial API's
 * replies to the queries in main/startgg.ts.
 *
 * These are hand-built rather than captured so that pagination and edge cases
 * can be dialled in per test. The shapes they produce are the contract - if a
 * real capture ever disagrees with one of these, the builder is wrong.
 */

export const CURRENT_USER = { id: 1234 };

export const VENUE_FEE_REG_VALUE_ID = 9001;

export type FakeEvent = {
  id: number;
  /** Anything other than CREATED/READY marks the event as started. */
  state?: string;
  name: string;
  fee?: number;
};

export function eventsResponse(events: FakeEvent[], withVenueFee = true) {
  const registrationOptions: any[] = events.map((event) => ({
    name: event.name,
    id: event.id,
    optionType: 'event',
    values: [
      {
        id: event.id * 10,
        name: event.name,
        optionTypeId: event.id,
        fee: event.fee ?? 1000,
      },
    ],
  }));

  if (withVenueFee) {
    registrationOptions.unshift({
      name: 'Venue Fee',
      id: VENUE_FEE_REG_VALUE_ID,
      optionType: 'tournament',
      values: [
        {
          id: VENUE_FEE_REG_VALUE_ID,
          name: 'Venue Fee',
          optionTypeId: VENUE_FEE_REG_VALUE_ID,
          fee: 500,
        },
      ],
    });
  }

  return {
    currentUser: CURRENT_USER,
    tournamentRegistrationInfo: {
      events: events.map((event) => ({
        id: event.id,
        state: event.state ?? 'CREATED',
      })),
      registrationOptions,
    },
  };
}

export type FakeParticipant = {
  id: number;
  gamerTag: string;
  prefix?: string;
  /** Entrant ids this participant belongs to. Doubles share one. */
  entrantIds?: number[];
  /** Event ids the participant is registered for. */
  eventIds?: number[];
  /** Event ids with a zero balance. */
  paidEventIds?: number[];
  venueFeePaid?: boolean;
};

export function participantsResponse(
  participants: FakeParticipant[],
  pageInfo: { page: number; totalPages: number } = { page: 1, totalPages: 1 },
) {
  return {
    currentUser: CURRENT_USER,
    tournamentRegistrationInfo: {
      participants: {
        pageInfo,
        nodes: participants.map((participant) => ({
          id: participant.id,
          prefix: participant.prefix ?? '',
          gamerTag: participant.gamerTag,
          entrants: (participant.entrantIds ?? []).map((id) => ({ id })),
          registrationSelections: [
            ...(participant.eventIds ?? []).map((eventId) => ({
              regValue: {
                id: eventId * 10,
                optionId: eventId * 10,
                optionType: 'event',
                optionTypeId: eventId,
              },
              balance: (participant.paidEventIds ?? []).includes(eventId)
                ? 0
                : 1000,
            })),
            {
              regValue: {
                id: VENUE_FEE_REG_VALUE_ID,
                optionId: VENUE_FEE_REG_VALUE_ID,
                optionType: 'tournament',
                optionTypeId: VENUE_FEE_REG_VALUE_ID,
              },
              balance: participant.venueFeePaid ? 0 : 500,
            },
          ],
        })),
      },
    },
  };
}

export type FakePool = {
  id: number;
  phase: string;
  /** Defaults to 1. Later phases hold progression seeds and get dropped. */
  phaseOrder?: number;
  name: string;
  entrantIds: number[];
};

export type FakePoolEvent = {
  id: number;
  pools: FakePool[];
};

/**
 * Renders the pool query response for one (groupPage, seedPage) coordinate,
 * slicing groups and seeds exactly the way the real API would.
 *
 * The perPage defaults are this fixture's own, deliberately NOT tied to
 * GROUP_PER_PAGE / SEED_PER_PAGE in main/startgg.ts. A test that wants to
 * exercise pagination passes small values explicitly; retuning the real page
 * sizes must not silently change what any test covers.
 */
export function poolsResponse(
  events: FakePoolEvent[],
  {
    name = 'Test Tournament',
    slug = 'tournament/test',
    groupPage = 1,
    groupPerPage = 25,
    seedPage = 1,
    seedPerPage = 100,
  }: {
    name?: string;
    slug?: string;
    groupPage?: number;
    groupPerPage?: number;
    seedPage?: number;
    seedPerPage?: number;
  } = {},
) {
  return {
    currentUser: CURRENT_USER,
    tournament: {
      name,
      slug,
      events: events.map((event) => {
        const groupStart = (groupPage - 1) * groupPerPage;
        const pagedPools = event.pools.slice(
          groupStart,
          groupStart + groupPerPage,
        );

        return {
          id: event.id,
          paginatedPhaseGroups: {
            pageInfo: {
              page: groupPage,
              totalPages: Math.max(
                1,
                Math.ceil(event.pools.length / groupPerPage),
              ),
            },
            nodes: pagedPools.map((pool) => {
              const seedStart = (seedPage - 1) * seedPerPage;
              const pagedEntrants = pool.entrantIds.slice(
                seedStart,
                seedStart + seedPerPage,
              );

              return {
                id: pool.id,
                displayIdentifier: pool.name,
                phase: {
                  id: pool.id * 2,
                  name: pool.phase,
                  phaseOrder: pool.phaseOrder ?? 1,
                },
                seeds: {
                  pageInfo: {
                    page: seedPage,
                    totalPages: Math.ceil(pool.entrantIds.length / seedPerPage),
                  },
                  nodes: pagedEntrants.map((entrantId) => ({
                    id: entrantId * 100,
                    entrant: { id: entrantId },
                  })),
                },
              };
            }),
          },
        };
      }),
    },
  };
}

/** What fetchUnofficialGql reads to decide someone is logged out. */
export const LOGGED_OUT_RESPONSE = { currentUser: null };

export type GqlCall = {
  operation: 'TournamentEvents' | 'TournamentParticipants' | 'TournamentPools';
  variables: Record<string, any>;
};

function operationOf(query: string): GqlCall['operation'] {
  if (query.includes('query TournamentEvents')) {
    return 'TournamentEvents';
  }
  if (query.includes('query TournamentParticipants')) {
    return 'TournamentParticipants';
  }
  if (query.includes('query TournamentPools')) {
    return 'TournamentPools';
  }
  throw new Error(`Unrecognized query:\n${query}`);
}

/**
 * Installs a global.fetch stub that routes by operation name, records every
 * call, and returns whatever the handler produces. Handlers receive the parsed
 * variables so they can serve the right page.
 */
export function mockGql(handlers: {
  [K in GqlCall['operation']]?: (variables: Record<string, any>) => unknown;
}) {
  const calls: GqlCall[] = [];

  const fetchMock = jest.fn(async (_input: unknown, init?: any) => {
    const body = JSON.parse(init.body);
    const operation = operationOf(body.query);
    const variables = body.variables ?? {};
    calls.push({ operation, variables });

    const handler = handlers[operation];
    if (handler == undefined) {
      throw new Error(`No fixture handler registered for ${operation}`);
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({ data: handler(variables) }),
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return {
    calls,
    callsTo: (operation: GqlCall['operation']) =>
      calls.filter((call) => call.operation === operation),
  };
}
