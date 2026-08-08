/**
 * These are main process tests, no DOM needed.
 *
 * @jest-environment node
 */
import type { BrowserWindow } from 'electron';

type Handler = (event: unknown, ...args: any[]) => any;

const handlers = new Map<string, Handler>();

jest.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: Handler) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel: string) => {
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

jest.mock('electron-store', () =>
  jest.fn().mockImplementation(() => ({
    has: () => false,
    get: () => [],
    set: () => {},
  })),
);

jest.mock('../main/loginwindow', () => ({
  openStartggLoginWindow: jest.fn(),
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
import { clipboard } from 'electron';
// eslint-disable-next-line import/first
import setupIPCs from '../main/ipc';
// eslint-disable-next-line import/first
import {
  getTournament,
  getCurrentTournament,
  getVisibleParticipantsText,
} from '../main/startgg';

const PAGE_TITLE = 'Registration Manager';

const mockedGetTournament = getTournament as jest.MockedFunction<
  typeof getTournament
>;
const mockedGetCurrentTournament = getCurrentTournament as jest.MockedFunction<
  typeof getCurrentTournament
>;
const mockedGetVisibleParticipantsText =
  getVisibleParticipantsText as jest.MockedFunction<
    typeof getVisibleParticipantsText
  >;
const mockedWriteText = clipboard.writeText as jest.MockedFunction<
  typeof clipboard.writeText
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

describe('window title', () => {
  let mainWindow: ReturnType<typeof makeWindow>;

  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();
    mainWindow = makeWindow();
    setupIPCs(mainWindow as unknown as BrowserWindow);
  });

  async function getStartggTournament(slugOrShort = 'some-slug') {
    return handlers.get('getStartggTournament')!({}, slugOrShort);
  }

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

    await handlers.get('logOut')!({});

    expect(mainWindow.setTitle).toHaveBeenLastCalledWith(
      'Registration Manager',
    );
  });
});

describe('copy text', () => {
  const PARTICIPANTS_TEXT = 'TSM|Alice, Bob, Carol';

  beforeEach(() => {
    jest.clearAllMocks();
    handlers.clear();
    setupIPCs(makeWindow() as unknown as BrowserWindow);
    mockedGetVisibleParticipantsText.mockReturnValue(PARTICIPANTS_TEXT);
  });

  it('hands the visible participants to the renderer', async () => {
    await expect(handlers.get('getCopyText')!({})).resolves.toBe(
      PARTICIPANTS_TEXT,
    );
  });

  it('leaves the clipboard alone when only fetching the text', async () => {
    // The dialog previews the value first, so opening it must not overwrite
    // whatever the user already had on their clipboard.
    await handlers.get('getCopyText')!({});

    expect(mockedWriteText).not.toHaveBeenCalled();
  });

  it('writes the same value it hands back when actually copying', async () => {
    await expect(handlers.get('copyToClipboard')!({})).resolves.toBe(
      PARTICIPANTS_TEXT,
    );
    expect(mockedWriteText).toHaveBeenCalledWith(PARTICIPANTS_TEXT);
  });
});
