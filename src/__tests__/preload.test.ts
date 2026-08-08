/**
 * preload.ts is the whole boundary between the renderer and the main process.
 * It runs contextBridge.exposeInMainWorld at import time, so it is excluded
 * from coverage - but the shape of what it exposes still deserves pinning,
 * because every renderer component reaches through it by name.
 *
 * @jest-environment node
 */
const exposeInMainWorld = jest.fn();
const invoke = jest.fn();
const on = jest.fn();
const removeAllListeners = jest.fn();

jest.mock('electron', () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: { invoke, on, removeAllListeners },
}));

/** Import fresh, since the bridge call happens on import. */
function loadPreload() {
  jest.resetModules();
  jest.isolateModules(() => {
    // eslint-disable-next-line global-require
    require('../main/preload');
  });
  return exposeInMainWorld.mock.calls[
    exposeInMainWorld.mock.calls.length - 1
  ] as [string, Record<string, any>];
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('the exposed bridge', () => {
  it('is published under window.electron', () => {
    const [name] = loadPreload();

    expect(name).toBe('electron');
  });

  it('exposes exactly the surface the renderer expects', () => {
    const [, api] = loadPreload();

    expect(Object.keys(api).sort()).toEqual(
      [
        'openStartggLoginWindow',
        'getCurrentTournament',
        'logOut',
        'getAdminedTournaments',
        'getStartggTournament',
        'toggleParticipantPaid',
        'toggleParticipantAdded',
        'updateParticipantsFiltered',
        'getCopyText',
        'copyToClipboard',
        'onLoggedInStatus',
        'onAdminedTournaments',
        'onTournament',
        'refreshTournament',
        'isMac',
      ].sort(),
    );
  });

  it('reports whether this is a mac, which drives the hotkey map', () => {
    const [, api] = loadPreload();

    expect(api.isMac).toBe(process.platform === 'darwin');
  });
});

describe('invoke methods', () => {
  it.each([
    ['openStartggLoginWindow', [], []],
    ['getCurrentTournament', [], []],
    ['logOut', [], []],
    ['getAdminedTournaments', [], []],
    ['getStartggTournament', ['nyc-melee-100'], ['nyc-melee-100']],
    ['toggleParticipantPaid', [1, 111], [1, 111]],
    ['toggleParticipantAdded', [1, 111], [1, 111]],
    [
      'updateParticipantsFiltered',
      ['alice', { 111: {} }],
      ['alice', { 111: {} }],
    ],
    ['getCopyText', [], []],
    ['copyToClipboard', [], []],
  ])('%s forwards its arguments unchanged', (method, args, expected) => {
    const [, api] = loadPreload();

    api[method](...(args as any[]));

    expect(invoke).toHaveBeenCalledWith(method, ...(expected as any[]));
  });
});

describe('event listeners', () => {
  it.each([
    ['onLoggedInStatus', 'loggedInStatus'],
    ['onAdminedTournaments', 'adminedTournaments'],
    ['onTournament', 'tournament'],
    ['refreshTournament', 'refreshTournament'],
  ])('%s replaces any previous listener on %s', (method, channel) => {
    // App.tsx re-registers on every render of some effects. Without the
    // removeAllListeners first, each re-registration would stack another stale
    // closure and the same IPC message would be handled several times over.
    const [, api] = loadPreload();
    const callback = jest.fn();

    api[method](callback);

    expect(removeAllListeners).toHaveBeenCalledWith(channel);
    expect(on).toHaveBeenCalledWith(channel, callback);
    expect(removeAllListeners.mock.invocationCallOrder[0]).toBeLessThan(
      on.mock.invocationCallOrder[0],
    );
  });
});
