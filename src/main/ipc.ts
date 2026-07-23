import { BrowserWindow, Cookie, ipcMain } from 'electron';
import Store from 'electron-store';
import {
  getTournament,
  getTournaments,
  getCurrentTournament,
  toggleParticipantPaid,
  toggleParticipantAdded,
  updateParticipantRegistration,
} from './startgg';
import { openStartggLoginWindow } from './loginwindow';
import { Id } from '../common/types';

export default function setupIPCs(mainWindow: BrowserWindow): void {
  const store = new Store<{
    sggCookies: Cookie[];
  }>();

  let sggCookies = store.has('sggCookies') ? store.get('sggCookies') : [];

  ipcMain.removeHandler('openStartggLoginWindow');
  ipcMain.handle('openStartggLoginWindow', () => {
    openStartggLoginWindow((cookies) => {
      store.set('sggCookies', cookies);
    });
  });

  ipcMain.removeHandler('getCurrentTournament');
  ipcMain.handle('getCurrentTournament', getCurrentTournament);

  ipcMain.removeHandler('getStartggTournament');
  ipcMain.handle('getStartggTournament', async (event, slugOrShort: string) => {
    if (!sggCookies) {
      throw new Error('Please log into start.gg');
    }

    const tournament = await getTournament(sggCookies, slugOrShort);

    mainWindow.webContents.send('tournament', {
      startggTournament: getCurrentTournament(),
    });

    return tournament;
  });

  ipcMain.removeHandler('getTournaments');
  ipcMain.handle('getTournaments', async () => {
    return getTournaments(sggCookies);
  });

  ipcMain.removeHandler('toggleParticipantPaid');
  ipcMain.handle(
    'toggleParticipantPaid',
    async (event, attendee: Id, option: Id) => {
      await toggleParticipantPaid(sggCookies, attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });

      await updateParticipantRegistration(sggCookies, attendee, option);

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

      await updateParticipantRegistration(sggCookies, attendee, option);

      mainWindow.webContents.send('tournament', {
        startggTournament: getCurrentTournament(),
      });
    },
  );
}
