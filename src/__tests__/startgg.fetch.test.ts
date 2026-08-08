/**
 * The transport layer: wrappedFetch and fetchUnofficialGql.
 *
 * These are the branches that only fire when something has gone wrong - a dead
 * venue wifi connection, an expired session, start.gg having a bad afternoon -
 * which is exactly when nobody running a tournament has time to work out what
 * the app is telling them. So the error strings themselves are asserted
 * verbatim, not just their existence.
 *
 * Everything is driven through getAdminedTournaments, which is the thinnest
 * public caller: one request, no pagination, and no request throttle (that is
 * built per-call inside getRegistration), so the only timer in play is the one
 * the retry schedules.
 *
 * This suite uses real fake timers rather than the setTimeout recorder in
 * __fixtures__/timers.ts. That recorder fires callbacks synchronously, which
 * would make a working 1000ms backoff indistinguishable from no backoff at all.
 *
 * @jest-environment node
 */
import {
  adminedTournamentsResponse,
  gqlErrors,
  gqlOk,
  httpStatus,
  LOGGED_OUT_RESPONSE,
  malformedJson,
  mockGql,
  networkFailure,
} from '../__fixtures__/startgg';
import { COOKIES } from '../__fixtures__/nycMelee';

const loadStartgg = () =>
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  require('../main/startgg') as typeof import('../main/startgg');

const ONE_TOURNAMENT = adminedTournamentsResponse([{ name: 'NYC Melee 100' }]);

beforeEach(() => {
  jest.resetModules();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

/** Run getAdminedTournaments against a single queued response spec. */
function callWith(spec: Parameters<typeof mockGql>[0]['TournamentsQuery']) {
  const gql = mockGql({ TournamentsQuery: spec });
  const { getAdminedTournaments } = loadStartgg();
  return { gql, run: () => getAdminedTournaments(COOKIES) };
}

describe('wrappedFetch, when the request never lands', () => {
  it('says you may not be connected rather than surfacing a fetch error', async () => {
    const { run } = callWith(networkFailure());

    await expect(run()).rejects.toThrow(
      '***You may not be connected to the internet***',
    );
  });
});

describe('wrappedFetch, on a status it will not retry', () => {
  it.each([
    [400, '400 - Bad Request. ***start.gg API key invalid!***'],
    [401, '401 - Unauthorized. ***start.gg API key expired!***'],
    [403, '403 - Forbidden.'],
    [404, '404 - Not Found.'],
  ])('turns %i into %s', async (status, message) => {
    const { run } = callWith(httpStatus(status));

    await expect(run()).rejects.toThrow(message);
  });

  it('does not retry a 501, which is outside the explicit 5xx list', async () => {
    // The code names 500/502/503/504 individually rather than testing
    // status >= 500. This pins that choice: a 501 means "we will never
    // implement this", and retrying it just doubles the wait before the error.
    const { gql, run } = callWith(httpStatus(501));

    await expect(run()).rejects.toThrow('501 - Not Implemented.');
    expect(gql.fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('wrappedFetch, on a retryable 5xx', () => {
  it.each([500, 502, 503, 504])(
    'waits a full second before retrying a %i',
    async (status) => {
      const { gql, run } = callWith([httpStatus(status), ONE_TOURNAMENT]);

      const promise = run();
      await jest.advanceTimersByTimeAsync(0);
      expect(gql.fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(999);
      expect(gql.fetchMock).toHaveBeenCalledTimes(1);

      await jest.advanceTimersByTimeAsync(1);
      expect(gql.fetchMock).toHaveBeenCalledTimes(2);
      await expect(promise).resolves.toEqual([
        { slug: 'nyc-melee-100', name: 'NYC Melee 100' },
      ]);
    },
  );

  it('gives up after one retry, without a trailing period on the message', async () => {
    // The retry arm builds its message separately from the non-retry arm, and
    // formats it slightly differently. Pinned exactly so a future tidy-up is a
    // deliberate change rather than an accident.
    const { gql, run } = callWith([httpStatus(503), httpStatus(500)]);

    // Capture the rejection up front so the timers can be advanced past the
    // backoff before anything is asserted.
    const settled = run().then(
      () => undefined,
      (thrown: Error) => thrown,
    );
    await jest.advanceTimersByTimeAsync(1000);

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    // No trailing period here, unlike the non-retry arm above.
    expect(error!.message).toBe('500 - Internal Server Error');
    expect(gql.fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries with the identical request, cookies and all', async () => {
    const { gql, run } = callWith([httpStatus(503), ONE_TOURNAMENT]);

    const promise = run();
    await jest.advanceTimersByTimeAsync(1000);
    await promise;

    const [first, second] = gql.calls;
    expect(second.query).toBe(first.query);
    expect(second.cookie).toBe(first.cookie);
    expect(second.variables).toEqual(first.variables);
  });

  it('rejects when the retry cannot reach the network at all', async () => {
    // The connection dropping during the backoff is precisely the situation the
    // retry exists for. Before the retry callback had a try/catch the rejection
    // was orphaned, so the promise never settled and the caller hung forever
    // with its spinner up.
    const { gql, run } = callWith([httpStatus(503), networkFailure()]);

    const settled = run().then(
      () => undefined,
      (thrown: Error) => thrown,
    );
    await jest.advanceTimersByTimeAsync(1000);

    const error = await settled;
    expect(error).toBeInstanceOf(Error);
    // The same wording the first attempt uses for an unreachable network.
    expect(error!.message).toBe('***You may not be connected to the internet***');
    expect(gql.fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('fetchUnofficialGql', () => {
  it('posts to the unofficial endpoint with the headers start.gg expects', async () => {
    const gql = mockGql({ TournamentsQuery: ONE_TOURNAMENT });
    const { getAdminedTournaments } = loadStartgg();

    await getAdminedTournaments(COOKIES);

    expect(gql.fetchMock).toHaveBeenCalledWith(
      'https://www.start.gg/api/-/gql',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(gql.calls[0].headers['Content-Type']).toBe('application/json');
    expect(gql.calls[0].headers['client-version']).toBe('20');
  });

  it('joins the cookie jar into a single Cookie header', async () => {
    const gql = mockGql({ TournamentsQuery: ONE_TOURNAMENT });
    const { getAdminedTournaments } = loadStartgg();

    await getAdminedTournaments([
      { name: 'a', value: '1' },
      { name: 'b', value: '2' },
    ] as any);

    expect(gql.calls[0].cookie).toBe('a=1; b=2');
  });

  it('sends an empty Cookie header for an empty jar', async () => {
    const gql = mockGql({ TournamentsQuery: ONE_TOURNAMENT });
    const { getAdminedTournaments } = loadStartgg();

    await getAdminedTournaments([]);

    expect(gql.calls[0].cookie).toBe('');
  });

  it('sends no Cookie header at all when there is no jar', async () => {
    // The `?.` arm - reachable at startup before any login has happened.
    const gql = mockGql({ TournamentsQuery: LOGGED_OUT_RESPONSE });
    const { getAdminedTournaments } = loadStartgg();

    await getAdminedTournaments(undefined as any);

    expect(gql.calls[0].cookie).toBeUndefined();
  });

  it('sends the query and variables as the JSON body', async () => {
    const gql = mockGql({ TournamentsQuery: ONE_TOURNAMENT });
    const { getAdminedTournaments } = loadStartgg();

    await getAdminedTournaments(COOKIES);

    expect(gql.calls[0].query).toContain('query TournamentsQuery');
    expect(gql.calls[0].variables).toEqual({});
  });

  it('throws the first GraphQL error message', async () => {
    const { run } = callWith(
      gqlErrors(['Something went wrong', 'And another thing']),
    );

    await expect(run()).rejects.toThrow('Something went wrong');
  });

  it('treats an empty errors array as success', async () => {
    const { run } = callWith({
      ...gqlOk(ONE_TOURNAMENT),
      body: { errors: [], data: ONE_TOURNAMENT },
    });

    await expect(run()).resolves.toEqual([
      { slug: 'nyc-melee-100', name: 'NYC Melee 100' },
    ]);
  });

  it('prefers the errors array even when data came back too', async () => {
    const { run } = callWith(gqlErrors(['Partial failure'], ONE_TOURNAMENT));

    await expect(run()).rejects.toThrow('Partial failure');
  });

  it('reads a missing currentUser as logged out', async () => {
    const { run } = callWith(LOGGED_OUT_RESPONSE);

    await expect(run()).resolves.toBeUndefined();
  });

  it('reads a currentUser with no id as logged out', async () => {
    const { run } = callWith({ currentUser: {} });

    await expect(run()).resolves.toBeUndefined();
  });

  it('does not read user id 0 as logged out', async () => {
    // The check is `== undefined`, not a truthiness test. Tightening it to
    // `!currentUser?.id` would log out a user whose id happened to be falsy.
    const { run } = callWith({
      currentUser: { id: 0, tournaments: { nodes: [] } },
    });

    await expect(run()).resolves.toEqual([]);
  });

  it('surfaces a body that is not JSON as the parse error', async () => {
    const { run } = callWith(malformedJson());

    await expect(run()).rejects.toThrow(SyntaxError);
  });
});
