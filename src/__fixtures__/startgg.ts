/**
 * Builders for fake start.gg responses, shaped like the unofficial API's
 * replies to the queries in main/startgg.ts.
 *
 * These are hand-built rather than captured so that pagination and edge cases
 * can be dialled in per test. The shapes they produce are the contract - if a
 * real capture ever disagrees with one of these, the builder is wrong.
 */

export const CURRENT_USER = { id: 1234 };

/**
 * The venue fee's three ids are deliberately all different, because the real API
 * returns them that way (see captured/tournamentEventsUnstarted.json, where they
 * are 5903305 / 6447006 / 935414) and the code reads a different one per case:
 *
 *   - ingestEvents reads values[0].id for `tournament` options, and that becomes
 *     the venueFeeOption everything else keys on.
 *   - ingestEvents reads values[0].optionTypeId for `event` options instead.
 *   - ingestParticipants keys paidStatuses off regValue.id.
 *   - The registrationOption's own `id` is never read at all.
 *
 * If these were all one number, a fixture could not tell a correct read from a
 * wrong one. VENUE_FEE_REG_VALUE_ID keeps its original value so that existing
 * assertions against it still mean the same thing.
 */
export const VENUE_FEE_OPTION_ID = 9000;
export const VENUE_FEE_REG_VALUE_ID = 9001;
export const VENUE_FEE_OPTION_TYPE_ID = 9002;

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
      id: VENUE_FEE_OPTION_ID,
      optionType: 'tournament',
      values: [
        {
          id: VENUE_FEE_REG_VALUE_ID,
          name: 'Venue Fee',
          optionTypeId: VENUE_FEE_OPTION_TYPE_ID,
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
  /** Omit the venue fee selection entirely, as an unpaid-and-unlisted attendee. */
  noVenueFeeSelection?: boolean;
};

/**
 * The registrationSelections array for one participant.
 *
 * Shared by participantsResponse and updateRegistrationResponse so the query and
 * the mutation can never drift into describing the same registration two ways.
 * Note the `withOptionId` flag: the participants query asks for `optionId` and
 * the mutation does not, so their regValue shapes genuinely differ.
 */
function registrationSelectionsFor(
  participant: FakeParticipant,
  { withOptionId }: { withOptionId: boolean },
) {
  const selections: any[] = (participant.eventIds ?? []).map((eventId) => ({
    regValue: {
      id: eventId * 10,
      ...(withOptionId ? { optionId: eventId * 10 } : {}),
      optionType: 'event',
      optionTypeId: eventId,
    },
    balance: (participant.paidEventIds ?? []).includes(eventId) ? 0 : 1000,
  }));

  if (!participant.noVenueFeeSelection) {
    selections.push({
      regValue: {
        id: VENUE_FEE_REG_VALUE_ID,
        ...(withOptionId ? { optionId: VENUE_FEE_REG_VALUE_ID } : {}),
        optionType: 'tournament',
        optionTypeId: VENUE_FEE_OPTION_TYPE_ID,
      },
      balance: participant.venueFeePaid ? 0 : 500,
    });
  }

  return selections;
}

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
          registrationSelections: registrationSelectionsFor(participant, {
            withOptionId: true,
          }),
        })),
      },
    },
  };
}

/**
 * The mutation's reply: the participant's complete new registration state.
 *
 * Deliberately built from the same FakeParticipant shape as participantsResponse,
 * so a test can hand it a *different* set of eventIds than the participant
 * currently holds locally and watch updateParticipantRegistration wipe and
 * rebuild. captured/updateParticipantRegistration.json shows the real API doing
 * exactly that - it omits an event the participant is no longer in rather than
 * reporting it as unregistered.
 */
export function updateRegistrationResponse(participant: FakeParticipant) {
  return {
    updateParticipantRegistration: {
      id: participant.id,
      registrationSelections: registrationSelectionsFor(participant, {
        withOptionId: false,
      }),
    },
  };
}

export type FakeAdminedTournament = {
  name: string;
  /** Defaults to `tournament/<name slugified>`, so slice(11) has something to strip. */
  slug?: string;
  hasOfflineEvents?: boolean;
};

export function adminedTournamentsResponse(
  tournaments: FakeAdminedTournament[],
) {
  return {
    currentUser: {
      ...CURRENT_USER,
      tournaments: {
        nodes: tournaments.map((tournament) => ({
          hasOfflineEvents: tournament.hasOfflineEvents ?? true,
          name: tournament.name,
          slug:
            tournament.slug ??
            `tournament/${tournament.name.toLowerCase().replace(/\s+/g, '-')}`,
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

/*
 * ---------------------------------------------------------------------------
 * Transport-level responses
 *
 * A handler may return raw `data` (the common case, and what every handler did
 * before these existed), or one of the envelopes below to control what the HTTP
 * layer itself does. That is the only way to reach wrappedFetch's error matrix:
 * its retry, its 400/401 messages, and its offline branch are all invisible to a
 * fixture that can only ever answer 200 OK.
 * ---------------------------------------------------------------------------
 */

const RESPONSE_TAG = '__startggFixtureResponse';

export type FixtureResponse = {
  [RESPONSE_TAG]: true;
  ok: boolean;
  status: number;
  statusText: string;
  /** Thrown by `fetch` itself, before any response exists. */
  rejectsWith?: Error;
  /**
   * An unparsed body, handed to `JSON.parse` as-is by `response.json()`. Use it
   * to make the parse fail for real rather than with a hand-written error.
   */
  rawBody?: string;
  body?: unknown;
};

function isFixtureResponse(value: unknown): value is FixtureResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    RESPONSE_TAG in (value as any)
  );
}

/** 200 OK carrying `{ data }`. This is what a bare handler return becomes. */
export function gqlOk(data: unknown): FixtureResponse {
  return {
    [RESPONSE_TAG]: true,
    ok: true,
    status: 200,
    statusText: 'OK',
    body: { data },
  };
}

/**
 * 200 OK carrying a GraphQL `errors` array. start.gg reports application-level
 * failures this way, with an HTTP 200 - fetchUnofficialGql throws on errors[0].
 */
export function gqlErrors(
  messages: string[],
  data: unknown = null,
): FixtureResponse {
  return {
    [RESPONSE_TAG]: true,
    ok: true,
    status: 200,
    statusText: 'OK',
    body: { errors: messages.map((message) => ({ message })), data },
  };
}

const DEFAULT_STATUS_TEXT: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  500: 'Internal Server Error',
  501: 'Not Implemented',
  502: 'Bad Gateway',
  503: 'Service Unavailable',
  504: 'Gateway Timeout',
};

export function httpStatus(
  status: number,
  statusText = DEFAULT_STATUS_TEXT[status] ?? 'Error',
): FixtureResponse {
  return {
    [RESPONSE_TAG]: true,
    ok: false,
    status,
    statusText,
    body: {},
  };
}

/** `fetch` rejects outright, the way it does with no network. */
export function networkFailure(
  error: Error = new TypeError('Failed to fetch'),
): FixtureResponse {
  return {
    [RESPONSE_TAG]: true,
    ok: false,
    status: 0,
    statusText: '',
    rejectsWith: error,
  };
}

/**
 * 200 OK whose body isn't JSON.
 *
 * This is what a stale cookie jar gets: start.gg answers the unofficial
 * endpoint with a page instead of a GraphQL envelope, and `response.json()`
 * blows up before any of our own logged-out handling gets a look in. The
 * default body reproduces the shape seen in the wild - a JSON envelope with a
 * second line of markup stuck on the end, which is why the real error reads
 * "Unexpected non-whitespace character after JSON" rather than the more obvious
 * "Unexpected token <".
 */
export function malformedJson(
  rawBody = `{"redirect":"https:\\/\\/start.gg\\/login"}\n<!DOCTYPE html><html><body>Log in to start.gg</body></html>`,
): FixtureResponse {
  return {
    [RESPONSE_TAG]: true,
    ok: true,
    status: 200,
    statusText: 'OK',
    rawBody,
  };
}

export type GqlOperation =
  | 'TournamentEvents'
  | 'TournamentParticipants'
  | 'TournamentPools'
  | 'TournamentsQuery'
  | 'UpdateParticipantRegistration';

export type GqlCall = {
  operation: GqlOperation;
  variables: Record<string, any>;
  query: string;
  headers: Record<string, any>;
  cookie: string | undefined;
};

function operationOf(query: string): GqlOperation {
  if (query.includes('query TournamentEvents')) {
    return 'TournamentEvents';
  }
  if (query.includes('query TournamentParticipants')) {
    return 'TournamentParticipants';
  }
  if (query.includes('query TournamentPools')) {
    return 'TournamentPools';
  }
  if (query.includes('query TournamentsQuery')) {
    return 'TournamentsQuery';
  }
  if (query.includes('mutation UpdateParticipantRegistration')) {
    return 'UpdateParticipantRegistration';
  }
  throw new Error(`Unrecognized query:\n${query}`);
}

/**
 * Either a value to return, or a function of the request's variables.
 *
 * Spelled out rather than `Handler | unknown`, because `unknown` absorbs every
 * other member of a union - which would leave handler arrow functions with no
 * contextual type and their `variables` parameter implicitly `any`.
 */
type Handler = (variables: Record<string, any>) => unknown;
type Entry = Handler | FixtureResponse | Record<string, unknown>;

/**
 * One entry, or a queue of them. A queue is consumed one entry per call to that
 * operation, and the last entry repeats forever once reached - so
 * `[httpStatus(503), gqlOk(data)]` means "fail once, then succeed", which is
 * what makes wrappedFetch's retry observable without hand-rolled call counters.
 */
export type HandlerSpec = Entry | Entry[];

/**
 * Installs a global.fetch stub that routes by operation name, records every
 * call, and returns whatever the handler produces. Handlers receive the parsed
 * variables so they can serve the right page.
 */
export function mockGql(handlers: {
  [K in GqlOperation]?: HandlerSpec;
}) {
  const calls: GqlCall[] = [];
  const callCounts = new Map<GqlOperation, number>();

  const fetchMock = jest.fn(async (_input: unknown, init?: any) => {
    const body = JSON.parse(init.body);
    const operation = operationOf(body.query);
    const variables = body.variables ?? {};
    const headers = init.headers ?? {};
    calls.push({
      operation,
      variables,
      query: body.query,
      headers,
      cookie: headers.Cookie,
    });

    const spec = handlers[operation];
    if (spec === undefined) {
      throw new Error(`No fixture handler registered for ${operation}`);
    }

    const callIndex = callCounts.get(operation) ?? 0;
    callCounts.set(operation, callIndex + 1);

    const entry = Array.isArray(spec)
      ? spec[Math.min(callIndex, spec.length - 1)]
      : spec;
    const produced = typeof entry === 'function' ? entry(variables) : entry;
    const response = isFixtureResponse(produced) ? produced : gqlOk(produced);

    if (response.rejectsWith) {
      throw response.rejectsWith;
    }

    return {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      json: async () => {
        if (response.rawBody !== undefined) {
          return JSON.parse(response.rawBody);
        }
        return response.body;
      },
    };
  });

  global.fetch = fetchMock as unknown as typeof fetch;

  return {
    calls,
    fetchMock,
    callsTo: (operation: GqlOperation) =>
      calls.filter((call) => call.operation === operation),
  };
}
