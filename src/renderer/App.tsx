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
import ErrorDialog from './ErrorDialog';
import CopyDialog from './CopyDialog';

// TODO: set up testing

// TODO: fix linter issues

// TODO: performance fixes - the whole interface slows down a LOT with big events...
// // debounce searchText inputs
// // put checkboxes in react-window List to only render visible ones
// // figure out wtf is going on with clicking filter icons ??
// // some sort of performance testing

// TODO: fix building!! we're hardcoding the fucking python path LMFAOOO. i also cant build x86 windows binaries. use github actions?

// TODO: implement undo / redo tree? is this a footgun for tos?
// TODO: improve teams handling? how does the interface for this work - third column for teams events? new page for teams?
// TODO: support for add participant?
// // also, figure out how to pull discriminators for participants - and put it into the tooltip
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
      return await window.electron.getStartggTournament(maybeSlug);
    } catch (e: any) {
      showErrorDialog([e instanceof Error ? e.message : e]);
      return undefined;
    } finally {
      setGettingTournament(false);
    }
  };

  useEffect(() => {
    window.electron.refreshTournament(() => {
      getStartggTournament(startggTournament.slug);
    });
  }, [startggTournament]);

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
          ({ id, pools }): [Id, FilterState] => [
            id,
            {
              ...DEFAULT_FILTER_STATE,
              pools: Object.fromEntries(
                (pools ?? []).map((pool) => [pool.id, true]),
              ),
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

  const poolsKey = startggTournament.registrationOptions
    .map(
      ({ id, pools }) =>
        `${id}:${(pools ?? []).map((pool) => pool.id).join('.')}`,
    )
    .join(',');
  useEffect(() => {
    setFilterState((prev) => {
      const next: Record<Id, FilterState> = { ...prev };
      startggTournament.registrationOptions.forEach(({ id, pools }) => {
        const current = prev[id] ?? DEFAULT_FILTER_STATE;
        next[id] = {
          ...current,
          pools: Object.fromEntries(
            (pools ?? []).map((pool) => [
              pool.id,
              current.pools[pool.id] ?? true,
            ]),
          ),
        };
      });
      return next;
    });
  }, [poolsKey]);

  useEffect(() => {
    window.electron.updateParticipantsFiltered(searchText, filterState);
  }, [searchText, filterState]);

  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyText, setCopyText] = useState('');

  const copyFilteredParticipants = async () => {
    try {
      setCopyText(await window.electron.getCopyText());
      setCopyDialogOpen(true);
    } catch (e: any) {
      showErrorDialog([e instanceof Error ? e.message : e]);
    }
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

      <CopyDialog
        open={copyDialogOpen}
        text={copyText}
        onClose={() => {
          setCopyDialogOpen(false);
        }}
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
          FIND: window.electron.isMac
            ? ['command+f', 'command+F']
            : ['ctrl+f', 'ctrl+F'],
          REFRESH: window.electron.isMac
            ? ['command+r', 'command+R']
            : ['ctrl+r', 'ctrl+R'],
        }}
        handlers={{
          FIND: () => {
            document?.getElementById('search-bar')?.focus();
          },
          REFRESH: () => {
            getStartggTournament(startggTournamentRef.current.slug);
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
