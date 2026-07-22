import { IpcRendererEvent, contextBridge, ipcRenderer } from 'electron';
import {
  AdminedTournament,
  Id,
  Participant,
  Tournament,
} from '../common/types';

const electronHandler = {
  openStartggLoginWindow: (): Promise<void> =>
    ipcRenderer.invoke('openStartggLoginWindow'),
  getCurrentTournament: (): Promise<Tournament | undefined> =>
    ipcRenderer.invoke('getCurrentTournament'),
  getStartggTournament: (slugOrShort: string): Promise<Tournament> =>
    ipcRenderer.invoke('getStartggTournament', slugOrShort),
  getTournaments: (): Promise<AdminedTournament[]> =>
    ipcRenderer.invoke('getTournaments'),
  onTournament: (
    callback: (
      event: IpcRendererEvent,
      data: {
        startggTournament: Tournament;
      },
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('tournament');
    ipcRenderer.on('tournament', callback);
  },
  isMac: process.platform === 'darwin',
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
