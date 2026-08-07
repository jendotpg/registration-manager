import { Cookie } from 'electron';
import {
  AdminedTournament,
  Id,
  Tournament,
  Participant,
  RegistrationOption,
  FilterState,
  NullableBoolean,
  matchesNullableBoolean,
} from '../common/types';

let currentTournament: Tournament | undefined;
let venueFeeOption: Id | undefined;

let currentSearchText = '';
let currentFilters: Record<Id, FilterState> = {};

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
        (filterState.added !== NullableBoolean.Indeterminate &&
          eventOptionIds.has(optionId)),
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
            matchesNullableBoolean(
              filterState.added,
              !!participant.registeredStatuses[optionId],
            )),
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
query TournamentEvents(
  $tournamentSlug: String
  $page: Int = 1
  $perPage: Int = 100
  $sortBy: String = "id DESC"
) {
  currentUser {
    id
  }
  tournament(slug: $tournamentSlug) {
    name
    slug
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
  $perPage: Int = 100
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
        })
      : {};
  }
}

export function ingestParticipants(
  queryResponse: { [x: string]: any },
  participants: Participant[],
) {
  for (let rawParticipantNode of queryResponse['tournamentRegistrationInfo'][
    'participants'
  ]['nodes']) {
    const participant: Participant = {
      id: rawParticipantNode['id'],
      displayName: rawParticipantNode['gamerTag'],
      prefix: rawParticipantNode['prefix'],
      filtered: false,
      paidStatuses: {},
      registeredStatuses: {},
    };
    participants.push(participant);

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

export async function getRegistration(cookies: Cookie[], slugOrShort: string) {
  let participants: Participant[] = [];
  let registrationOptions: RegistrationOption[] = [];

  let eventsQuery = await fetchUnofficialGql(cookies, GQL_GET_EVENTS, {
    tournamentSlug: slugOrShort,
  });
  if (eventsQuery == undefined) {
    return undefined;
  }
  const name = eventsQuery['tournament']['name'];
  const slug = eventsQuery['tournament']['slug'];
  ingestEvents(eventsQuery, registrationOptions);

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
  ingestParticipants(participantsQuery, participants);
  while (
    participantsQuery['tournamentRegistrationInfo']['participants']['pageInfo'][
      'totalPages'
    ] >
    participantsQuery['tournamentRegistrationInfo']['participants']['pageInfo'][
      'page'
    ]
  ) {
    participantsQuery = await fetchUnofficialGql(
      cookies,
      GQL_GET_PARTICIPANTS,
      {
        tournamentSlug: slugOrShort,
        page:
          participantsQuery['tournamentRegistrationInfo']['participants'][
            'pageInfo'
          ]['page'] + 1,
      },
    );
    if (participantsQuery == undefined) {
      return undefined;
    }
    ingestParticipants(participantsQuery, participants);
  }

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
