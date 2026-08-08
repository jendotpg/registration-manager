/**
 * The state layer: everything that changes a participant's registration, plus
 * the tournament-swap and admined-list behaviour around it.
 *
 * This is the part of the app that writes to start.gg. A dropped toggle here is
 * somebody paying twice or not getting into a bracket, so the tests care about
 * exactly what goes on the wire and exactly what the local model looks like
 * afterwards.
 *
 * startgg.ts holds its tournament in module state, so every test re-imports
 * through a fresh registry.
 *
 * @jest-environment node
 */
import { NullableBoolean } from '../common/types';
import {
  adminedTournamentsResponse,
  gqlErrors,
  httpStatus,
  LOGGED_OUT_RESPONSE,
  malformedJson,
  mockGql,
  updateRegistrationResponse,
  VENUE_FEE_REG_VALUE_ID,
} from '../__fixtures__/startgg';
import {
  ALICE,
  BOB,
  COOKIES,
  loadNycMelee,
  mockNycMelee,
  NYC_MELEE_SLUG,
  REDEMPTION,
  SINGLES,
} from '../__fixtures__/nycMelee';
import { installSyntheticTimers } from '../__fixtures__/timers';

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

const participantIn = (startgg: typeof import('../main/startgg'), id: number) =>
  startgg.getCurrentTournament()!.participants.find((p) => p.id === id)!;

/** Mount NYC Melee with a mutation handler wired in. */
async function loadWithMutation(
  response: unknown,
  overrides: Parameters<typeof loadNycMelee>[0] = {},
) {
  return loadNycMelee({
    ...overrides,
    responses: {
      ...overrides.responses,
      UpdateParticipantRegistration: () => response,
    },
  });
}

describe('getTournament', () => {
  it('stores the tournament with no toggles in flight', async () => {
    const { startgg, tournament } = await loadNycMelee();

    expect(tournament!.slug).toBe(NYC_MELEE_SLUG);
    expect(tournament!.updatingCheckboxes).toEqual([]);
    expect(startgg.getCurrentTournament()).toBe(tournament);
  });

  it('keeps the search and filters when the same tournament is reloaded', async () => {
    // Hitting refresh mid-event must not throw away what the desk had typed.
    const { startgg } = await loadNycMelee();
    startgg.updateParticipantsFiltered('alice', {});

    mockNycMelee();
    await startgg.getTournament(COOKIES, NYC_MELEE_SLUG);

    const visible = startgg
      .getCurrentTournament()!
      .participants.filter((p) => !p.filtered);
    expect(visible.map((p) => p.displayName)).toEqual(['Alice']);
  });

  it('clears the search and filters when a different tournament is loaded', async () => {
    const { startgg } = await loadNycMelee();
    startgg.updateParticipantsFiltered('alice', {});

    mockNycMelee({ slug: 'tournament/some-other-event', name: 'Other' });
    await startgg.getTournament(COOKIES, 'tournament/some-other-event');

    const visible = startgg
      .getCurrentTournament()!
      .participants.filter((p) => !p.filtered);
    expect(visible).toHaveLength(5);
  });

  it('compares against the resolved slug, so a short slug still reloads cleanly', async () => {
    // The desk types "nyc-melee-100"; the pools query answers with the full
    // "tournament/nyc-melee-100". Comparing against the raw input would treat
    // every refresh as a new tournament and wipe the filters each time.
    const { startgg } = await loadNycMelee();
    startgg.updateParticipantsFiltered('alice', {});

    mockNycMelee();
    await startgg.getTournament(COOKIES, 'nyc-melee-100');

    const visible = startgg
      .getCurrentTournament()!
      .participants.filter((p) => !p.filtered);
    expect(visible.map((p) => p.displayName)).toEqual(['Alice']);
  });

  it('keeps the loaded tournament when a reload comes back logged out', async () => {
    const { startgg } = await loadNycMelee();

    mockGql({ TournamentEvents: () => LOGGED_OUT_RESPONSE });
    const result = await startgg.getTournament(COOKIES, NYC_MELEE_SLUG);

    expect(result).toBeUndefined();
    // Losing the session should not blank the table someone is working from.
    expect(startgg.getCurrentTournament()!.participants).toHaveLength(5);
  });
});

describe('toggleParticipantPaid', () => {
  it('does nothing when no tournament is loaded', async () => {
    const startgg = loadStartgg();

    await expect(
      startgg.toggleParticipantPaid(ALICE, SINGLES),
    ).resolves.toBeUndefined();
    expect(startgg.getCurrentTournament()).toBeUndefined();
  });

  it('does nothing when the tournament has no venue fee option', async () => {
    // venueFeeOption is required even for an event toggle, because the mutation
    // that follows always re-sends the venue fee alongside it.
    const { startgg } = await loadNycMelee({ withVenueFee: false });

    await startgg.toggleParticipantPaid(ALICE, SINGLES);

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([]);
  });

  it('does nothing for an attendee who is not in the tournament', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantPaid(9999, SINGLES);

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([]);
  });

  it('marks an unpaid registration paid', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantPaid(BOB, SINGLES);

    expect(participantIn(startgg, BOB).paidStatuses[SINGLES]).toBe(true);
  });

  it('marks a paid registration unpaid again', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantPaid(ALICE, SINGLES);

    expect(participantIn(startgg, ALICE).paidStatuses[SINGLES]).toBe(false);
  });

  it('also adds someone to an event when they pay for it', async () => {
    // Paying at the desk for an event you were not in is how a late entry
    // happens, so paying implies adding.
    const { startgg } = await loadNycMelee();
    const erin = participantIn(startgg, 5);
    expect(erin.registeredStatuses[SINGLES]).toBeUndefined();

    await startgg.toggleParticipantPaid(5, SINGLES);

    expect(erin.registeredStatuses[SINGLES]).toBe(true);
  });

  it('does not touch registration when the venue fee is paid', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantPaid(ALICE, VENUE_FEE_REG_VALUE_ID);

    expect(
      participantIn(startgg, ALICE).registeredStatuses[VENUE_FEE_REG_VALUE_ID],
    ).toBeUndefined();
  });

  it('does not un-register anyone when a payment is reversed', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantPaid(ALICE, SINGLES);

    expect(participantIn(startgg, ALICE).registeredStatuses[SINGLES]).toBe(
      true,
    );
  });

  it('records the checkbox as in flight', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantPaid(ALICE, SINGLES);
    await startgg.toggleParticipantPaid(BOB, SINGLES);

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([
      `${ALICE};${SINGLES}`,
      `${BOB};${SINGLES}`,
    ]);
  });
});

describe('toggleParticipantAdded', () => {
  it('does nothing when no tournament is loaded', async () => {
    const startgg = loadStartgg();

    await expect(
      startgg.toggleParticipantAdded(ALICE, SINGLES),
    ).resolves.toBeUndefined();
  });

  it('does nothing for an unknown attendee', async () => {
    const { startgg } = await loadNycMelee();

    await startgg.toggleParticipantAdded(9999, SINGLES);

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([]);
  });

  it('works without a venue fee option, unlike its paid counterpart', async () => {
    // Adding somebody to a bracket does not involve money, so it does not need
    // the venue fee. Worth pinning because the two guards look alike.
    const { startgg } = await loadNycMelee({ withVenueFee: false });

    await startgg.toggleParticipantAdded(ALICE, SINGLES);

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([
      `${ALICE};${SINGLES}`,
    ]);
  });

  it('flips an absent registration on and then off', async () => {
    const { startgg } = await loadNycMelee();
    const erin = participantIn(startgg, 5);

    await startgg.toggleParticipantAdded(5, SINGLES);
    expect(erin.registeredStatuses[SINGLES]).toBe(true);

    await startgg.toggleParticipantAdded(5, SINGLES);
    expect(erin.registeredStatuses[SINGLES]).toBe(false);
  });
});

describe('updateParticipantRegistration', () => {
  const mutationCall = (gql: ReturnType<typeof mockGql>) =>
    gql.callsTo('UpdateParticipantRegistration')[0];

  it('sends nothing when no tournament is loaded', async () => {
    const gql = mockGql({});
    const startgg = loadStartgg();

    await startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES);

    expect(gql.calls).toHaveLength(0);
  });

  it('sends nothing for an unknown attendee', async () => {
    const { startgg, gql } = await loadWithMutation({});
    const before = gql.calls.length;

    await startgg.updateParticipantRegistration(COOKIES, 9999, SINGLES);

    expect(gql.calls).toHaveLength(before);
  });

  it('sends the venue fee alongside the registration being changed', async () => {
    const { startgg, gql } = await loadWithMutation(
      updateRegistrationResponse({
        id: ALICE,
        gamerTag: 'Alice',
        eventIds: [SINGLES],
        paidEventIds: [SINGLES],
      }),
    );

    await startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES);

    expect(mutationCall(gql).variables).toEqual({
      participantId: ALICE,
      regValueId: VENUE_FEE_REG_VALUE_ID,
      regValuePaid: false,
      eventIds: [String(SINGLES)],
      paidEventIds: [String(SINGLES)],
    });
  });

  it('leaves the venue fee out of paidEventIds', async () => {
    // The venue fee travels as regValueId/regValuePaid. Repeating it in
    // paidEventIds would ask start.gg to treat it as an event entry.
    const { startgg, gql } = await loadWithMutation(
      updateRegistrationResponse({ id: ALICE, gamerTag: 'Alice' }),
    );
    await startgg.toggleParticipantPaid(ALICE, VENUE_FEE_REG_VALUE_ID);

    await startgg.updateParticipantRegistration(
      COOKIES,
      ALICE,
      VENUE_FEE_REG_VALUE_ID,
    );

    const { variables } = mutationCall(gql);
    expect(variables.regValuePaid).toBe(true);
    expect(variables.paidEventIds).not.toContain(
      String(VENUE_FEE_REG_VALUE_ID),
    );
  });

  it('sends only the events the participant is actually registered for', async () => {
    const { startgg, gql } = await loadWithMutation(
      updateRegistrationResponse({ id: 5, gamerTag: 'Erin' }),
    );
    await startgg.toggleParticipantAdded(5, SINGLES);
    await startgg.toggleParticipantAdded(5, SINGLES); // back off again

    await startgg.updateParticipantRegistration(COOKIES, 5, SINGLES);

    expect(mutationCall(gql).variables.eventIds).toEqual([String(REDEMPTION)]);
  });

  it('omits regValuePaid entirely when there is no venue fee selection', async () => {
    const { startgg, gql } = await loadWithMutation(
      updateRegistrationResponse({ id: 1, gamerTag: 'Solo' }),
      {
        participants: [
          {
            id: 1,
            gamerTag: 'Solo',
            entrantIds: [11],
            eventIds: [SINGLES],
            noVenueFeeSelection: true,
          },
        ],
      },
    );

    await startgg.updateParticipantRegistration(COOKIES, 1, SINGLES);

    // JSON.stringify drops undefined values, so the key never reaches start.gg.
    expect('regValuePaid' in mutationCall(gql).variables).toBe(false);
  });

  it('rebuilds both status maps from the response, dropping what is absent', async () => {
    // The real API answers with the participant's complete new state rather
    // than a delta - captured/updateParticipantRegistration.json comes back
    // without Melee Singles at all. Merging instead of replacing would
    // resurrect a registration start.gg had just removed.
    const { startgg } = await loadWithMutation(
      updateRegistrationResponse({
        id: ALICE,
        gamerTag: 'Alice',
        eventIds: [REDEMPTION],
        paidEventIds: [REDEMPTION],
        venueFeePaid: true,
      }),
    );
    expect(participantIn(startgg, ALICE).registeredStatuses[SINGLES]).toBe(
      true,
    );

    await startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES);

    const alice = participantIn(startgg, ALICE);
    expect(alice.registeredStatuses).toEqual({ [REDEMPTION]: true });
    expect(alice.paidStatuses).toEqual({
      [REDEMPTION]: true,
      [VENUE_FEE_REG_VALUE_ID]: true,
    });
  });

  it('clears the in-flight marker for that checkbox and no other', async () => {
    const { startgg } = await loadWithMutation(
      updateRegistrationResponse({
        id: ALICE,
        gamerTag: 'Alice',
        eventIds: [SINGLES],
      }),
    );
    await startgg.toggleParticipantPaid(ALICE, SINGLES);
    await startgg.toggleParticipantPaid(BOB, SINGLES);

    await startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES);

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([
      `${BOB};${SINGLES}`,
    ]);
  });

  it('re-filters only the participant it updated', async () => {
    const { startgg } = await loadWithMutation(
      updateRegistrationResponse({
        id: BOB,
        gamerTag: 'Bob',
        eventIds: [SINGLES],
        paidEventIds: [SINGLES],
      }),
    );
    startgg.updateParticipantsFiltered('', {
      [SINGLES]: {
        paid: NullableBoolean.Include,
        added: NullableBoolean.Indeterminate,
        pools: {},
      },
    });
    expect(participantIn(startgg, BOB).filtered).toBe(true);
    expect(participantIn(startgg, ALICE).filtered).toBe(false);

    await startgg.updateParticipantRegistration(COOKIES, BOB, SINGLES);

    // Bob has become paid, so he now passes the filter he was failing.
    expect(participantIn(startgg, BOB).filtered).toBe(false);
    expect(participantIn(startgg, ALICE).filtered).toBe(false);
  });

  it('clears the in-flight marker when the mutation fails', async () => {
    // A key left in updatingCheckboxes reads as "Updating..." and disables both
    // checkboxes in that cell, so a failed write locks the row until the whole
    // tournament is reloaded. Failure has to release the checkbox just as
    // success does.
    const { startgg } = await loadWithMutation(gqlErrors(['Nope']));
    await startgg.toggleParticipantPaid(ALICE, SINGLES);

    await expect(
      startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES),
    ).rejects.toThrow('Nope');

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([]);
  });

  it('names the expired session when a mutation comes back as a login page', async () => {
    // A query can answer "logged out" by resolving undefined, but a mutation's
    // caller reads fields straight off the response, so this branch has to
    // throw - and it has to throw something the desk can act on rather than a
    // JSON parse error from deep inside undici.
    const { startgg } = await loadWithMutation(malformedJson());
    await startgg.toggleParticipantPaid(ALICE, SINGLES);

    await expect(
      startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES),
    ).rejects.toThrow('***start.gg login expired, please log in again!***');

    expect(startgg.getCurrentTournament()!.updatingCheckboxes).toEqual([]);
  });

  it('rolls the optimistic flip back when the mutation fails', async () => {
    // The toggle applies locally before the write is confirmed. If the write
    // never lands, the row has to go back to what start.gg still holds -
    // otherwise the desk sees "paid" for somebody who is not, which is the
    // worst possible way for this to fail.
    const { startgg } = await loadWithMutation(gqlErrors(['Nope']));
    const before = participantIn(startgg, BOB).paidStatuses[SINGLES];
    await startgg.toggleParticipantPaid(BOB, SINGLES);

    await expect(
      startgg.updateParticipantRegistration(COOKIES, BOB, SINGLES),
    ).rejects.toThrow('Nope');

    expect(participantIn(startgg, BOB).paidStatuses[SINGLES]).toBe(before);
  });

  it('rolls back the registration a failed payment implied', async () => {
    // Paying for an event also adds the participant to it, so a failed payment
    // must not leave them showing as entered in a bracket they were never
    // added to.
    const { startgg } = await loadWithMutation(gqlErrors(['Nope']));
    await startgg.toggleParticipantPaid(5, SINGLES);

    await expect(
      startgg.updateParticipantRegistration(COOKIES, 5, SINGLES),
    ).rejects.toThrow('Nope');

    expect(participantIn(startgg, 5).registeredStatuses[SINGLES]).toBeFalsy();
  });

  it('leaves the model alone when the failed write followed no toggle', async () => {
    // ipc.ts always toggles first, but the two are separate exported functions
    // and the rollback must not invent a change nobody made.
    const { startgg } = await loadWithMutation(gqlErrors(['Nope']));
    const before = { ...participantIn(startgg, ALICE).paidStatuses };

    await expect(
      startgg.updateParticipantRegistration(COOKIES, ALICE, SINGLES),
    ).rejects.toThrow('Nope');

    expect(participantIn(startgg, ALICE).paidStatuses).toEqual(before);
  });
});

describe('getAdminedTournaments', () => {
  const load = (spec: Parameters<typeof mockGql>[0]['TournamentsQuery']) => {
    mockGql({ TournamentsQuery: spec });
    return loadStartgg();
  };

  it('strips the tournament/ prefix from every slug', async () => {
    const { getAdminedTournaments } = load(
      adminedTournamentsResponse([
        { name: 'Stock Exchange #60', slug: 'tournament/stock-exchange-60' },
      ]),
    );

    await expect(getAdminedTournaments(COOKIES)).resolves.toEqual([
      { slug: 'stock-exchange-60', name: 'Stock Exchange #60' },
    ]);
  });

  it('drops tournaments with no offline events', async () => {
    // An online-only tournament has nobody to check in at a desk.
    const { getAdminedTournaments } = load(
      adminedTournamentsResponse([
        { name: 'Offline', hasOfflineEvents: true },
        { name: 'Online Only', hasOfflineEvents: false },
      ]),
    );

    await expect(getAdminedTournaments(COOKIES)).resolves.toEqual([
      { slug: 'offline', name: 'Offline' },
    ]);
  });

  it('slices positionally, so a short slug is simply truncated', async () => {
    // slice(11) assumes the prefix; nothing validates it.
    const { getAdminedTournaments } = load(
      adminedTournamentsResponse([{ name: 'Short', slug: 'abc' }]),
    );

    await expect(getAdminedTournaments(COOKIES)).resolves.toEqual([
      { slug: '', name: 'Short' },
    ]);
  });

  it('returns an empty list when the account admins nothing offline', async () => {
    const { getAdminedTournaments } = load(adminedTournamentsResponse([]));

    await expect(getAdminedTournaments(COOKIES)).resolves.toEqual([]);
  });

  it('is undefined when logged out', async () => {
    const { getAdminedTournaments } = load(LOGGED_OUT_RESPONSE);

    await expect(getAdminedTournaments(COOKIES)).resolves.toBeUndefined();
  });

  it('rethrows a GraphQL error rather than swallowing it', async () => {
    const { getAdminedTournaments } = load(gqlErrors(['Rate limited']));

    await expect(getAdminedTournaments(COOKIES)).rejects.toThrow(
      'Rate limited',
    );
  });

  it('rethrows an expired session as the API key message', async () => {
    const { getAdminedTournaments } = load(httpStatus(401));

    await expect(getAdminedTournaments(COOKIES)).rejects.toThrow(
      '***start.gg API key expired!***',
    );
  });
});
