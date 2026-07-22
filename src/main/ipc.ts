import { BrowserWindow, Cookie, ipcMain } from 'electron';
import Store from 'electron-store';
import { getTournament, getTournaments, getCurrentTournament } from './startgg';
import { openStartggLoginWindow } from './loginwindow';

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
}
