'use strict';
const { app, BrowserWindow, Menu, dialog, ipcMain, screen, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const store = require('./config-store.cjs');
const { createGuard, hostOf } = require('./security.cjs');

// Optional overrides (handy for testing a second copy side by side).
if (process.env.BEE_USER_DATA) app.setPath('userData', path.resolve(process.env.BEE_USER_DATA));
const APP_PORT = Number(process.env.BEE_PORT) || 4010;
const APP_ORIGIN = `http://localhost:${APP_PORT}`;
const MIN_SIZE = { width: 960, height: 600 };
const MINI_SIZE = { width: 512, height: 288 };
const TMDB_API_PAGE = 'https://www.themoviedb.org/settings/api';

/** @type {any} */
let serverModule = null;
/** @type {{ close: () => Promise<void> } | null} */
let serverHandle = null;
/** @type {BrowserWindow | null} */
let mainWindow = null;
/** @type {BrowserWindow | null} */
let setupWindow = null;
/** @type {{ bounds: Electron.Rectangle, maximized: boolean } | null} */
let miniState = null;
let blockedTotal = 0;
let setupReason = '';

/* ------------------------------------------------------------------ */
/* Protection                                                          */
/* ------------------------------------------------------------------ */

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

const guard = createGuard({
  appOrigin: APP_ORIGIN,
  onBlocked(kind, url) {
    blockedTotal += 1;
    sendToMain('bee:blocked', { kind, host: hostOf(url), total: blockedTotal });
  },
  onInternalOpen(url) {
    const u = new URL(url);
    sendToMain('bee:command', { type: 'navigate', path: `${u.pathname}${u.search}${u.hash}` });
  },
});

app.on('web-contents-created', (_event, contents) => guard.hardenContents(contents));

/* ------------------------------------------------------------------ */
/* Local server                                                        */
/* ------------------------------------------------------------------ */

function resourcePaths() {
  if (app.isPackaged) {
    return {
      server: path.join(process.resourcesPath, 'server-dist', 'index.js'),
      client: path.join(process.resourcesPath, 'client-dist'),
    };
  }
  const root = path.join(__dirname, '..');
  return {
    server: path.join(root, 'server', 'src', 'index.js'),
    client: path.join(root, 'client', 'dist'),
  };
}

async function loadServerModule() {
  if (!serverModule) {
    const entry = resourcePaths().server;
    if (!fs.existsSync(entry)) {
      throw new Error(`App files are missing (${entry}). Please reinstall The Bee Streams.`);
    }
    serverModule = await import(pathToFileURL(entry).href);
  }
  return serverModule;
}

async function ensureServer() {
  const srv = await loadServerModule();
  srv.setTmdbCredential(store.getTmdbKey());
  if (!serverHandle) {
    serverHandle = await srv.startServer({ port: APP_PORT, staticDir: resourcePaths().client });
  }
  return srv;
}

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/** Cleans up common paste mistakes: whitespace, quotes, a leading "Bearer ". */
function normalizeKey(raw) {
  return String(raw ?? '')
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^bearer\s+/i, '')
    .replace(/\s+/g, '');
}

async function checkAndSaveKey(raw, opts = {}) {
  const key = normalizeKey(raw);
  if (!key) return { ok: false, code: 'TMDB_KEY_MISSING', message: 'Paste your TMDB key first.' };
  if (key.length < 20 || key.length > 2000) {
    return {
      ok: false,
      code: 'BAD_FORMAT',
      message: 'That doesn’t look like a TMDB key. Copy the “API Key” or “API Read Access Token” from TMDB.',
    };
  }
  const srv = await loadServerModule();
  if (!opts.skipCheck) {
    const result = await srv.validateTmdbCredential(key);
    if (!result.ok) return result;
  }
  store.setTmdbKey(key);
  srv.setTmdbCredential(key);
  return { ok: true, settings: settingsSnapshot() };
}

function settingsSnapshot() {
  const key = store.getTmdbKey();
  return {
    hasKey: Boolean(key),
    keyHint: key ? `${'•'.repeat(10)}${key.slice(-4)}` : '',
    keyKind: serverModule ? serverModule.credentialKind(key) : key ? 'v3-key' : 'none',
    keyEncrypted: store.isKeyEncrypted(),
    region: store.getRegion(),
    version: app.getVersion(),
    blockedTotal,
  };
}

/* ------------------------------------------------------------------ */
/* Windows                                                             */
/* ------------------------------------------------------------------ */

function isOnScreen(bounds) {
  return screen.getAllDisplays().some(({ workArea: a }) => {
    return (
      bounds.x < a.x + a.width - 120 &&
      bounds.x + bounds.width > a.x + 120 &&
      bounds.y >= a.y - 40 &&
      bounds.y < a.y + a.height - 120
    );
  });
}

function saveWindowState() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const bounds = miniState ? miniState.bounds : mainWindow.getNormalBounds();
  const maximized = miniState ? miniState.maximized : mainWindow.isMaximized();
  try {
    store.setWindowState({ ...bounds, maximized });
  } catch {
    /* non-fatal */
  }
}

function createMainWindow() {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  const saved = store.getWindowState();
  const position =
    saved && saved.x !== undefined && saved.y !== undefined && isOnScreen(saved) ? { x: saved.x, y: saved.y } : {};

  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1360,
    height: saved?.height ?? 860,
    ...position,
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    show: false,
    backgroundColor: '#0b0b0c',
    title: 'The Bee Streams',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-app.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
      spellcheck: false,
    },
  });

  if (saved?.maximized) mainWindow.maximize();
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  void mainWindow.loadURL(`${APP_ORIGIN}/`);

  mainWindow.on('close', saveWindowState);
  mainWindow.on('closed', () => {
    mainWindow = null;
    miniState = null;
  });
  mainWindow.on('app-command', (_e, command) => {
    if (command === 'browser-backward') goBack();
    if (command === 'browser-forward') goForward();
  });
  mainWindow.webContents.on('render-process-gone', (_e, details) => {
    if (details.reason !== 'clean-exit') mainWindow?.webContents.reload();
  });
}

function createSetupWindow(reason = '') {
  setupReason = reason;
  if (setupWindow) {
    setupWindow.focus();
    return;
  }
  setupWindow = new BrowserWindow({
    width: 560,
    height: 720,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#0b0b0c',
    title: 'The Bee Streams — Setup',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload-setup.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });
  setupWindow.setMenu(null);
  void setupWindow.loadFile(path.join(__dirname, 'setup.html'));
  setupWindow.once('ready-to-show', () => setupWindow?.show());
  setupWindow.on('closed', () => {
    setupWindow = null;
    if (!mainWindow) app.quit();
  });
}

function closeSetupWindow() {
  if (!setupWindow) return;
  const win = setupWindow;
  setupWindow = null;
  win.removeAllListeners('closed');
  win.close();
}

function goBack() {
  const history = mainWindow?.webContents.navigationHistory;
  if (history?.canGoBack()) history.goBack();
}

function goForward() {
  const history = mainWindow?.webContents.navigationHistory;
  if (history?.canGoForward()) history.goForward();
}

/** Small always-on-top player in the corner of the screen. */
function setMiniPlayer(on) {
  const win = mainWindow;
  if (!win) return false;
  if (on && !miniState) {
    if (win.isFullScreen()) win.setFullScreen(false);
    miniState = { bounds: win.getNormalBounds(), maximized: win.isMaximized() };
    if (win.isMaximized()) win.unmaximize();
    win.setMinimumSize(320, 180);
    const area = screen.getDisplayMatching(win.getBounds()).workArea;
    win.setContentBounds({
      x: area.x + area.width - MINI_SIZE.width - 24,
      y: area.y + area.height - MINI_SIZE.height - 24,
      width: MINI_SIZE.width,
      height: MINI_SIZE.height,
    });
    win.setAlwaysOnTop(true, 'floating');
  } else if (!on && miniState) {
    const previous = miniState;
    miniState = null;
    win.setAlwaysOnTop(false);
    win.setMinimumSize(MIN_SIZE.width, MIN_SIZE.height);
    win.setBounds(previous.bounds);
    if (previous.maximized) win.maximize();
  }
  sendToMain('bee:mini-changed', Boolean(miniState));
  return Boolean(miniState);
}

function buildMenu() {
  const command = (type) => () => {
    if (!mainWindow) return;
    mainWindow.show();
    sendToMain('bee:command', { type });
  };
  return Menu.buildFromTemplate([
    {
      label: '&App',
      submenu: [
        { label: 'Home', accelerator: 'Alt+H', click: command('home') },
        { label: 'Search', accelerator: 'CmdOrCtrl+K', click: command('search') },
        { label: 'My List', accelerator: 'CmdOrCtrl+L', click: command('my-list') },
        { type: 'separator' },
        { label: 'Settings', accelerator: 'CmdOrCtrl+,', click: command('settings') },
        { type: 'separator' },
        { role: 'quit', label: 'Quit' },
      ],
    },
    {
      label: '&View',
      submenu: [
        { label: 'Back', accelerator: 'Alt+Left', click: goBack },
        { label: 'Forward', accelerator: 'Alt+Right', click: goForward },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { role: 'toggleDevTools' },
      ],
    },
  ]);
}

/* ------------------------------------------------------------------ */
/* IPC                                                                 */
/* ------------------------------------------------------------------ */

function fromMainWindow(event) {
  const frame = event.senderFrame;
  return Boolean(
    mainWindow &&
      event.sender === mainWindow.webContents &&
      frame &&
      frame === event.sender.mainFrame &&
      guard.isAppUrl(frame.url),
  );
}

function fromSetupWindow(event) {
  return Boolean(setupWindow && event.sender === setupWindow.webContents && event.senderFrame === event.sender.mainFrame);
}

function handle(channel, isAllowed, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isAllowed(event)) throw new Error('Not allowed');
    return fn(...args);
  });
}

function registerIpc() {
  // Main window
  handle('settings:get', fromMainWindow, () => settingsSnapshot());
  handle('settings:test-key', fromMainWindow, async (raw) => {
    const srv = await loadServerModule();
    const key = raw ? normalizeKey(raw) : store.getTmdbKey();
    return srv.validateTmdbCredential(key);
  });
  handle('settings:save-key', fromMainWindow, (raw, opts) => checkAndSaveKey(raw, { skipCheck: Boolean(opts?.skipCheck) }));
  handle('settings:remove-key', fromMainWindow, async () => {
    store.setTmdbKey('');
    (await loadServerModule()).setTmdbCredential('');
    createSetupWindow('removed');
    if (miniState) setMiniPlayer(false);
    mainWindow?.close();
    return true;
  });
  handle('settings:set-region', fromMainWindow, (region) => store.setRegion(region));
  handle('app:open-external', fromMainWindow, (url) => guard.openExternalSafe(String(url ?? '')));
  handle('app:clear-cache', fromMainWindow, async () => {
    (await loadServerModule()).clearCache();
    await session.defaultSession.clearCache();
    return true;
  });
  handle('window:set-mini', fromMainWindow, (on) => setMiniPlayer(Boolean(on)));
  handle('window:get-mini', fromMainWindow, () => Boolean(miniState));

  // Setup window
  handle('setup:get-context', fromSetupWindow, () => ({ reason: setupReason }));
  handle('setup:open-tmdb', fromSetupWindow, () => shell.openExternal(TMDB_API_PAGE));
  handle('setup:save-key', fromSetupWindow, async (raw, opts) => {
    const result = await checkAndSaveKey(raw, { skipCheck: Boolean(opts?.skipCheck) });
    if (!result.ok) return result;
    await ensureServer();
    createMainWindow();
    closeSetupWindow();
    return { ok: true };
  });
}

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */

function fatal(err) {
  const message =
    err && err.code === 'EADDRINUSE'
      ? `Port ${APP_PORT} is already being used by another program.\n\nClose the other program (or another copy of The Bee Streams) and try again.`
      : String(err && err.message ? err.message : err);
  dialog.showErrorBox('The Bee Streams couldn’t start', message);
  app.quit();
}

async function boot() {
  guard.hardenSession(session.defaultSession);
  Menu.setApplicationMenu(buildMenu());
  try {
    store.migrate();
  } catch (err) {
    // Keep going with whatever is stored; the upgrade is retried on next launch.
    console.error('Settings upgrade failed:', err);
  }
  registerIpc();

  try {
    await ensureServer();
  } catch (err) {
    fatal(err);
    return;
  }

  if (store.getTmdbKey()) createMainWindow();
  else createSetupWindow();

  if (!app.isPackaged && process.env.BEE_DEV_HOOK) {
    require(path.resolve(process.env.BEE_DEV_HOOK))({
      app,
      appOrigin: APP_ORIGIN,
      getMainWindow: () => mainWindow,
      getSetupWindow: () => setupWindow,
      getBlockedTotal: () => blockedTotal,
    });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const win = mainWindow ?? setupWindow;
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });

  app.whenReady().then(boot, fatal);

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });

  app.on('before-quit', () => {
    saveWindowState();
    void serverHandle?.close();
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length > 0) return;
    if (store.getTmdbKey()) createMainWindow();
    else createSetupWindow();
  });
}
