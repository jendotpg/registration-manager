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
  getTournaments: (): Promise<AdminedTournament[]> =>
    ipcRenderer.invoke('getTournaments'),
  getStartggTournament: (slugOrShort: string): Promise<Tournament> =>
    ipcRenderer.invoke('getStartggTournament', slugOrShort),
  toggleParticipantPaid: (attendee: Id, option: Id) =>
    ipcRenderer.invoke('toggleParticipantPaid', attendee, option),
  toggleParticipantAdded: (attendee: Id, option: Id) =>
    ipcRenderer.invoke('toggleParticipantAdded', attendee, option),

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
