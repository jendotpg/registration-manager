import { Cookie } from 'electron';
import {
  AdminedTournament,
  Id,
  Tournament,
  Participant,
  RegistrationOption,
} from '../common/types';

let currentTournament: Tournament | undefined;
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

export async function getTournament(sggCookies: Cookie[], slugOrShort: string) {
  const response = await wrappedFetch(
    //TODO: MAKE THIS USE THE RIGHT API - ideally it works on private events too :)
    `https://api.start.gg/tournament/${slugOrShort}?expand[]=event`,
  );
  const json = await response.json();
  const { name, locationDisplayName: location } = json.entities.tournament;
  const slug = json.entities.tournament.slug.slice(11);

  return getRegistration(sggCookies, slugOrShort).then((registration) => {
    const tournament = {
      name,
      slug,
      participants: registration.participants,
      registrationOptions: registration.registrationOptions,
      participantPaidStatuses: registration.participantPaidStatuses,
      participantRegisteredStatuses: registration.participantRegisteredStatuses,
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
    const retryMsg = '. Try again.';
    throw new Error(`${message}${retryMsg}`);
  }

  return json.data;
}

const GQL_GET_REGISTRATION = `
query TournamentAttendees(
  $tournamentSlug: String
  $page: Int = 1
  $perPage: Int = 100
  $sortBy: String = "id DESC"
) {
  tournamentRegistrationInfo: tournament(slug: $tournamentSlug) {
    registrationOptions {
      name
      id
      optionType
      values {
        id
        name
        optionTypeId
      }
    }
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
export function ingestRegistration(
  queryResponse: { [x: string]: any },
  participants: Participant[],
  registrationOptions: RegistrationOption[],
  participantPaidStatuses: Record<Id, Record<number, boolean>>,
  participantRegisteredStatuses: Record<Id, Record<number, boolean>>,
) {
  registrationOptions.length = 0;
  for (let rawRegistrationOption of queryResponse['tournamentRegistrationInfo'][
    'registrationOptions'
  ]) {
    if (
      rawRegistrationOption['optionType'] == 'tournament' ||
      rawRegistrationOption['optionType'] == 'event'
    ) {
      registrationOptions.push({
        id:
          rawRegistrationOption['optionType'] == 'tournament'
            ? rawRegistrationOption['values'][0]['id'] // this is valid because tournament registrations have exactly one value...
            : rawRegistrationOption['values'][0]['optionTypeId'],
        name: rawRegistrationOption['name'],
        type: rawRegistrationOption['optionType'],
        options: rawRegistrationOption['values'].map(
          (value: Record<string, string>) => value['name'],
        ),
      });
    }
  }

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

  let registrationQuery = await fetchUnofficialGql(
    cookies,
    GQL_GET_REGISTRATION,
    {
      tournamentSlug: slugOrShort,
    },
  );
  ingestRegistration(
    registrationQuery,
    participants,
    registrationOptions,
    participantPaidStatuses,
    participantRegisteredStatuses,
  );
  while (
    registrationQuery['tournamentRegistrationInfo']['participants']['pageInfo'][
      'totalPages'
    ] >
    registrationQuery['tournamentRegistrationInfo']['participants']['pageInfo'][
      'page'
    ]
  ) {
    registrationQuery = await fetchUnofficialGql(
      cookies,
      GQL_GET_REGISTRATION,
      {
        tournamentSlug: slugOrShort,
        page:
          registrationQuery['tournamentRegistrationInfo']['participants'][
            'pageInfo'
          ]['page'] + 1,
      },
    );
    ingestRegistration(
      registrationQuery,
      participants,
      registrationOptions,
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
export async function getTournaments(
  cookies: Cookie[],
): Promise<AdminedTournament[]> {
  const data = await fetchUnofficialGql(cookies, GET_TOURNAMENTS_QUERY, {});
  return data.currentUser.tournaments.nodes
    .filter((tournament: any) => tournament.hasOfflineEvents)
    .map((tournament: any) => ({
      slug: tournament.slug.slice(11),
      name: tournament.name,
    }));
}
