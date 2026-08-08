/**
 * main/util.ts is tiny but reads `app.isPackaged` at module load, so each case
 * needs its own module registry rather than a shared import.
 *
 * @jest-environment node
 */
import path from 'path';

const loadUtil = () =>
  // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
  require('../main/util') as typeof import('../main/util');

/** Reload main/util.ts with electron's `app.isPackaged` set as given. */
function loadWithPackaged(isPackaged: boolean) {
  jest.resetModules();
  jest.doMock('electron', () => ({ app: { isPackaged } }));
  return loadUtil();
}

const ORIGINAL_ENV = process.env;

/**
 * Electron adds `process.resourcesPath` at runtime; plain node has no such
 * property, so the packaged branch would crash on path.join(undefined, ...).
 */
const RESOURCES = '/Applications/Test.app/Contents/Resources';
const HAD_RESOURCES_PATH = 'resourcesPath' in process;
const ORIGINAL_RESOURCES_PATH = (process as any).resourcesPath;

beforeEach(() => {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV };
  (process as any).resourcesPath = RESOURCES;
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
  if (HAD_RESOURCES_PATH) {
    (process as any).resourcesPath = ORIGINAL_RESOURCES_PATH;
  } else {
    delete (process as any).resourcesPath;
  }
  jest.resetModules();
});

describe('resolveHtmlPath', () => {
  it('points at the webpack dev server on the default port in development', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.PORT;

    expect(loadWithPackaged(false).resolveHtmlPath('index.html')).toBe(
      'http://localhost:1212/index.html',
    );
  });

  it('honours a PORT override in development', () => {
    process.env.NODE_ENV = 'development';
    process.env.PORT = '4000';

    expect(loadWithPackaged(false).resolveHtmlPath('index.html')).toBe(
      'http://localhost:4000/index.html',
    );
  });

  it('falls back to the default port when PORT is empty rather than unset', () => {
    // `process.env.PORT || 1212` treats '' as absent; a `??` would not.
    process.env.NODE_ENV = 'development';
    process.env.PORT = '';

    expect(loadWithPackaged(false).resolveHtmlPath('index.html')).toBe(
      'http://localhost:1212/index.html',
    );
  });

  it('points at the bundled file outside development', () => {
    process.env.NODE_ENV = 'production';

    const resolved = loadWithPackaged(true).resolveHtmlPath('index.html');

    expect(resolved.startsWith('file://')).toBe(true);
    expect(resolved.endsWith(path.join('renderer', 'index.html'))).toBe(true);
  });
});

describe('RESOURCES_PATH', () => {
  it('reads assets out of the app bundle once packaged', () => {
    const { RESOURCES_PATH } = loadWithPackaged(true);

    expect(RESOURCES_PATH).toBe(path.join(RESOURCES, 'assets'));
  });

  it('reads assets out of the repo when unpackaged', () => {
    const { RESOURCES_PATH } = loadWithPackaged(false);

    expect(RESOURCES_PATH).not.toContain(RESOURCES);
    expect(RESOURCES_PATH.endsWith('assets')).toBe(true);
  });
});

describe('getAssetPath', () => {
  it('joins onto whichever resources root is active', () => {
    const { getAssetPath, RESOURCES_PATH } = loadWithPackaged(true);

    expect(getAssetPath('icon.png')).toBe(
      path.join(RESOURCES_PATH, 'icon.png'),
    );
  });

  it('joins several segments', () => {
    const { getAssetPath, RESOURCES_PATH } = loadWithPackaged(false);

    expect(getAssetPath('icons', '512.png')).toBe(
      path.join(RESOURCES_PATH, 'icons', '512.png'),
    );
  });
});
