import { BrowserWindow, Cookie, ipcMain, session, clipboard } from 'electron';
import Store from 'electron-store';
import {
  getTournament,
  getAdminedTournaments,
  getCurrentTournament,
  toggleParticipantPaid,
  toggleParticipantAdded,
  updateParticipantRegistration,
  getLastAuthenticatedRequestSucceeded,
} from './startgg';
import { openStartggLoginWindow } from './loginwindow';
import { Id } from '../common/types';
import { electron } from 'process';

export default function setupIPCs(mainWindow: BrowserWindow): void {
  const store = new Store<{
    startggCookies: Cookie[];
  }>();

  let startggCookies = store.has('startggCookies')
    ? store.get('startggCookies')
    : [];

  ipcMain.removeHandler('logOut');
  ipcMain.handle('logOut', (event) => {
    session.defaultSession.clearStorageData({
      storages: ['cookies'],
    });

    startggCookies = [];
    store.set('startggCookies', []);

    mainWindow.webContents.send('loggedInStatus', {
      loggedInStatus: false,
    });

    mainWindow.webContents.send('tournament', {
      startggTournament: {
        slug: '',
        name: '',
        registrationOptions: [],
        participantPaidStatuses: {},
        participantRegisteredStatuses: {},
        participants: [],
        updatingCheckboxes: [],
      },
    });
  });

  ipcMain.removeHandler('openStartggLoginWindow');
  ipcMain.handle('openStartggLoginWindow', (event) => {
    openStartggLoginWindow((cookies) => {
      store.set('startggCookies', cookies);
      startggCookies = cookies;
    }, mainWindow);
  });

  ipcMain.removeHandler('getCurrentTournament');
  ipcMain.handle('getCurrentTournament', getCurrentTournament);

  ipcMain.removeHandler('getStartggTournament');
  ipcMain.handle('getStartggTournament', async (event, slugOrShort: string) => {
    if (!startggCookies) {
      throw new Error('Please log into start.gg');
    }

    const tournament = await getTournament(startggCookies, slugOrShort);

    mainWindow.webContents.send('tournament', {
      startggTournament: getCurrentTournament(),
    });

    return tournament;
  });

  ipcMain.removeHandler('getAdminedTournaments');
  ipcMain.handle('getAdminedTournaments', async () => {
    return getAdminedTournaments(startggCookies).then(
      async (adminedTournaments) => {
        mainWindow.webContents.send('loggedInStatus', {
          loggedInStatus: getLastAuthenticatedRequestSucceeded(),
        });

        mainWindow.webContents.send('adminedTournaments', {
          adminedTournaments: adminedTournaments,
        });
      },
    );
  });

  ipcMain.removeHandler('toggleParticipantPaid');
  ipcMain.handle(
    'toggleParticipantPaid',
    async (event, attendee: Id, option: Id) => {
      await toggleParticipantPaid(attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });
      mainWindow.webContents.send('loggedInStatus', {
        loggedInStatus: getLastAuthenticatedRequestSucceeded(),
      });

      await updateParticipantRegistration(startggCookies, attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });
      mainWindow.webContents.send('loggedInStatus', {
        loggedInStatus: getLastAuthenticatedRequestSucceeded(),
      });
    },
  );

  ipcMain.removeHandler('toggleParticipantAdded');
  ipcMain.handle(
    'toggleParticipantAdded',
    async (event, attendee: Id, option: Id) => {
      await toggleParticipantAdded(attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });
      mainWindow.webContents.send('loggedInStatus', {
        loggedInStatus: getLastAuthenticatedRequestSucceeded(),
      });

      await updateParticipantRegistration(startggCookies, attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });
      mainWindow.webContents.send('loggedInStatus', {
        loggedInStatus: getLastAuthenticatedRequestSucceeded(),
      });
    },
  );

  ipcMain.removeHandler('copyToClipboard');
  ipcMain.handle('copyToClipboard', async (event, clipboardValue: string) => {
    clipboard.writeText(clipboardValue);
  });
}
