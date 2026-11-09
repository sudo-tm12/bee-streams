'use strict';
/**
 * App-wide protection against things embedded pages try to do to you:
 *  - popups / new windows (pop-unders, "you won" tabs)          → blocked
 *  - redirecting the app window to another site                → blocked
 *  - forced downloads (fake "player update" .exe files)        → blocked
 *  - permission prompts (notifications, camera, location, USB) → denied
 * Links the app itself opens (TMDB, IMDb, YouTube) go through `openExternalSafe`, which
 * only allows a short list of known sites.
 */
const { shell } = require('electron');

const EXTERNAL_HOSTS = new Set([
  'themoviedb.org',
  'www.themoviedb.org',
  'imdb.com',
  'www.imdb.com',
  'm.imdb.com',
  'youtube.com',
  'www.youtube.com',
  'youtu.be',
  'justwatch.com',
  'www.justwatch.com',
]);

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function createGuard({ appOrigin, onBlocked, onInternalOpen }) {
  function isAppUrl(url) {
    try {
      return new URL(url).origin === appOrigin;
    } catch {
      return false;
    }
  }

  function isSafeExternal(url) {
    try {
      const u = new URL(url);
      return u.protocol === 'https:' && EXTERNAL_HOSTS.has(u.hostname);
    } catch {
      return false;
    }
  }

  async function openExternalSafe(url) {
    if (!isSafeExternal(url)) return false;
    await shell.openExternal(url);
    return true;
  }

  function hardenSession(ses) {
    ses.setPermissionRequestHandler((_wc, permission, callback, details) => {
      if (permission === 'fullscreen') return callback(true);
      if (permission === 'clipboard-sanitized-write' && isAppUrl(details?.requestingUrl ?? '')) {
        return callback(true);
      }
      if (permission === 'notifications') onBlocked('notification', details?.requestingUrl ?? '');
      return callback(false);
    });

    ses.setPermissionCheckHandler((_wc, permission, requestingOrigin) => {
      if (permission === 'fullscreen') return true;
      if (permission === 'clipboard-sanitized-write') return requestingOrigin === appOrigin;
      return false;
    });

    ses.setDevicePermissionHandler(() => false);

    ses.on('will-download', (event, item) => {
      event.preventDefault();
      onBlocked('download', item.getURL());
    });
  }

  /** Applied to every webContents the app creates (main window, setup window, frames' hosts). */
  function hardenContents(contents) {
    contents.setWindowOpenHandler(({ url }) => {
      if (isAppUrl(url)) {
        onInternalOpen?.(url);
      } else {
        onBlocked('popup', url);
      }
      return { action: 'deny' };
    });

    // Fires for navigations of the top-level page (including ones a player frame
    // triggers with `top.location = ...`). The app only ever lives on its own origin.
    contents.on('will-navigate', (event, legacyUrl) => {
      const url = event.url ?? legacyUrl;
      if (!isAppUrl(url)) {
        event.preventDefault();
        onBlocked('redirect', url);
      }
    });

    contents.on('will-attach-webview', (event) => event.preventDefault());
  }

  return { isAppUrl, isSafeExternal, openExternalSafe, hardenSession, hardenContents };
}

module.exports = { createGuard, hostOf };
