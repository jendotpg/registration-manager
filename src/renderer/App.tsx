import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GlobalHotKeys } from 'react-hotkeys';
import {
  AdminedTournament,
  Id,
  Participant,
  Tournament,
} from '../common/types';
import Settings from './Settings';
import StartggCheckin from './StartggCheckin';
import { WindowEvent } from './setWindowEventListener';
import ErrorDialog from './ErrorDialog';
import { electron } from 'process';

//TODO: when selecting "paid" checkbox if user hasnt been added to event, also add them!
//TODO: fetch tournaments on login
//TODO: show licensing info!!! in particular note code usage from nicolet's replay manager for slippi - and check her licensing info to see if there's knock-on usage
//TODO: make main/startgg.ts:getTournament() use the unofficial api - so that it works on private events too :)
//TODO: fix filter spacing ugh
//TODO: fix key uniqueness issue
//TODO: improve teams handling
//TODO: make background of upper sticky work correctly when theres too many events to fit in 100% (use garden brawl as an example)

function IndexPage() {
  const [loggedInStatus, setLoggedInStatus] = useState<boolean>(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [errorDialogOpen, setErrorDialogOpen] = useState(false);
  const showErrorDialog = (messages: string[]) => {
    setErrors(messages);
    setErrorDialogOpen(true);
  };

  const [adminedTournaments, setAdminedTournaments] = useState<
    AdminedTournament[]
  >([]);
  const [gettingAdminedTournaments, setGettingAdminedTournaments] =
    useState(false);

  const [startggTournament, setStartggTournament] = useState<Tournament>({
    slug: '',
    name: '',
    registrationOptions: [],
    participantPaidStatuses: {},
    participantRegisteredStatuses: {},
    participants: [],
    updatingCheckboxes: [],
  });

  useEffect(() => {
    window.electron.onLoggedInStatus((e, { loggedInStatus }) => {
      setLoggedInStatus(loggedInStatus);
    });
  }, [loggedInStatus]);

  useEffect(() => {
    window.electron.onAdminedTournaments((e, { adminedTournaments }) => {
      setAdminedTournaments(adminedTournaments);
      setGettingAdminedTournaments(false);
    });
  }, [adminedTournaments, gettingAdminedTournaments]);

  useEffect(() => {
    window.electron.onTournament((e, { startggTournament: newTournament }) => {
      setStartggTournament(newTournament);
    });
  }, [startggTournament]);

  useEffect(() => {
    setGettingAdminedTournaments(true);
    window.electron
      .getAdminedTournaments()
      .then(() => {
        setGettingAdminedTournaments(false);
      })
      .catch((e) => {
        showErrorDialog([e instanceof Error ? e.message : e]);
        setGettingAdminedTournaments(false);
      });
  }, []);

  const [slugDialogOpen, setSlugDialogOpen] = useState(false);
  const [gettingTournament, setGettingTournament] = useState(false);

  const getStartggTournament = async (maybeSlug: string) => {
    if (!maybeSlug) {
      return;
    }

    setGettingTournament(true);
    try {
      let tournament = await window.electron.getStartggTournament(maybeSlug);
      setGettingTournament(false);
      return tournament;
    } catch (e: any) {
      showErrorDialog([e.toString()]);
    }
  };

  const [searchText, setSearchText] = useState('');
  const [paidFilters, setPaidFilters] = useState<Record<Id, boolean>>({});
  const [addedFilters, setAddedFilters] = useState<Record<Id, boolean>>({});

  const applyFilters = (participant: Participant) => {
    if (
      !(participant.prefix + '|' + participant.displayName)
        .toLowerCase()
        .includes(searchText.toLowerCase())
    ) {
      return false;
    }
    for (const event in paidFilters) {
      if (
        paidFilters[event] &&
        (startggTournament.participantPaidStatuses[participant.id][event] ==
          false ||
          startggTournament.participantPaidStatuses[participant.id][event] ==
            undefined)
      ) {
        return false;
      }
      if (
        addedFilters[event] &&
        (startggTournament.participantRegisteredStatuses[participant.id][
          event
        ] == false ||
          startggTournament.participantRegisteredStatuses[participant.id][
            event
          ] == undefined)
      ) {
        return false;
      }
    }
    return true;
  };

  const copyFilteredParticipants = async () => {
    const clipboardValue = startggTournament.participants
      .filter(applyFilters)
      .map((participant) => {
        return participant.prefix
          ? participant.prefix + '|' + participant.displayName
          : participant.displayName;
      })
      .join(',');

    window.electron.copyToClipboard(clipboardValue);
    showErrorDialog(['Copied value!\n' + clipboardValue]);
  };

  return (
    <>
      <StartggCheckin
        startggTournament={startggTournament}
        applyFilters={applyFilters}
        copyFilteredParticipants={copyFilteredParticipants}
        gettingTournament={gettingTournament}
        searchText={searchText}
        paidFilters={paidFilters}
        addedFilters={addedFilters}
        setGettingTournament={setGettingTournament}
        setSearchText={setSearchText}
        setPaidFilters={setPaidFilters}
        setAddedFilters={setAddedFilters}
        showErrorDialog={showErrorDialog}
      />

      <ErrorDialog
        messages={errors}
        onClose={() => {
          setErrors([]);
          setErrorDialogOpen(false);
        }}
        open={errorDialogOpen}
      />

      <Settings
        loggedInStatus={loggedInStatus}
        slugDialogOpen={slugDialogOpen}
        gettingTournament={gettingTournament}
        startggTournament={startggTournament}
        adminedTournaments={adminedTournaments}
        gettingAdminedTournaments={gettingAdminedTournaments}
        setSlugDialogOpen={setSlugDialogOpen}
        setGettingTournament={setGettingTournament}
        setGettingAdminedTournaments={setGettingAdminedTournaments}
        showErrorDialog={showErrorDialog}
        getStartggTournament={getStartggTournament}
      />
      <GlobalHotKeys
        keyMap={{
          COPY: window.electron.isMac
            ? ['command+c', 'command+C']
            : ['ctrl+c', 'ctrl+C'],
          ESC: 'escape',
          FIND: window.electron.isMac
            ? ['command+f', 'command+F']
            : ['ctrl+f', 'ctrl+F'],
        }}
        handlers={{
          COPY: () => {
            copyFilteredParticipants();
          },
          ESC: () => {
            window.dispatchEvent(new Event(WindowEvent.ESCAPE));
          },
          FIND: () => {
            document?.getElementById('search-bar')?.focus();
          },
        }}
      />
    </>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<IndexPage />} />
      </Routes>
    </Router>
  );
}
