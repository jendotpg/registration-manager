import { Cookie } from 'electron';
import {
  AdminedTournament,
  Id,
  Tournament,
  Participant,
  Pool,
  RegistrationOption,
  FilterState,
  NullableBoolean,
  UNSEEDED_POOL,
  UNSEEDED_POOL_ID,
  matchesNullableBoolean,
} from '../common/types';

let currentTournament: Tournament | undefined;
let venueFeeOption: Id | undefined;

let currentSearchText = '';
let currentFilters: Record<Id, FilterState> = {};

const PARTICIPANT_PER_PAGE = 100;
const GROUP_PER_PAGE = 10;
const SEED_PER_PAGE = 50;
const MAX_POOL_PAGES = 4;
const MAX_PARTICIPANT_PAGES = 50;
const FREE_REQUESTS = 10;
const MIN_PAGINATION_DELAY_MS = 50;
const MAX_PAGINATION_DELAY_MS = 300;
const PAGINATION_DELAY_STEP_MS = 50;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function makeRequestThrottle() {
  let requests = 0;
  return async () => {
    requests += 1;
    if (requests <= FREE_REQUESTS) {
      return;
    }
    await sleep(
      Math.min(
        MAX_PAGINATION_DELAY_MS,
        MIN_PAGINATION_DELAY_MS +
          (requests - FREE_REQUESTS - 1) * PAGINATION_DELAY_STEP_MS,
      ),
    );
  };
}

enum GQL_TYPE {
  MUTATION,
  QUERY,
}

export function getCurrentTournament() {
  return currentTournament;
}

function getParticipant(id: Id) {
  return currentTournament?.participants.find(
    (participant) => participant.id === id,
  );
}

function poolFilterActive(filterState: FilterState) {
  return Object.values(filterState.pools).some((checked) => !checked);
}

function matchesPoolFilter(
  filterState: FilterState,
  participant: Participant,
  optionId: Id,
) {
  if (!poolFilterActive(filterState)) {
    return true;
  }
  const pool = participant.pools[optionId];
  return !!filterState.pools[pool ? pool.id : UNSEEDED_POOL_ID];
}

function applyFilters(participants: Participant[]) {
  if (currentTournament === undefined) {
    return;
  }

  const search = currentSearchText.toLowerCase();

  const eventOptionIds = new Set(
    currentTournament.registrationOptions
      .filter((registrationOption) => registrationOption.type === 'event')
      .map((registrationOption) => registrationOption.id),
  );

  const activeFilters = Object.entries(currentFilters)
    .map(([optionId, filterState]) => [Number(optionId), filterState] as const)
    .filter(
      ([optionId, filterState]) =>
        filterState.paid !== NullableBoolean.Indeterminate ||
        (eventOptionIds.has(optionId) &&
          (filterState.added !== NullableBoolean.Indeterminate ||
            poolFilterActive(filterState))),
    );

  for (const participant of participants) {
    const matchesSearch =
      search === '' ||
      `${participant.prefix}|${participant.displayName}`
        .toLowerCase()
        .includes(search);

    participant.filtered =
      !matchesSearch ||
      !activeFilters.every(
        ([optionId, filterState]) =>
          matchesNullableBoolean(
            filterState.paid,
            !!participant.paidStatuses[optionId],
          ) &&
          (!eventOptionIds.has(optionId) ||
            (matchesNullableBoolean(
              filterState.added,
              !!participant.registeredStatuses[optionId],
            ) &&
              matchesPoolFilter(filterState, participant, optionId))),
      );
  }
}

export function updateParticipantsFiltered(
  searchText: string,
  filters: Record<Id, FilterState>,
) {
  if (currentTournament === undefined) {
    return;
  }

  currentSearchText = searchText;
  currentFilters = filters;
  applyFilters(currentTournament.participants);
}

async function wrappedFetch(
  input: URL | RequestInfo,
  init?: RequestInit | undefined,
): Promise<Response> {
  let response: Response | undefined;
  try {
    response = await fetch(input, init);
  } catch {
    throw new Error('***You may not be connected to the internet***');
  }
  if (!response.ok) {
    if (
      response.status === 500 ||
      response.status === 502 ||
      response.status === 503 ||
      response.status === 504
    ) {
      return new Promise((resolve, reject) => {
        setTimeout(async () => {
          const retryResponse = await fetch(input, init);
          if (!retryResponse.ok) {
            reject(
              new Error(
                `${retryResponse.status} - ${retryResponse.statusText}`,
              ),
            );
          } else {
            resolve(retryResponse);
          }
        }, 1000);
      });
    }
    let keyErr = '';
    if (response.status === 400) {
      keyErr = ' ***start.gg API key invalid!***';
    } else if (response.status === 401) {
      keyErr = ' ***start.gg API key expired!***';
    }
    throw new Error(`${response.status} - ${response.statusText}.${keyErr}`);
  }

  return response;
}

export async function getTournament(cookies: Cookie[], slug: string) {
  return getRegistration(cookies, slug).then((registration) => {
    if (registration == undefined) {
      return undefined;
    }

    const tournament = {
      ...registration,
      updatingCheckboxes: [],
    };

    if (currentTournament?.slug !== registration.slug) {
      currentSearchText = '';
      currentFilters = {};
    }

    currentTournament = tournament;
    applyFilters(currentTournament.participants);
    return tournament;
  });
}

async function fetchUnofficialGql(
  cookies: Cookie[],
  query: string,
  variables: any,
  type: GQL_TYPE = GQL_TYPE.QUERY,
) {
  //note that this method expects every query to include
  //   currentUser {
  //      id
  //   }
  // to confirm that it's been authenticated
  const response = await wrappedFetch('https://www.start.gg/api/-/gql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'client-version': '20',
      Cookie: cookies
        ?.map((cookie) => `${cookie.name}=${cookie.value}`)
        .join('; '),
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await response.json();
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const message = json.errors[0].message as string;
    const retryMsg = '';
    throw new Error(`${message}${retryMsg}`);
  }

  if (type === GQL_TYPE.QUERY && json.data.currentUser?.id == undefined) {
    return undefined;
  }

  return json.data;
}

const GQL_GET_EVENTS = `
query TournamentEvents($tournamentSlug: String) {
  currentUser {
    id
  }
  tournamentRegistrationInfo: tournament(slug: $tournamentSlug) {
    events {
      id
      state
    }
    registrationOptions {
      name
      id
      optionType
      values {
        id
        name
        optionTypeId
        fee
      }
    }
  }
}
`;

const GQL_GET_PARTICIPANTS = `
query TournamentParticipants(
  $tournamentSlug: String
  $page: Int = 1
  $perPage: Int = ${PARTICIPANT_PER_PAGE}
  $sortBy: String = "id DESC"
) {
  currentUser {
    id
  }
  tournamentRegistrationInfo: tournament(slug: $tournamentSlug) {
    participants(
      query: { page: $page, perPage: $perPage, sortBy: $sortBy }
    ) {
      pageInfo {
        page
        totalPages
      }
      nodes {
        id
        prefix
        gamerTag
        entrants {
          id
        }
        registrationSelections{
          regValue {
            id
            optionId
            optionType
            optionTypeId
          }
          balance
        }
      }
    }
  }
}
`;

const GQL_GET_POOLS = `
query TournamentPools(
  $tournamentSlug: String
  $groupPage: Int = 1
  $groupPerPage: Int = ${GROUP_PER_PAGE}
  $seedPage: Int = 1
  $seedPerPage: Int = ${SEED_PER_PAGE}
  $seedSortBy: String = "id DESC"
) {
  currentUser {
    id
  }
  tournament(slug: $tournamentSlug) {
    name
    slug
    events {
      id
      paginatedPhaseGroups(query: {
        page: $groupPage,
        perPage: $groupPerPage
      }) {
        pageInfo {
          page
          totalPages
        }
        nodes {
          id
          displayIdentifier
          phase {
            id
            name
            phaseOrder
          }
          seeds(query: {
            page: $seedPage,
            perPage: $seedPerPage,
            sortBy: $seedSortBy
          }) {
            pageInfo {
              page
              totalPages
            }
            nodes {
              id
              entrant {
                id
              }
            }
          }
        }
      }
    }
  }
}
`;
export function ingestEvents(
  queryResponse: { [x: string]: any },
  registrationOptions: RegistrationOption[],
) {
  const startedEvents = [];

  for (let rawEvent of queryResponse['tournamentRegistrationInfo']['events']) {
    if (rawEvent['state'] != 'CREATED' && rawEvent['state'] != 'READY') {
      startedEvents.push(rawEvent['id']);
    }
  }

  registrationOptions.length = 0;
  for (let rawRegistrationOption of queryResponse['tournamentRegistrationInfo'][
    'registrationOptions'
  ]) {
    let id = undefined;
    if (rawRegistrationOption['optionType'] == 'tournament') {
      id = rawRegistrationOption['values'][0]['id'];
      venueFeeOption = id;
    } else if (rawRegistrationOption['optionType'] == 'event') {
      id = rawRegistrationOption['values'][0]['optionTypeId'];
    }

    id
      ? registrationOptions.push({
          id: id,
          name: rawRegistrationOption['name'],
          type: rawRegistrationOption['optionType'],
          started: startedEvents.includes(id),
          free: rawRegistrationOption['values'][0]['fee'] == 0,
          options: rawRegistrationOption['values'].map(
            (value: Record<string, string>) => value['name'],
          ),
          ...(rawRegistrationOption['optionType'] == 'event'
            ? { pools: [] }
            : {}),
        })
      : {};
  }
}

export function ingestParticipants(
  queryResponse: { [x: string]: any },
  participants: Participant[],
  participantsByEntrant: Map<Id, Participant[]> = new Map(),
) {
  for (let rawParticipantNode of queryResponse['tournamentRegistrationInfo'][
    'participants'
  ]['nodes']) {
    const participant: Participant = {
      id: rawParticipantNode['id'],
      displayName: rawParticipantNode['gamerTag'],
      prefix: rawParticipantNode['prefix'] ?? '',
      filtered: false,
      paidStatuses: {},
      registeredStatuses: {},
      pools: {},
    };
    participants.push(participant);

    // A doubles entrant maps to several participants, so this is many-to-many.
    for (let rawEntrant of rawParticipantNode['entrants'] ?? []) {
      const entrantId = Number(rawEntrant['id']);
      const existing = participantsByEntrant.get(entrantId);
      if (existing) {
        existing.push(participant);
      } else {
        participantsByEntrant.set(entrantId, [participant]);
      }
    }

    for (let registrationSelection of rawParticipantNode[
      'registrationSelections'
    ]) {
      const balance = registrationSelection['balance'];

      if (registrationSelection['regValue']['optionType'] == 'event') {
        const eventId = registrationSelection['regValue']['optionTypeId'];
        participant.registeredStatuses[eventId] = true;
        participant.paidStatuses[eventId] = balance == 0;
      } else if (
        registrationSelection['regValue']['optionType'] == 'tournament'
      ) {
        const eventId = registrationSelection['regValue']['id'];
        participant.paidStatuses[eventId] = balance == 0;
      }
    }
  }
}

type CollectedPool = Pool & {
  phaseOrder: number;
  entrantIds: Set<Id>;
};

export function ingestPools(
  queryResponse: { [x: string]: any },
  poolsByEvent: Map<Id, Map<Id, CollectedPool>>,
) {
  for (let rawEvent of queryResponse['tournament']['events'] ?? []) {
    const eventId = Number(rawEvent['id']);

    for (let rawGroup of rawEvent['paginatedPhaseGroups']['nodes']) {
      const poolId = Number(rawGroup['id']);
      if (!Number.isFinite(poolId) || poolId < 0) {
        // less than zero means its our "UNSEEDED" pseudo-pool
        throw new Error(
          `start.gg returned an unusable phase group id: ${rawGroup['id']}`,
        );
      }

      let eventPools = poolsByEvent.get(eventId);
      if (eventPools == undefined) {
        eventPools = new Map();
        poolsByEvent.set(eventId, eventPools);
      }

      let pool = eventPools.get(poolId);
      if (pool == undefined) {
        pool = {
          id: poolId,
          phase: rawGroup['phase']?.['name'] ?? '',
          name: rawGroup['displayIdentifier'] ?? '',
          phaseOrder: rawGroup['phase']?.['phaseOrder'] ?? 0,
          entrantIds: new Set(),
        };
        eventPools.set(poolId, pool);
      }

      for (let rawSeed of rawGroup['seeds']?.['nodes'] ?? []) {
        const entrantId = Number(rawSeed['entrant']?.['id']);
        if (Number.isFinite(entrantId)) {
          pool.entrantIds.add(entrantId);
        }
      }
    }
  }
}

export function resolvePools(
  poolsByEvent: Map<Id, Map<Id, CollectedPool>>,
  participantsByEntrant: Map<Id, Participant[]>,
  registrationOptions: RegistrationOption[],
) {
  for (let registrationOption of registrationOptions) {
    if (registrationOption.type != 'event') {
      continue;
    }

    const collected = [
      ...(poolsByEvent.get(registrationOption.id)?.values() ?? []),
    ];
    const firstPhaseOrder = collected.reduce(
      (lowest, pool) => Math.min(lowest, pool.phaseOrder),
      Infinity,
    );
    const firstPhasePools = collected
      .filter(
        (pool) =>
          pool.phaseOrder === firstPhaseOrder && pool.entrantIds.size > 0,
      )
      .sort((a, b) => a.id - b.id);

    if (firstPhasePools.length === 0) {
      registrationOption.pools = [];
      continue;
    }

    const pools = firstPhasePools.map((collectedPool) => {
      const pool: Pool = {
        id: collectedPool.id,
        phase: collectedPool.phase,
        name: collectedPool.name,
      };
      for (let entrantId of collectedPool.entrantIds) {
        for (let participant of participantsByEntrant.get(entrantId) ?? []) {
          participant.pools[registrationOption.id] = pool;
        }
      }
      return pool;
    });

    registrationOption.pools = [...pools, UNSEEDED_POOL];
  }
}

function maxTotalPages(pageInfos: { [x: string]: any }[]) {
  return pageInfos.reduce(
    (most, pageInfo) => Math.max(most, pageInfo?.['totalPages'] ?? 0),
    0,
  );
}

export async function getRegistration(cookies: Cookie[], slugOrShort: string) {
  let participants: Participant[] = [];
  let registrationOptions: RegistrationOption[] = [];
  const participantsByEntrant = new Map<Id, Participant[]>();
  const throttle = makeRequestThrottle();

  await throttle();
  let eventsQuery = await fetchUnofficialGql(cookies, GQL_GET_EVENTS, {
    tournamentSlug: slugOrShort,
  });
  if (eventsQuery == undefined) {
    return undefined;
  }
  ingestEvents(eventsQuery, registrationOptions);

  await throttle();
  let participantsQuery = await fetchUnofficialGql(
    cookies,
    GQL_GET_PARTICIPANTS,
    {
      tournamentSlug: slugOrShort,
    },
  );
  if (participantsQuery == undefined) {
    return undefined;
  }
  ingestParticipants(participantsQuery, participants, participantsByEntrant);

  let participantPage = 1;
  while (
    participantsQuery['tournamentRegistrationInfo']['participants']['pageInfo'][
      'totalPages'
    ] > participantPage
  ) {
    participantPage += 1;
    if (participantPage > MAX_PARTICIPANT_PAGES) {
      throw new Error(
        `start.gg reported more than ${MAX_PARTICIPANT_PAGES} pages of participants - refusing to keep paging.`,
      );
    }

    await throttle();
    participantsQuery = await fetchUnofficialGql(
      cookies,
      GQL_GET_PARTICIPANTS,
      {
        tournamentSlug: slugOrShort,
        page: participantPage,
      },
    );
    if (participantsQuery == undefined) {
      return undefined;
    }
    ingestParticipants(participantsQuery, participants, participantsByEntrant);
  }

  const poolsByEvent = new Map<Id, Map<Id, CollectedPool>>();
  let name = '';
  let slug = '';
  let groupPage = 1;
  let sweeping = true;
  while (sweeping) {
    let seedPage = 1;
    let maxGroupPages = 1;
    for (;;) {
      await throttle();
      const poolsQuery = await fetchUnofficialGql(cookies, GQL_GET_POOLS, {
        tournamentSlug: slugOrShort,
        groupPage: groupPage,
        seedPage: seedPage,
      });
      if (poolsQuery == undefined) {
        return undefined;
      }

      const rawTournament = poolsQuery['tournament'];
      if (rawTournament == undefined) {
        throw new Error(`No tournament found for slug: ${slugOrShort}`);
      }
      name = rawTournament['name'] ?? '';
      slug = rawTournament['slug'] ?? '';
      ingestPools(poolsQuery, poolsByEvent);

      const rawEvents = rawTournament['events'] ?? [];
      const rawGroups = rawEvents.flatMap(
        (rawEvent: { [x: string]: any }) =>
          rawEvent['paginatedPhaseGroups']['nodes'],
      );
      maxGroupPages = maxTotalPages(
        rawEvents.map(
          (rawEvent: { [x: string]: any }) =>
            rawEvent['paginatedPhaseGroups']['pageInfo'],
        ),
      );
      const maxSeedPages = maxTotalPages(
        rawGroups.map(
          (rawGroup: { [x: string]: any }) => rawGroup['seeds']?.['pageInfo'],
        ),
      );

      if (seedPage >= maxSeedPages) {
        break;
      }
      seedPage += 1;
      if (seedPage > MAX_POOL_PAGES) {
        throw new Error(
          `start.gg reported more than ${MAX_POOL_PAGES} pages of seeds - refusing to keep paging.`,
        );
      }
    }

    if (groupPage >= maxGroupPages) {
      sweeping = false;
    } else {
      groupPage += 1;
      if (groupPage > MAX_POOL_PAGES) {
        throw new Error(
          `start.gg reported more than ${MAX_POOL_PAGES} pages of phase groups - refusing to keep paging.`,
        );
      }
    }
  }

  resolvePools(poolsByEvent, participantsByEntrant, registrationOptions);

  return {
    name: name,
    slug: slug,
    participants: participants,
    registrationOptions: registrationOptions,
  };
}

const UPDATE_PARTICIPANT_REGISTRATION_QUERY = `
mutation UpdateParticipantRegistration(
  $participantId: ID!,
  $regValueId: ID!,
  $regValuePaid: Boolean,
  $eventIds: [ID!],
  $paidEventIds: [ID!]
) {
  updateParticipantRegistration(
    participantId: $participantId
    entrantData: {
      eventIds: $eventIds,
      paidEventIds: $paidEventIds
    }
    regData: [{
      regValueId: $regValueId,
      paid: $regValuePaid,
      added: true
    }]
  ) {
    id
    registrationSelections{
      regValue {
        id
        optionType
        optionTypeId
      }
      balance
    }
  }
}
`;
export async function updateParticipantRegistration(
  cookies: Cookie[],
  attendee: Id,
  option: Id,
) {
  const participant = getParticipant(attendee);
  if (
    currentTournament == undefined ||
    venueFeeOption == undefined ||
    participant == undefined
  ) {
    return;
  }

  const eventIds = Object.entries(participant.registeredStatuses)
    .filter(([, registered]) => registered)
    .map(([eventId]) => eventId);

  const paidIds = Object.entries(participant.paidStatuses)
    .filter(([, paid]) => paid)
    .map(([optionId]) => optionId)
    .filter((optionId) => optionId != String(venueFeeOption));

  return fetchUnofficialGql(
    cookies,
    UPDATE_PARTICIPANT_REGISTRATION_QUERY,
    {
      participantId: attendee,
      regValueId: venueFeeOption,
      regValuePaid: participant.paidStatuses[venueFeeOption],
      eventIds: eventIds,
      paidEventIds: paidIds,
    },
    GQL_TYPE.MUTATION,
  ).then((queryResponse) => {
    const currentParticipant = getParticipant(attendee);
    if (currentTournament == undefined || currentParticipant == undefined) {
      return;
    }

    currentParticipant.paidStatuses = {};
    currentParticipant.registeredStatuses = {};
    for (let registrationSelection of queryResponse[
      'updateParticipantRegistration'
    ]['registrationSelections']) {
      const balance = registrationSelection['balance'];
      if (registrationSelection['regValue']['optionType'] == 'event') {
        const eventId = registrationSelection['regValue']['optionTypeId'];
        currentParticipant.registeredStatuses[eventId] = true;
        currentParticipant.paidStatuses[eventId] = balance == 0;
      } else if (
        registrationSelection['regValue']['optionType'] == 'tournament'
      ) {
        const eventId = registrationSelection['regValue']['id'];
        currentParticipant.paidStatuses[eventId] = balance == 0;
      }
    }

    currentTournament.updatingCheckboxes =
      currentTournament.updatingCheckboxes.filter(
        (key) => key != `${attendee};${option}`,
      );

    applyFilters([currentParticipant]);
  });
}

export function getVisibleParticipantsText() {
  if (currentTournament === undefined) {
    return '';
  }

  return currentTournament.participants
    .filter((participant) => !participant.filtered)
    .map((participant) =>
      participant.prefix
        ? `${participant.prefix}|${participant.displayName}`
        : participant.displayName,
    )
    .join(',');
}

export async function toggleParticipantPaid(attendee: Id, option: Id) {
  const participant = getParticipant(attendee);
  if (
    currentTournament == undefined ||
    venueFeeOption == undefined ||
    participant == undefined
  ) {
    return;
  }

  const justPaid = !participant.paidStatuses[option];
  participant.paidStatuses[option] = justPaid;

  const registrationOption = currentTournament.registrationOptions.find(
    (regOption) => regOption.id == option,
  );
  if (justPaid && registrationOption?.type == 'event') {
    participant.registeredStatuses[option] = true;
  }

  currentTournament.updatingCheckboxes.push(`${attendee};${option}`);
}

export async function toggleParticipantAdded(attendee: Id, option: Id) {
  const participant = getParticipant(attendee);
  if (currentTournament == undefined || participant == undefined) {
    return;
  }

  participant.registeredStatuses[option] =
    !participant.registeredStatuses[option];
  currentTournament.updatingCheckboxes.push(`${attendee};${option}`);
}

const GET_TOURNAMENTS_QUERY = `
  query TournamentsQuery {
    currentUser {
      id
      tournaments(query: {perPage: 50, filter: {tournamentView: "admin"}}) {
        nodes {
          hasOfflineEvents
          name
          slug
        }
      }
    }
  }
`;
export async function getAdminedTournaments(
  cookies: Cookie[],
): Promise<AdminedTournament[] | undefined> {
  return fetchUnofficialGql(cookies, GET_TOURNAMENTS_QUERY, {})
    .then(async (data) => {
      if (data == undefined) {
        return undefined;
      }

      return data.currentUser.tournaments.nodes
        .filter((tournament: any) => tournament.hasOfflineEvents)
        .map((tournament: any) => ({
          slug: tournament.slug.slice(11),
          name: tournament.name,
        }));
    })
    .catch(async (e) => {
      throw e;
    });
}
