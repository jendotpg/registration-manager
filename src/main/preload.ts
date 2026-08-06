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
  logOut: (): Promise<void> => ipcRenderer.invoke('logOut'),
  getLoggedInStatus: (): Promise<boolean> =>
    ipcRenderer.invoke('getLoggedInStatus'),
  getAdminedTournaments: (): Promise<void> =>
    ipcRenderer.invoke('getAdminedTournaments'),
  getStartggTournament: (slugOrShort: string): Promise<Tournament> =>
    ipcRenderer.invoke('getStartggTournament', slugOrShort),
  toggleParticipantPaid: (attendee: Id, option: Id) =>
    ipcRenderer.invoke('toggleParticipantPaid', attendee, option),
  toggleParticipantAdded: (attendee: Id, option: Id) =>
    ipcRenderer.invoke('toggleParticipantAdded', attendee, option),
  copyToClipboard: (clipboardValue: string): Promise<void> =>
    ipcRenderer.invoke('copyToClipboard', clipboardValue),

  onLoggedInStatus: (
    callback: (
      event: IpcRendererEvent,
      data: {
        loggedInStatus: boolean;
      },
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('loggedInStatus');
    ipcRenderer.on('loggedInStatus', callback);
  },
  onAdminedTournaments: (
    callback: (
      event: IpcRendererEvent,
      data: {
        adminedTournaments: AdminedTournament[];
      },
    ) => void,
  ) => {
    ipcRenderer.removeAllListeners('adminedTournaments');
    ipcRenderer.on('adminedTournaments', callback);
  },
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
  refreshTournament: (callback: (event: IpcRendererEvent) => void) => {
    ipcRenderer.removeAllListeners('refreshTournament');
    ipcRenderer.on('refreshTournament', callback);
  },

  isMac: process.platform === 'darwin',
};

contextBridge.exposeInMainWorld('electron', electronHandler);

export type ElectronHandler = typeof electronHandler;
