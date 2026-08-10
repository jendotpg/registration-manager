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
  Participant,
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

/**
 * Wire the stub bridge up to a tournament, the way main really behaves.
 *
 * The plain mock above resolves every call to undefined and never pushes
 * anything back, which is fine for suites that only care about what the renderer
 * *sends*. It is not fine for the responsiveness suites, because the expensive
 * half of every interaction is what comes back: main mutates its module-global
 * tournament and then re-sends the whole thing over `tournament`, and the
 * structured clone that ipcMain performs on the way gives every participant a
 * new identity. A suite built on the bare mock would measure a tournament that
 * never changes identity and would call any memoisation a success.
 *
 * So this reproduces three things from src/main:
 *
 *   - updateParticipantsFiltered recomputes `filtered` and echoes once
 *     (ipc.ts's updateParticipantsFiltered handler);
 *   - toggleParticipantPaid / Added echo *twice*, once optimistically with the
 *     checkbox marked updating and once when the network call settles
 *     (ipc.ts's handlers around startgg.ts's toggles);
 *   - every echo rebuilds the participants, since structuredClone would.
 *     jsdom 20 does not expose structuredClone, so the copy is by hand.
 *
 * Only the search text is honoured, not the filter state - filter correctness is
 * startgg.filters.test.ts's job, and ignoring the filters keeps every row
 * visible, which is the conservative direction for a load measurement.
 */
export function installFilterEcho(
  electron: {
    api: ElectronApiMock;
    listeners: ElectronListeners;
    emit: { tournament: (tournament: Tournament) => Promise<void> };
  },
  initial: Tournament,
) {
  let current = initial;

  /** startgg.ts's applyFilters, search half only. */
  const applySearch = (tournament: Tournament, searchText: string) => {
    const search = searchText.toLowerCase().replace(/\s*\|\s*/g, '|');
    return {
      ...tournament,
      participants: tournament.participants.map((participant) => ({
        ...participant,
        paidStatuses: { ...participant.paidStatuses },
        registeredStatuses: { ...participant.registeredStatuses },
        pools: { ...participant.pools },
        filtered:
          search !== '' &&
          !`${participant.prefix}|${participant.displayName}`
            .toLowerCase()
            .includes(search),
      })),
    };
  };

  /** The identity churn of a trip through ipcMain, without the filtering. */
  const clone = (tournament: Tournament): Tournament => ({
    ...tournament,
    updatingCheckboxes: [...tournament.updatingCheckboxes],
    participants: tournament.participants.map((participant) => ({
      ...participant,
      paidStatuses: { ...participant.paidStatuses },
      registeredStatuses: { ...participant.registeredStatuses },
      pools: { ...participant.pools },
    })),
  });

  const echo = async () => {
    // The real hop is asynchronous, so the echo must not land in the same tick
    // as the interaction that caused it - otherwise a perf suite would count its
    // commit against the keystroke instead of against the round trip.
    await Promise.resolve();
    // Deliberately not emit(), which opens its own act() scope. Nothing awaits
    // the promise this returns - the renderer fires updateParticipantsFiltered
    // and forgets it - so an act() here would still be open when the next test
    // started rendering, and React's act queue never recovers from that
    // overlap: subsequent renders queue work into a scope nobody will flush and
    // their effects simply never run. Called bare, the update lands inside
    // whatever act() the triggering interaction was already inside.
    electron.listeners.tournament?.(IPC_EVENT, {
      startggTournament: clone(current),
    });
  };

  const toggle = async (
    attendee: Id,
    option: Id,
    mutate: (participant: Participant) => void,
  ) => {
    const key = `${attendee};${option}`;
    current = {
      ...current,
      updatingCheckboxes: [...current.updatingCheckboxes, key],
      participants: current.participants.map((participant) => {
        if (participant.id !== attendee) {
          return participant;
        }
        const next = {
          ...participant,
          paidStatuses: { ...participant.paidStatuses },
          registeredStatuses: { ...participant.registeredStatuses },
        };
        mutate(next);
        return next;
      }),
    };
    await echo();

    current = {
      ...current,
      updatingCheckboxes: current.updatingCheckboxes.filter(
        (pending) => pending !== key,
      ),
    };
    await echo();
  };

  electron.api.updateParticipantsFiltered.mockImplementation(
    async (searchText: string) => {
      current = applySearch(current, searchText);
      await echo();
    },
  );

  electron.api.toggleParticipantPaid.mockImplementation(
    async (attendee: Id, option: Id) =>
      toggle(attendee, option, (participant) => {
        participant.paidStatuses[option] = !participant.paidStatuses[option];
      }),
  );

  electron.api.toggleParticipantAdded.mockImplementation(
    async (attendee: Id, option: Id) =>
      toggle(attendee, option, (participant) => {
        participant.registeredStatuses[option] =
          !participant.registeredStatuses[option];
      }),
  );

  return {
    /** Push the tournament down the way main does once it has loaded one. */
    load: () => electron.emit.tournament(clone(current)),
    /** What main would hand back right now. */
    current: () => current,
  };
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
