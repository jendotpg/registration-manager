import { Cookie } from 'electron';
import {
  AdminedTournament,
  Id,
  Tournament,
  Participant,
  RegistrationOption,
} from '../common/types';

let lastAuthenticatedRequestSucceeded: boolean = false;
let currentTournament: Tournament | undefined;
let venueFeeOption: Id | undefined;
export function getLastAuthenticatedRequestSucceeded() {
  return lastAuthenticatedRequestSucceeded;
}

export function getCurrentTournament() {
  return currentTournament;
}

async function setCurrentTournament(tournament: Tournament | undefined) {
  currentTournament = tournament;
}

async function wrappedFetch(
  input: URL | RequestInfo,
  init?: RequestInit | undefined,
): Promise<Response> {
  //TODO: figure out what happens when cookies are out of date!!
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

export async function getTournament(cookies: Cookie[], slugOrShort: string) {
  const response = await wrappedFetch(
    `https://api.start.gg/tournament/${slugOrShort}?expand[]=event`,
  );
  const json = await response.json();
  const { name, locationDisplayName: location } = json.entities.tournament;
  const slug = json.entities.tournament.slug.slice(11);

  return getRegistration(cookies, slugOrShort).then((registration) => {
    const tournament = {
      name,
      slug,
      participants: registration.participants,
      registrationOptions: registration.registrationOptions,
      participantPaidStatuses: registration.participantPaidStatuses,
      participantRegisteredStatuses: registration.participantRegisteredStatuses,
      updatingCheckboxes: [],
    };

    setCurrentTournament(tournament);
    return tournament;
  });
}

async function fetchUnofficialGql(
  cookies: Cookie[],
  query: string,
  variables: any,
) {
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

  return json.data;
}

const GQL_GET_EVENTS = `
query TournamentEvents(
  $tournamentSlug: String
  $page: Int = 1
  $perPage: Int = 100
  $sortBy: String = "id DESC"
) {
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
  participantPaidStatuses: Record<Id, Record<number, boolean>>,
  participantRegisteredStatuses: Record<Id, Record<number, boolean>>,
) {
  for (let rawParticipantNode of queryResponse['tournamentRegistrationInfo'][
    'participants'
  ]['nodes']) {
    const participant = {
      id: rawParticipantNode['id'],
      displayName: rawParticipantNode['gamerTag'],
      prefix: rawParticipantNode['prefix'],
    };
    participants.push(participant);

    participantPaidStatuses[rawParticipantNode['id']] = {};
    participantRegisteredStatuses[rawParticipantNode['id']] = {};
    for (let registrationSelection of rawParticipantNode[
      'registrationSelections'
    ]) {
      const balance = registrationSelection['balance'];

      if (registrationSelection['regValue']['optionType'] == 'event') {
        const eventId = registrationSelection['regValue']['optionTypeId'];
        participantRegisteredStatuses[rawParticipantNode['id']][eventId] = true;
        participantPaidStatuses[rawParticipantNode['id']][eventId] =
          balance == 0;
      } else if (
        registrationSelection['regValue']['optionType'] == 'tournament'
      ) {
        const eventId = registrationSelection['regValue']['id'];
        participantPaidStatuses[rawParticipantNode['id']][eventId] =
          balance == 0;
      }
    }
  }
}

export async function getRegistration(cookies: Cookie[], slugOrShort: string) {
  let participants: Participant[] = [];
  let registrationOptions: RegistrationOption[] = [];
  let participantPaidStatuses: Record<Id, Record<number, boolean>> = {};
  let participantRegisteredStatuses: Record<Id, Record<number, boolean>> = {};

  let eventsQuery = await fetchUnofficialGql(cookies, GQL_GET_EVENTS, {
    tournamentSlug: slugOrShort,
  });
  ingestEvents(eventsQuery, registrationOptions);

  let participantsQuery = await fetchUnofficialGql(
    cookies,
    GQL_GET_PARTICIPANTS,
    {
      tournamentSlug: slugOrShort,
    },
  );
  ingestParticipants(
    participantsQuery,
    participants,
    participantPaidStatuses,
    participantRegisteredStatuses,
  );
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
    ingestParticipants(
      participantsQuery,
      participants,
      participantPaidStatuses,
      participantRegisteredStatuses,
    );
  }

  return {
    participants: participants,
    registrationOptions: registrationOptions,
    participantPaidStatuses: participantPaidStatuses,
    participantRegisteredStatuses: participantRegisteredStatuses,
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
  if (currentTournament == undefined || venueFeeOption == undefined) {
    return;
  }

  const eventIds = Object.keys(
    currentTournament.participantRegisteredStatuses[attendee],
  ).filter(
    (key: any) =>
      currentTournament?.participantRegisteredStatuses[attendee][key],
  );

  const paidIds = Object.keys(
    currentTournament.participantPaidStatuses[attendee],
  )
    .filter(
      (key: any) => currentTournament?.participantPaidStatuses[attendee][key],
    )
    .filter((key: any) => key != venueFeeOption);

  return fetchUnofficialGql(cookies, UPDATE_PARTICIPANT_REGISTRATION_QUERY, {
    participantId: attendee,
    regValueId: venueFeeOption,
    regValuePaid:
      currentTournament.participantPaidStatuses[attendee][venueFeeOption],
    eventIds: eventIds,
    paidEventIds: paidIds,
  }).then((queryResponse) => {
    if (currentTournament == undefined) {
      return;
    }

    lastAuthenticatedRequestSucceeded = true;

    currentTournament.participantPaidStatuses[attendee] = {};
    currentTournament.participantRegisteredStatuses[attendee] = {};
    for (let registrationSelection of queryResponse[
      'updateParticipantRegistration'
    ]['registrationSelections']) {
      const balance = registrationSelection['balance'];
      if (registrationSelection['regValue']['optionType'] == 'event') {
        const eventId = registrationSelection['regValue']['optionTypeId'];
        currentTournament.participantRegisteredStatuses[attendee][eventId] =
          true;
        currentTournament.participantPaidStatuses[attendee][eventId] =
          balance == 0;
        currentTournament.updatingCheckboxes =
          currentTournament.updatingCheckboxes.filter(
            (key) => key != attendee + ';' + option,
          );
      } else if (
        registrationSelection['regValue']['optionType'] == 'tournament'
      ) {
        const eventId = registrationSelection['regValue']['id'];

        currentTournament.participantPaidStatuses[attendee][eventId] =
          balance == 0;
        currentTournament.updatingCheckboxes =
          currentTournament.updatingCheckboxes.filter(
            (key) => key != attendee + ';' + option,
          );
      }
    }
  });
}

export async function toggleParticipantPaid(attendee: Id, option: any) {
  if (currentTournament == undefined || venueFeeOption == undefined) {
    return;
  }

  const currentRow = currentTournament.participantPaidStatuses[attendee] || {};

  const newParticipantPaidStatuses = {
    ...currentTournament.participantPaidStatuses,
    [attendee]: {
      ...currentRow,
      [option]: !currentRow[option],
    },
  };

  currentTournament.updatingCheckboxes.push(attendee + ';' + option);
  currentTournament.participantPaidStatuses = newParticipantPaidStatuses;
}

export async function toggleParticipantAdded(attendee: Id, option: any) {
  if (currentTournament == undefined) {
    return;
  }

  const currentRow =
    currentTournament.participantRegisteredStatuses[attendee] || {};

  const newParticipantAddedStatuses = {
    ...currentTournament.participantRegisteredStatuses,
    [attendee]: {
      ...currentRow,
      [option]: !currentRow[option],
    },
  };

  currentTournament.updatingCheckboxes.push(attendee + ';' + option);
  currentTournament.participantRegisteredStatuses = newParticipantAddedStatuses;
}

const GET_TOURNAMENTS_QUERY = `
  query TournamentsQuery {
    currentUser {
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
): Promise<AdminedTournament[]> {
  return fetchUnofficialGql(cookies, GET_TOURNAMENTS_QUERY, {})
    .then(async (data) => {
      lastAuthenticatedRequestSucceeded = true;
      return data.currentUser.tournaments.nodes
        .filter((tournament: any) => tournament.hasOfflineEvents)
        .map((tournament: any) => ({
          slug: tournament.slug.slice(11),
          name: tournament.name,
        }));
    })
    .catch(async (e) => {
      lastAuthenticatedRequestSucceeded = true;
      throw e;
    });
}
