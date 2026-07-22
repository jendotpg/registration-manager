import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GlobalHotKeys } from 'react-hotkeys';
import { AdminedTournament, Tournament } from '../common/types';
import Settings from './Settings';
import StartggCheckinForm from './StartggCheckinForm';
import { WindowEvent } from './setWindowEventListener';
import ErrorDialog from './ErrorDialog';

//TODO: mutate the goddamn values! this is read-only right now...
//TODO: instead of no tournament selected, show settings!
//TODO: fix key uniqueness issue
//TODO: add search bar
//TODO: add copy feature
//TODO: add filter feature for each checkbox
//TODO: show scrollbars
//TODO: get rid of the weird white box

function IndexPage() {
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
    window.electron.onTournament((e, { startggTournament: newTournament }) => {
      setStartggTournament(newTournament);
    });
  }, [startggTournament]);

  const [slugDialogOpen, setSlugDialogOpen] = useState(false);
  const [gettingTournament, setGettingTournament] = useState(false);

  const getStartggTournament = async (maybeSlug: string) => {
    if (!maybeSlug) {
      return;
    }

    setGettingTournament(true);
    try {
      let tournament = window.electron.getStartggTournament(maybeSlug);
      setGettingTournament(false);
      return tournament;
    } catch (e: any) {
      showErrorDialog([e.toString()]);
    }
  };

  const [updatingCheckboxes, setUpdatingCheckboxes] = useState<string[]>([]);

  return (
    <>
      <StartggCheckinForm
        gettingTournament={gettingTournament}
        setGettingTournament={setGettingTournament}
        startggTournament={startggTournament}
        updatingCheckboxes={updatingCheckboxes}
        setUpdatingCheckboxes={setUpdatingCheckboxes}
        close={() => {}}
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
        slugDialogOpen={slugDialogOpen}
        gettingTournament={gettingTournament}
        startggTournament={startggTournament}
        adminedTournaments={adminedTournaments}
        gettingAdminedTournaments={gettingAdminedTournaments}
        setSlugDialogOpen={setSlugDialogOpen}
        setGettingTournament={setGettingTournament}
        setAdminedTournaments={setAdminedTournaments}
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
