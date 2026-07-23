import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { GlobalHotKeys } from 'react-hotkeys';
import { AdminedTournament, Tournament } from '../common/types';
import Settings from './Settings';
import StartggCheckinForm from './StartggCheckinForm';
import { WindowEvent } from './setWindowEventListener';
import ErrorDialog from './ErrorDialog';

//TODO: grey out "paid" checkbox if user hasnt been added to event
//TODO: grey out "added" checkbox if event has any sets reported
//TODO: handle errors in `startgg.ts` gracefully - fetches will sometimes fail!
// //debugging note: you can force this to fail by trying to remove a player who already has a set called
//TODO: when no tournament selected, always show settings!
//TODO: fix key uniqueness issue
//TODO: add search bar
//TODO: add copy feature
//TODO: add filter feature for each checkbox
//TODO: show scrollbars
//TODO: get rid of the weird white box at the bottom of main

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
    window.electron.onTournament((e, { startggTournament: newTournament }) => {
      console.log(
        'new tournament, updating checkboxes are:',
        newTournament.updatingCheckboxes,
      );
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

  return (
    <>
      <StartggCheckinForm
        gettingTournament={gettingTournament}
        setGettingTournament={setGettingTournament}
        startggTournament={startggTournament}
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
