/**
 * A stand-in for the contextBridge surface that main/preload.ts exposes.
 *
 * Every renderer component reaches `window.electron.*` directly - there is no
 * injection layer - so a component test has to put something there. This builds
 * the whole surface at once rather than the ad-hoc partial stubs that would
 * otherwise accumulate, so that adding a method to preload.ts without updating
 * the harness shows up as a missing-property type error rather than as a
 * mysterious "not a function" in one unlucky suite.
 */
import { act } from '@testing-library/react';
import type { IpcRendererEvent } from 'electron';
import type {
  AdminedTournament,
  FilterState,
  Id,
  Tournament,
} from '../common/types';
import { EMPTY_TOURNAMENT } from './tournament';

type Listener<T> = (event: IpcRendererEvent, data: T) => void;

export type ElectronListeners = {
  loggedInStatus?: Listener<{ loggedInStatus: boolean }>;
  adminedTournaments?: Listener<{ adminedTournaments: AdminedTournament[] }>;
  tournament?: Listener<{ startggTournament: Tournament }>;
  refreshTournament?: (event: IpcRendererEvent) => void;
};

export type ElectronApiMock = {
  openStartggLoginWindow: jest.Mock;
  getCurrentTournament: jest.Mock;
  logOut: jest.Mock;
  getAdminedTournaments: jest.Mock;
  getStartggTournament: jest.Mock;
  toggleParticipantPaid: jest.Mock;
  toggleParticipantAdded: jest.Mock;
  updateParticipantsFiltered: jest.Mock;
  getCopyText: jest.Mock;
  copyToClipboard: jest.Mock;
  onLoggedInStatus: jest.Mock;
  onAdminedTournaments: jest.Mock;
  onTournament: jest.Mock;
  refreshTournament: jest.Mock;
  isMac: boolean;
};

/** A stand-in IpcRendererEvent. No component reads it. */
const IPC_EVENT = {} as IpcRendererEvent;

export function installElectronMock(overrides: Partial<ElectronApiMock> = {}) {
  const listeners: ElectronListeners = {};

  const api: ElectronApiMock = {
    openStartggLoginWindow: jest.fn().mockResolvedValue(undefined),
    getCurrentTournament: jest.fn().mockResolvedValue(EMPTY_TOURNAMENT),
    logOut: jest.fn().mockResolvedValue(undefined),
    getAdminedTournaments: jest.fn().mockResolvedValue(undefined),
    getStartggTournament: jest.fn().mockResolvedValue(EMPTY_TOURNAMENT),
    toggleParticipantPaid: jest.fn().mockResolvedValue(undefined),
    toggleParticipantAdded: jest.fn().mockResolvedValue(undefined),
    updateParticipantsFiltered: jest.fn().mockResolvedValue(undefined),
    getCopyText: jest.fn().mockResolvedValue(''),
    copyToClipboard: jest.fn().mockResolvedValue(''),

    // These *replace* rather than append, mirroring preload.ts, which calls
    // removeAllListeners before every `on`. App.tsx re-registers its
    // refreshTournament listener on each tournament change and relies on the old
    // closure going away; a harness that appended would keep firing the stale one
    // and hide exactly the bug that design avoids.
    onLoggedInStatus: jest.fn((callback) => {
      listeners.loggedInStatus = callback;
    }),
    onAdminedTournaments: jest.fn((callback) => {
      listeners.adminedTournaments = callback;
    }),
    onTournament: jest.fn((callback) => {
      listeners.tournament = callback;
    }),
    refreshTournament: jest.fn((callback) => {
      listeners.refreshTournament = callback;
    }),

    isMac: false,
    ...overrides,
  };

  (window as any).electron = api;

  function requireListener<K extends keyof ElectronListeners>(
    name: K,
  ): NonNullable<ElectronListeners[K]> {
    const listener = listeners[name];
    if (!listener) {
      throw new Error(
        `Nothing registered a "${name}" listener. Render the component first.`,
      );
    }
    return listener as NonNullable<ElectronListeners[K]>;
  }

  // Main-process pushes. Wrapped in act() because each one sets React state.
  const emit = {
    loggedInStatus: async (loggedInStatus: boolean) => {
      await act(async () => {
        requireListener('loggedInStatus')(IPC_EVENT, { loggedInStatus });
      });
    },
    adminedTournaments: async (
      adminedTournaments: AdminedTournament[] | undefined,
    ) => {
      await act(async () => {
        requireListener('adminedTournaments')(IPC_EVENT, {
          adminedTournaments: adminedTournaments as AdminedTournament[],
        });
      });
    },
    tournament: async (startggTournament: Tournament | undefined) => {
      await act(async () => {
        requireListener('tournament')(IPC_EVENT, {
          startggTournament: startggTournament as Tournament,
        });
      });
    },
    refreshTournament: async () => {
      await act(async () => {
        requireListener('refreshTournament')(IPC_EVENT);
      });
    },
  };

  const restore = () => {
    delete (window as any).electron;
  };

  return { api, listeners, emit, restore };
}

/** The filter payload shape App pushes back down on every change. */
export type FilterPayload = [string, Record<Id, FilterState>];

/** The arguments of the most recent updateParticipantsFiltered call. */
export function lastFilterPayload(api: ElectronApiMock): FilterPayload {
  const { calls } = api.updateParticipantsFiltered.mock;
  if (calls.length === 0) {
    throw new Error('updateParticipantsFiltered was never called');
  }
  return calls[calls.length - 1] as FilterPayload;
}
