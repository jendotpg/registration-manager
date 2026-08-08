/**
 * The IPC surface: the ten channels the renderer can call, and what each one
 * sends back down.
 *
 * The domain layer is mocked out here on purpose - startgg.ts has its own suites
 * - so what is under test is the wiring: which channel calls what, in what
 * order, and what gets pushed to the window afterwards.
 *
 * These are main process tests, no DOM needed.
 *
 * @jest-environment node
 */
import type { BrowserWindow, Cookie } from 'electron';

type Handler = (event: unknown, ...args: any[]) => any;

const handlers = new Map<string, Handler>();
/** Every handle() call in order, so re-registration can be observed. */
const registrations: string[] = [];
const removals: string[] = [];

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      registrations.push(channel);
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
      removals.push(channel);
      handlers.delete(channel);
    },
  },
  session: {
    defaultSession: {
      clearStorageData: jest.fn(),
    },
  },
  clipboard: {
    writeText: jest.fn(),
  },
}));

/**
 * A single shared store instance, so a test can dictate what was persisted
 * before setupIPCs runs and then assert on what got written.
 */
const mockStore = {
  has: jest.fn<boolean, [string]>(() => false),
  get: jest.fn<any, [string]>(() => []),
  set: jest.fn(),
};

jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => mockStore),
);

jest.mock('../main/loginwindow', () => ({
  __esModule: true,
  default: jest.fn(),
}));

jest.mock('../main/startgg', () => ({
  getTournament: jest.fn(),
  getCurrentTournament: jest.fn(),
  getAdminedTournaments: jest.fn(),
  toggleParticipantPaid: jest.fn(),
  toggleParticipantAdded: jest.fn(),
  updateParticipantRegistration: jest.fn(),
  updateParticipantsFiltered: jest.fn(),
  getVisibleParticipantsText: jest.fn(),
}));

// eslint-disable-next-line import/first
import { clipboard, session } from 'electron';
// eslint-disable-next-line import/first
import setupIPCs from '../main/ipc';
// eslint-disable-next-line import/first
import openStartggLoginWindow from '../main/loginwindow';
// eslint-disable-next-line import/first
import {
  getTournament,
  getAdminedTournaments,
  getCurrentTournament,
  toggleParticipantPaid,
  toggleParticipantAdded,
  updateParticipantRegistration,
  updateParticipantsFiltered,
  getVisibleParticipantsText,
} from '../main/startgg';

const PAGE_TITLE = 'Registration Manager';

const mocked = <T extends (...args: any[]) => any>(fn: T) =>
  fn as jest.MockedFunction<T>;

const mockedGetTournament = mocked(getTournament);
const mockedGetCurrentTournament = mocked(getCurrentTournament);
const mockedGetAdminedTournaments = mocked(getAdminedTournaments);
const mockedTogglePaid = mocked(toggleParticipantPaid);
const mockedToggleAdded = mocked(toggleParticipantAdded);
const mockedUpdateRegistration = mocked(updateParticipantRegistration);
const mockedUpdateFiltered = mocked(updateParticipantsFiltered);
const mockedGetVisibleParticipantsText = mocked(getVisibleParticipantsText);
const mockedOpenLoginWindow = mocked(openStartggLoginWindow);
const mockedWriteText = clipboard.writeText as jest.MockedFunction<
  typeof clipboard.writeText
>;
const mockedClearStorageData = session.defaultSession
  .clearStorageData as jest.MockedFunction<
  typeof session.defaultSession.clearStorageData
>;

// getTournament's own return type, which is structurally narrower than
// Tournament (it hardcodes an empty updatingCheckboxes).
type FetchedTournament = Awaited<ReturnType<typeof getTournament>>;

function makeTournament(name: string): FetchedTournament {
  return {
    slug: 'tournament/some-slug',
    name,
    participants: [],
    registrationOptions: [],
    updatingCheckboxes: [],
  };
}

function makeWindow() {
  return {
    setTitle: jest.fn(),
    webContents: {
      // The page title is never changed by win.setTitle(), so it always
      // reports what index.ejs declares.
      getTitle: jest.fn(() => PAGE_TITLE),
      send: jest.fn(),
    },
  };
}

type TestWindow = ReturnType<typeof makeWindow>;

let mainWindow: TestWindow;

/** Wire up the IPC handlers against a fresh window. */
function setup() {
  handlers.clear();
  registrations.length = 0;
  removals.length = 0;
  mainWindow = makeWindow();
  setupIPCs(mainWindow as unknown as BrowserWindow);
  return mainWindow;
}

const call = (channel: string, ...args: any[]) =>
  handlers.get(channel)!({}, ...args);

/** The payloads sent on one channel, in order. */
const sentOn = (channel: string) =>
  mainWindow.webContents.send.mock.calls
    .filter(([name]) => name === channel)
    .map(([, payload]) => payload);

beforeEach(() => {
  jest.clearAllMocks();
  mockStore.has.mockReturnValue(false);
  mockStore.get.mockReturnValue([]);
  mockedUpdateRegistration.mockResolvedValue(undefined);
  mockedTogglePaid.mockResolvedValue(undefined);
  mockedToggleAdded.mockResolvedValue(undefined);
  setup();
});

describe('handler registration', () => {
  it('registers every channel the renderer can call', () => {
    expect([...handlers.keys()].sort()).toEqual(
      [
        'copyToClipboard',
        'getAdminedTournaments',
        'getCopyText',
        'getCurrentTournament',
        'getStartggTournament',
        'logOut',
        'openStartggLoginWindow',
        'toggleParticipantAdded',
        'toggleParticipantPaid',
        'updateParticipantsFiltered',
      ].sort(),
    );
  });

  it('clears each channel before claiming it, so a second setup is safe', () => {
    // main.ts can call setupIPCs again; without the removeHandler calls Electron
    // would throw on the duplicate registration.
    setup();
    setupIPCs(mainWindow as unknown as BrowserWindow);

    expect(handlers.size).toBe(10);
    registrations.forEach((channel) => expect(removals).toContain(channel));
  });
});

describe('the preload contract', () => {
  /**
   * Channels preload.ts exposes to the renderer via ipcRenderer.invoke. Kept
   * literal rather than imported, because importing preload.ts would run
   * contextBridge at module load.
   */
  const INVOKED_BY_PRELOAD = [
    'openStartggLoginWindow',
    'getCurrentTournament',
    'logOut',
    'getAdminedTournaments',
    'getStartggTournament',
    'toggleParticipantPaid',
    'toggleParticipantAdded',
    'updateParticipantsFiltered',
    'getCopyText',
    'copyToClipboard',
  ];

  it('has a handler for every channel preload can invoke', () => {
    // Anything preload exposes is callable from the renderer, and a channel with
    // no handler rejects with "No handler registered" the moment someone uses it.
    const missing = INVOKED_BY_PRELOAD.filter(
      (channel) => !handlers.has(channel),
    );

    expect(missing).toEqual([]);
  });

  it('registers no handler the renderer cannot reach', () => {
    const orphaned = [...handlers.keys()].filter(
      (channel) => !INVOKED_BY_PRELOAD.includes(channel),
    );

    expect(orphaned).toEqual([]);
  });
});

describe('cookies', () => {
  it('starts from an empty jar when nothing was persisted', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));

    await call('getStartggTournament', 'some-slug');

    expect(mockedGetTournament).toHaveBeenCalledWith([], 'some-slug');
  });

  it('restores the persisted jar on startup', async () => {
    const saved = [{ name: 'session', value: 'abc' }] as Cookie[];
    mockStore.has.mockReturnValue(true);
    mockStore.get.mockReturnValue(saved);
    setup();
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));

    await call('getStartggTournament', 'some-slug');

    expect(mockedGetTournament).toHaveBeenCalledWith(saved, 'some-slug');
  });

  it('refuses to fetch when the persisted jar is missing entirely', async () => {
    // store.has says yes but get returns nothing - the `!startggCookies` guard.
    mockStore.has.mockReturnValue(true);
    mockStore.get.mockReturnValue(undefined);
    setup();

    await expect(
      call('getStartggTournament', 'some-slug'),
    ).resolves.toBeUndefined();
    expect(mockedGetTournament).not.toHaveBeenCalled();
  });

  it('persists and uses the cookies the login window captures', async () => {
    const captured = [{ name: 'session', value: 'fresh' }] as Cookie[];
    await call('openStartggLoginWindow');

    // The login window hands its cookies back through a callback.
    const [onCookies] = mockedOpenLoginWindow.mock.calls[0];
    onCookies(captured);

    expect(mockStore.set).toHaveBeenCalledWith('startggCookies', captured);

    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));
    await call('getStartggTournament', 'some-slug');
    expect(mockedGetTournament).toHaveBeenCalledWith(captured, 'some-slug');
  });

  it('forgets the cookies on log out', async () => {
    const captured = [{ name: 'session', value: 'fresh' }] as Cookie[];
    await call('openStartggLoginWindow');
    mockedOpenLoginWindow.mock.calls[0][0](captured);

    await call('logOut');

    expect(mockStore.set).toHaveBeenLastCalledWith('startggCookies', []);
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));
    await call('getStartggTournament', 'some-slug');
    expect(mockedGetTournament).toHaveBeenCalledWith([], 'some-slug');
  });
});

describe('the restored jar is only echoed to the console in debug', () => {
  // These are live session cookies. Logging them is a development aid, so the
  // default - which is what a packaged build and this suite both get - has to
  // be silence.
  const SAVED = [{ name: 'session', value: 'abc' }] as Cookie[];
  let consoleLog: jest.SpyInstance;
  let nodeEnv: string | undefined;
  let debugProd: string | undefined;

  beforeEach(() => {
    nodeEnv = process.env.NODE_ENV;
    debugProd = process.env.DEBUG_PROD;
    consoleLog = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockStore.has.mockReturnValue(true);
    mockStore.get.mockReturnValue(SAVED);
  });

  afterEach(() => {
    consoleLog.mockRestore();
    process.env.NODE_ENV = nodeEnv;
    if (debugProd === undefined) {
      delete process.env.DEBUG_PROD;
    } else {
      process.env.DEBUG_PROD = debugProd;
    }
  });

  it('says nothing by default', () => {
    setup();

    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('echoes them as a Cookie header in development', () => {
    process.env.NODE_ENV = 'development';

    setup();

    expect(consoleLog).toHaveBeenCalledWith('session=abc');
  });

  it('echoes them when a production build opts in with DEBUG_PROD', () => {
    process.env.NODE_ENV = 'production';
    process.env.DEBUG_PROD = 'true';

    setup();

    expect(consoleLog).toHaveBeenCalledWith('session=abc');
  });
});

describe('logOut', () => {
  it('clears the session cookies out of Electron too', async () => {
    await call('logOut');

    expect(mockedClearStorageData).toHaveBeenCalledWith({
      storages: ['cookies'],
    });
  });

  it('tells the renderer it is logged out', async () => {
    await call('logOut');

    expect(sentOn('loggedInStatus')).toEqual([{ loggedInStatus: false }]);
  });

  it('sends an empty tournament so the table clears', async () => {
    // The empty slug is what StartggCheckin keys its placeholder off; sending
    // undefined here would leave the previous tournament on screen.
    await call('logOut');

    expect(sentOn('tournament')).toEqual([
      {
        startggTournament: {
          slug: '',
          name: '',
          registrationOptions: [],
          participants: [],
          updatingCheckboxes: [],
        },
      },
    ]);
  });
});

describe('getCurrentTournament', () => {
  // The only channel registered as a bare function rather than an async
  // wrapper, so unlike every other handler it returns a value, not a promise.
  // Electron serialises either, but the difference shows up here.
  it('hands back whatever the domain layer is holding', () => {
    const tournament = makeTournament('Genesis 9');
    mockedGetCurrentTournament.mockReturnValue(tournament);

    expect(call('getCurrentTournament')).toBe(tournament);
  });

  it('hands back undefined before anything is loaded', () => {
    mockedGetCurrentTournament.mockReturnValue(undefined);

    expect(call('getCurrentTournament')).toBeUndefined();
  });
});

describe('getStartggTournament', () => {
  it('pushes the stored tournament, not the value it returns', async () => {
    // The two differ: the handler returns getTournament's result but broadcasts
    // getCurrentTournament(), which is the copy carrying filter state.
    const fetched = makeTournament('Genesis 9');
    const stored = makeTournament('Genesis 9 (stored)');
    mockedGetTournament.mockResolvedValue(fetched);
    mockedGetCurrentTournament.mockReturnValue(stored);

    const returned = await call('getStartggTournament', 'some-slug');

    expect(returned).toBe(fetched);
    expect(sentOn('tournament')).toEqual([{ startggTournament: stored }]);
  });
});

describe('getAdminedTournaments', () => {
  it('reports logged in and forwards the list', async () => {
    const list = [{ slug: 'nyc-melee-100', name: 'NYC Melee 100' }];
    mockedGetAdminedTournaments.mockResolvedValue(list);

    await call('getAdminedTournaments');

    expect(sentOn('loggedInStatus')).toEqual([{ loggedInStatus: true }]);
    expect(sentOn('adminedTournaments')).toEqual([
      { adminedTournaments: list },
    ]);
  });

  it('reports logged out when the list comes back undefined', async () => {
    mockedGetAdminedTournaments.mockResolvedValue(undefined);

    await call('getAdminedTournaments');

    expect(sentOn('loggedInStatus')).toEqual([{ loggedInStatus: false }]);
    expect(sentOn('adminedTournaments')).toEqual([
      { adminedTournaments: undefined },
    ]);
  });

  it('rejects when the fetch fails, so the renderer can show the error', async () => {
    // Every other handler in this file rejects on failure, and App.tsx attaches
    // a .catch to this channel expecting the same. Resolving instead leaves the
    // renderer's spinner turning with no error dialog and no way to know why.
    mockedGetAdminedTournaments.mockRejectedValue(new Error('401'));

    await expect(call('getAdminedTournaments')).rejects.toThrow('401');

    expect(sentOn('adminedTournaments')).toEqual([]);
  });
});

describe.each([
  ['toggleParticipantPaid', () => mockedTogglePaid],
  ['toggleParticipantAdded', () => mockedToggleAdded],
])('%s', (channel, getToggle) => {
  it('shows the optimistic change, then the confirmed one', async () => {
    // Two sends: one so the checkbox flips immediately with an "Updating..."
    // marker, one after start.gg has answered. Anything less and the desk is
    // clicking a box that does not visibly move.
    mockedGetCurrentTournament.mockReturnValue(makeTournament('Genesis 9'));

    await call(channel, 1, 111);

    expect(sentOn('tournament')).toHaveLength(2);
    const toggleOrder = getToggle().mock.invocationCallOrder[0];
    const updateOrder = mockedUpdateRegistration.mock.invocationCallOrder[0];
    const [firstSend, secondSend] =
      mainWindow.webContents.send.mock.invocationCallOrder;
    expect(toggleOrder).toBeLessThan(firstSend);
    expect(firstSend).toBeLessThan(updateOrder);
    expect(updateOrder).toBeLessThan(secondSend);
  });

  it('forwards the attendee and option unchanged', async () => {
    await call(channel, 42, 777);

    expect(getToggle()).toHaveBeenCalledWith(42, 777);
    expect(mockedUpdateRegistration).toHaveBeenCalledWith([], 42, 777);
  });

  it('surfaces a failed mutation and republishes the rolled-back state', async () => {
    // Both sends still happen: the optimistic flip, then whatever the model
    // holds once startgg.ts has undone it. Rejecting without that second send
    // would leave the renderer showing the flip that never landed, and a cell
    // stuck on "Updating...", however correct the main-process model is.
    mockedUpdateRegistration.mockRejectedValue(
      new Error('401 - Unauthorized.'),
    );

    await expect(call(channel, 1, 111)).rejects.toThrow('401 - Unauthorized.');

    expect(sentOn('tournament')).toHaveLength(2);
  });
});

describe('updateParticipantsFiltered', () => {
  it('forwards the search and filters, then republishes the tournament', async () => {
    const tournament = makeTournament('Genesis 9');
    mockedGetCurrentTournament.mockReturnValue(tournament);
    const filters = { 111: { paid: 1, added: 0, pools: {} } };

    await call('updateParticipantsFiltered', 'alice', filters);

    expect(mockedUpdateFiltered).toHaveBeenCalledWith('alice', filters);
    expect(sentOn('tournament')).toEqual([{ startggTournament: tournament }]);
  });

  it('sends nothing when no tournament is loaded', async () => {
    mockedGetCurrentTournament.mockReturnValue(undefined);

    await call('updateParticipantsFiltered', 'alice', {});

    expect(sentOn('tournament')).toEqual([]);
  });
});

describe('window title', () => {
  const getStartggTournament = (slugOrShort = 'some-slug') =>
    call('getStartggTournament', slugOrShort);

  it('includes the tournament name once a tournament is set', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));

    await getStartggTournament();

    expect(mainWindow.setTitle).toHaveBeenCalledWith(
      'Registration Manager - Genesis 9',
    );
  });

  it('falls back to the page title when the tournament has no name', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament(''));

    await getStartggTournament();

    expect(mainWindow.setTitle).toHaveBeenCalledWith('Registration Manager');
  });

  it('replaces the previous tournament name instead of appending', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));
    await getStartggTournament();

    mockedGetTournament.mockResolvedValue(makeTournament('Battle of BC 6'));
    await getStartggTournament();

    expect(mainWindow.setTitle).toHaveBeenLastCalledWith(
      'Registration Manager - Battle of BC 6',
    );
  });

  it('leaves the title alone when start.gg reports logged out', async () => {
    mockedGetTournament.mockResolvedValue(undefined);

    await getStartggTournament();

    expect(mainWindow.webContents.send).toHaveBeenCalledWith('loggedInStatus', {
      loggedInStatus: false,
    });
    expect(mainWindow.setTitle).not.toHaveBeenCalled();
  });

  it('leaves the title alone when the fetch throws', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));
    await getStartggTournament();
    mainWindow.setTitle.mockClear();

    mockedGetTournament.mockRejectedValue(new Error('401 - Unauthorized.'));

    await expect(getStartggTournament()).rejects.toThrow('401 - Unauthorized.');
    expect(mainWindow.setTitle).not.toHaveBeenCalled();
  });

  it('resets to the page title on log out', async () => {
    mockedGetTournament.mockResolvedValue(makeTournament('Genesis 9'));
    mockedGetCurrentTournament.mockReturnValue(makeTournament('Genesis 9'));
    await getStartggTournament();

    await call('logOut');

    expect(mainWindow.setTitle).toHaveBeenLastCalledWith(
      'Registration Manager',
    );
  });
});

describe('copy text', () => {
  const PARTICIPANTS_TEXT = 'TSM|Alice, Bob, Carol';

  beforeEach(() => {
    mockedGetVisibleParticipantsText.mockReturnValue(PARTICIPANTS_TEXT);
  });

  it('hands the visible participants to the renderer', async () => {
    await expect(call('getCopyText')).resolves.toBe(PARTICIPANTS_TEXT);
  });

  it('leaves the clipboard alone when only fetching the text', async () => {
    // The dialog previews the value first, so opening it must not overwrite
    // whatever the user already had on their clipboard.
    await call('getCopyText');

    expect(mockedWriteText).not.toHaveBeenCalled();
  });

  it('writes the same value it hands back when actually copying', async () => {
    await expect(call('copyToClipboard')).resolves.toBe(PARTICIPANTS_TEXT);
    expect(mockedWriteText).toHaveBeenCalledWith(PARTICIPANTS_TEXT);
  });
});
