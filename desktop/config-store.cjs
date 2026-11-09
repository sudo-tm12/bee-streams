'use strict';
/**
 * Persistent settings in %APPDATA%/the-bee-streams/bee-streams-config.json.
 * The TMDB key is encrypted with Windows DPAPI (Electron safeStorage) when available.
 */
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');

const FILE_NAME = 'bee-streams-config.json';

function filePath() {
  return path.join(app.getPath('userData'), FILE_NAME);
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath(), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function write(next) {
  const target = filePath();
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, target);
}

function update(patch) {
  const next = { ...read(), ...patch };
  write(next);
  return next;
}

function getTmdbKey() {
  const cfg = read();
  if (typeof cfg.tmdbKeyEncrypted === 'string' && cfg.tmdbKeyEncrypted) {
    try {
      return safeStorage.decryptString(Buffer.from(cfg.tmdbKeyEncrypted, 'base64')).trim();
    } catch {
      return '';
    }
  }
  return typeof cfg.tmdbApiKey === 'string' ? cfg.tmdbApiKey.trim() : '';
}

function setTmdbKey(key) {
  const cfg = read();
  delete cfg.tmdbApiKey;
  delete cfg.tmdbKeyEncrypted;
  const value = String(key ?? '').trim();
  if (value) {
    if (safeStorage.isEncryptionAvailable()) {
      cfg.tmdbKeyEncrypted = safeStorage.encryptString(value).toString('base64');
    } else {
      cfg.tmdbApiKey = value;
    }
  }
  write(cfg);
}

function isKeyEncrypted() {
  return typeof read().tmdbKeyEncrypted === 'string';
}

/** Upgrades a plain-text key written by older versions to the encrypted form. */
function migrate() {
  const cfg = read();
  if (typeof cfg.tmdbApiKey === 'string' && cfg.tmdbApiKey.trim() && safeStorage.isEncryptionAvailable()) {
    setTmdbKey(cfg.tmdbApiKey);
  }
}

function getRegion() {
  const r = String(read().region ?? '').toUpperCase();
  if (/^[A-Z]{2}$/.test(r)) return r;
  const fromLocale = String(app.getLocaleCountryCode?.() ?? '').toUpperCase();
  return /^[A-Z]{2}$/.test(fromLocale) ? fromLocale : 'US';
}

function setRegion(region) {
  const r = String(region ?? '').toUpperCase();
  if (!/^[A-Z]{2}$/.test(r)) return false;
  update({ region: r });
  return true;
}

function getWindowState() {
  const s = read().window;
  if (!s || typeof s !== 'object') return null;
  const { x, y, width, height, maximized } = s;
  if (![width, height].every((n) => Number.isFinite(n) && n > 200)) return null;
  return {
    x: Number.isFinite(x) ? x : undefined,
    y: Number.isFinite(y) ? y : undefined,
    width,
    height,
    maximized: Boolean(maximized),
  };
}

function setWindowState(state) {
  update({ window: state });
}

module.exports = {
  filePath,
  getTmdbKey,
  setTmdbKey,
  isKeyEncrypted,
  migrate,
  getRegion,
  setRegion,
  getWindowState,
  setWindowState,
};
