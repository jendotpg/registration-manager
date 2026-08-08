import { BrowserWindow, Cookie, ipcMain, session, clipboard } from 'electron';
import Store from 'electron-store';
import {
  getTournament,
  getAdminedTournaments,
  getCurrentTournament,
  toggleParticipantPaid,
  toggleParticipantAdded,
  updateParticipantRegistration,
  updateParticipantsFiltered,
  getVisibleParticipantsText,
} from './startgg';
import { openStartggLoginWindow } from './loginwindow';
import { FilterState, Id } from '../common/types';

export default function setupIPCs(mainWindow: BrowserWindow): void {
  const store = new Store<{
    startggCookies: Cookie[];
  }>();

  let startggCookies = store.has('startggCookies')
    ? store.get('startggCookies')
    : [];

  console.log(
    startggCookies
      ?.map((cookie) => `${cookie.name}=${cookie.value}`)
      .join('; '),
  );

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
        participants: [],
        updatingCheckboxes: [],
      },
    });

    mainWindow.setTitle(mainWindow.webContents.getTitle());
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
      return undefined;
    }

    const tournament = await getTournament(startggCookies, slugOrShort);

    if (tournament == undefined) {
      mainWindow.webContents.send('loggedInStatus', {
        loggedInStatus: false,
      });
    } else {
      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });

      const baseTitle = mainWindow.webContents.getTitle();
      mainWindow.setTitle(
        tournament.name ? `${baseTitle} - ${tournament.name}` : baseTitle,
      );
    }

    return tournament;
  });

  ipcMain.removeHandler('getAdminedTournaments');
  ipcMain.handle('getAdminedTournaments', async () => {
    return getAdminedTournaments(startggCookies)
      .then(async (adminedTournaments) => {
        if (adminedTournaments == undefined) {
          mainWindow.webContents.send('loggedInStatus', {
            loggedInStatus: false,
          });
        } else {
          mainWindow.webContents.send('loggedInStatus', {
            loggedInStatus: true,
          });
        }
        mainWindow.webContents.send('adminedTournaments', {
          adminedTournaments,
        });
      })
      .catch((e) => {
        console.error(e);
      });
  });

  ipcMain.removeHandler('toggleParticipantPaid');
  ipcMain.handle(
    'toggleParticipantPaid',
    async (event, attendee: Id, option: Id) => {
      await toggleParticipantPaid(attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });

      await updateParticipantRegistration(startggCookies, attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
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

      await updateParticipantRegistration(startggCookies, attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });
    },
  );

  ipcMain.removeHandler('updateParticipantsFiltered');
  ipcMain.handle(
    'updateParticipantsFiltered',
    async (event, searchText: string, filters: Record<Id, FilterState>) => {
      updateParticipantsFiltered(searchText, filters);

      const currentTournament = getCurrentTournament();
      if (currentTournament !== undefined) {
        mainWindow.webContents.send('tournament', {
          startggTournament: currentTournament,
        });
      }
    },
  );

  ipcMain.removeHandler('getCopyText');
  ipcMain.handle('getCopyText', async () => getVisibleParticipantsText());

  ipcMain.removeHandler('copyToClipboard');
  ipcMain.handle('copyToClipboard', async () => {
    const clipboardValue = getVisibleParticipantsText();
    clipboard.writeText(clipboardValue);
    return clipboardValue;
  });
}
