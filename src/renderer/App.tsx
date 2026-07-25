import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GlobalHotKeys } from 'react-hotkeys';
import { AdminedTournament, Tournament } from '../common/types';
import Settings from './Settings';
import StartggCheckin from './StartggCheckin';
import { WindowEvent } from './setWindowEventListener';
import ErrorDialog from './ErrorDialog';

//TODO: grey out "added" checkbox if event has any sets reported
//TODO: grey out "paid" checkbox on free events
//TODO: when selecting "paid" checkbox if user hasnt been added to event, also add them!
//TODO: add copy feature
//TODO: add filter feature for each checkbox
//TODO: add search bar
//TODO: make main/startgg.ts:getTournament() use the unofficial api - so that it works on private events too :)
//TODO: show scrollbars
//TODO: fix key uniqueness issue
//TODO: make the tournament selector a bit prettier (bounding box?)

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
    const inner = async () => {
      const currentTournament = await window.electron.getCurrentTournament();
      if (currentTournament) {
        setStartggTournament(currentTournament);
      }
    };
    inner();
  }, []);

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

  return (
    <>
      <StartggCheckin
        gettingTournament={gettingTournament}
        setGettingTournament={setGettingTournament}
        startggTournament={startggTournament}
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
            showErrorDialog(['Copy not implemented yet!']);
          },
          ESC: () => {
            window.dispatchEvent(new Event(WindowEvent.ESCAPE));
          },
          FIND: () => {
            showErrorDialog(['Find not implemented yet!']);
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
