import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import { GlobalHotKeys } from 'react-hotkeys';
import {
  AdminedTournament,
  DEFAULT_FILTER_STATE,
  FilterState,
  Id,
  Tournament,
} from '../common/types';
import Settings from './Settings';
import StartggCheckin from './StartggCheckin';
import { WindowEvent } from './setWindowEventListener';
import ErrorDialog from './ErrorDialog';

// TODO: grey out "paid" checkbox if user hasnt been added to event
// TODO: set window title after pulling tournament
// TODO: pull pools from startgg!
// TODO: pull DQ status from startgg!
// TODO: set up testing
// TODO: performance fix for filtering - it slows down a LOT with big events...
// TODO: fix building!! we're hardcoding the fucking python path LMFAOOO. i also cant build x86 windows binaries. use github actions?
// TODO: main/startgg.ts and main/ipc.ts are coupled weirdly i think - look into this further...
// TODO: improve copy dialog...
// TODO: implement undo / redo tree
// TODO: improve teams handling?
// TODO: reconsider login flow?

function IndexPage() {
  const [loggedInStatus, setLoggedInStatus] = useState<boolean>(false);
  const loggedInStatusRef = useRef(loggedInStatus);
  useEffect(() => {
    loggedInStatusRef.current = loggedInStatus;
  }, [loggedInStatus]);

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
    participants: [],
    updatingCheckboxes: [],
  });

  const startggTournamentRef = useRef(startggTournament);
  useEffect(() => {
    startggTournamentRef.current = startggTournament;
  }, [startggTournament]);

  useEffect(() => {
    window.electron.onLoggedInStatus(
      (e, { loggedInStatus: newLoggedInStatus }) => {
        if (loggedInStatusRef.current != newLoggedInStatus) {
          setGettingAdminedTournaments(true);
          setLoggedInStatus(newLoggedInStatus);
          if (newLoggedInStatus) {
            window.electron
              .getAdminedTournaments()
              .then(() => {
                setGettingAdminedTournaments(false);
              })
              .catch((e) => {
                showErrorDialog([e instanceof Error ? e.message : e]);
                setGettingAdminedTournaments(false);
              });
          } else {
            window.electron.openStartggLoginWindow();
          }
        }
      },
    );
  }, []);

  useEffect(() => {
    window.electron.onAdminedTournaments((e, { adminedTournaments }) => {
      if (adminedTournaments != undefined) {
        setAdminedTournaments(adminedTournaments);
        setGettingAdminedTournaments(false);
      }
    });
  }, []);

  useEffect(() => {
    window.electron.onTournament((e, { startggTournament: newTournament }) => {
      if (newTournament != undefined) {
        setStartggTournament(newTournament);
      }
    });
  }, []);

  useEffect(() => {
    window.electron.refreshTournament((e) => {
      if (startggTournament.slug) {
        setGettingTournament(true);
        window.electron
          .getStartggTournament(startggTournament.slug)
          .then(() => setGettingTournament(false));
      }
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
      const tournament = await window.electron.getStartggTournament(maybeSlug);
      setGettingTournament(false);
      return tournament;
    } catch (e: any) {
      showErrorDialog([e.toString()]);
    }
  };

  const [searchText, setSearchText] = useState('');
  const [filterState, setFilterState] = useState<Record<Id, FilterState>>({});

  const [paidMenuOpen, setPaidMenuOpen] = useState<Record<Id, boolean>>({});
  const [registeredMenuOpen, setRegisteredMenuOpen] = useState<
    Record<Id, boolean>
  >({});

  const registrationOptionsKey = startggTournament.registrationOptions
    .map((registrationOption) => registrationOption.id)
    .join(',');

  const resetFilters = () => {
    setFilterState(
      Object.fromEntries(
        startggTournament.registrationOptions.map(
          ({ id, type }): [Id, FilterState] => [
            id,
            {
              ...DEFAULT_FILTER_STATE,
              // TODO: real pool names once they're pulled from start.gg
              pools: type == 'event' ? { 'Pool 1': true, 'Pool 2': true } : {},
            },
          ],
        ),
      ),
    );
  };
  useEffect(() => {
    setPaidMenuOpen({});
    setRegisteredMenuOpen({});
    setSearchText('');
    resetFilters();
  }, [registrationOptionsKey]);

  useEffect(() => {
    window.electron.updateParticipantsFiltered(searchText, filterState);
  }, [searchText, filterState]);

  const copyFilteredParticipants = async () => {
    const clipboardValue = await window.electron.copyToClipboard();
    showErrorDialog([`Copied value!\n${clipboardValue}`]);
  };

  return (
    <>
      <StartggCheckin
        startggTournament={startggTournament}
        copyFilteredParticipants={copyFilteredParticipants}
        gettingTournament={gettingTournament}
        searchText={searchText}
        setGettingTournament={setGettingTournament}
        setSearchText={setSearchText}
        showErrorDialog={showErrorDialog}
        filterState={filterState}
        setFilterState={setFilterState}
        paidMenuOpen={paidMenuOpen}
        setPaidMenuOpen={setPaidMenuOpen}
        registeredMenuOpen={registeredMenuOpen}
        setRegisteredMenuOpen={setRegisteredMenuOpen}
        resetFilters={resetFilters}
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
          ESC: 'escape',
          FIND: window.electron.isMac
            ? ['command+f', 'command+F']
            : ['ctrl+f', 'ctrl+F'],
          REFRESH: window.electron.isMac
            ? ['command+r', 'command+R']
            : ['ctrl+r', 'ctrl+R'],
        }}
        handlers={{
          ESC: () => {
            window.dispatchEvent(new Event(WindowEvent.ESCAPE));
          },
          FIND: () => {
            document?.getElementById('search-bar')?.focus();
          },
          REFRESH: () => {
            if (startggTournamentRef.current.slug) {
              setGettingTournament(true);
              window.electron
                .getStartggTournament(startggTournamentRef.current.slug)
                .then(() => setGettingTournament(false));
            }
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
