import { app, session, BrowserWindow } from 'electron';
import { getAssetPath } from './util';

let loginWindow: BrowserWindow | null = null;

export function openStartggLoginWindow(
  setSggCookies: (cookies: Electron.Cookie[]) => void,
) {
  loginWindow = new BrowserWindow({
    minWidth: 400,
    minHeight: 500,
    show: false,
    width: 400,
    height: 700,
    icon: getAssetPath('icon.png'),
    webPreferences: {},
  });

  loginWindow.loadURL('https://start.gg/login');

  loginWindow.webContents.on('did-navigate-in-page', async (event, url) => {
    console.log('navigated in page:', url);

    if (url === 'https://www.start.gg/') {
      const sggCookies = await loginWindow?.webContents.session.cookies.get({
        url: 'https://www.start.gg/',
      });
      setSggCookies(sggCookies ? sggCookies : []);
      loginWindow?.close();

      console.log(
        sggCookies
          ?.map((cookie) => `${cookie.name}=${cookie.value}`)
          .join('; '),
      );
    }
  });

  loginWindow.on('ready-to-show', () => {
    if (!loginWindow) {
      throw new Error('"loginWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      loginWindow.minimize();
    } else {
      loginWindow.show();
    }
  });
}
