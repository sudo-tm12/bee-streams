import { useEffect, useState } from 'react';
import { desktop, type DesktopSettings, type KeyCheckResult } from './desktop';
import { createStore, useStore } from './store';
import { credentialKind, tmdbKeyStore, validateCredential } from './tmdb';

export type AppSettings = DesktopSettings;

/** Where the TMDB key lives: the desktop app's encrypted store, or this browser's localStorage. */
interface KeyManager {
  getSettings(): Promise<AppSettings>;
  testKey(key?: string): Promise<KeyCheckResult>;
  saveKey(key: string, opts?: { skipCheck?: boolean }): Promise<KeyCheckResult>;
  removeKey(): Promise<boolean>;
}

function webSettings(): AppSettings {
  const key = tmdbKeyStore.get();
  return {
    hasKey: Boolean(key),
    keyHint: key ? `${'•'.repeat(10)}${key.slice(-4)}` : '',
    keyKind: credentialKind(key),
    keyEncrypted: false,
    region: regionStore.get(),
    version: __APP_VERSION__,
    blockedTotal: 0,
  };
}

const browserKeys: KeyManager = {
  getSettings: async () => webSettings(),
  testKey: (key) => validateCredential(key ?? tmdbKeyStore.get()),
  async saveKey(key, opts) {
    const result = opts?.skipCheck ? { ok: true, kind: credentialKind(key) } : await validateCredential(key);
    if (!result.ok) return result;
    tmdbKeyStore.set(key);
    return { ...result, settings: webSettings() };
  },
  async removeKey() {
    tmdbKeyStore.set('');
    return true;
  },
};

export const keyManager: KeyManager = desktop ?? browserKeys;

/** Region for "where to watch" and age ratings. Synced from the desktop shell when present. */
export const regionStore = createStore<string>('bee:region', 'US', (raw) =>
  typeof raw === 'string' && /^[A-Z]{2}$/.test(raw) ? raw : null,
);

export function useRegion() {
  return useStore(regionStore);
}

export async function setRegion(region: string) {
  regionStore.set(region);
  if (desktop) await desktop.setRegion(region);
}

let settingsPromise: Promise<AppSettings> | null = null;

export function loadAppSettings(force = false): Promise<AppSettings> {
  if (!settingsPromise || force) {
    settingsPromise = keyManager.getSettings().then((s) => {
      if (s.region && s.region !== regionStore.get()) regionStore.set(s.region);
      return s;
    });
  }
  return settingsPromise;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    // Always re-read on the web: it's instant, and the key may have changed in another tab.
    void loadAppSettings(nonce > 0 || !desktop).then((s) => {
      if (alive) setSettings(s);
    });
    return () => {
      alive = false;
    };
  }, [nonce]);
  return { settings, refresh: () => setNonce((n) => n + 1), setSettings };
}

export const REGIONS: Array<[string, string]> = [
  ['US', 'United States'],
  ['GB', 'United Kingdom'],
  ['CA', 'Canada'],
  ['AU', 'Australia'],
  ['NZ', 'New Zealand'],
  ['IE', 'Ireland'],
  ['IN', 'India'],
  ['DE', 'Germany'],
  ['FR', 'France'],
  ['ES', 'Spain'],
  ['IT', 'Italy'],
  ['NL', 'Netherlands'],
  ['SE', 'Sweden'],
  ['NO', 'Norway'],
  ['DK', 'Denmark'],
  ['FI', 'Finland'],
  ['PL', 'Poland'],
  ['PT', 'Portugal'],
  ['BR', 'Brazil'],
  ['MX', 'Mexico'],
  ['AR', 'Argentina'],
  ['JP', 'Japan'],
  ['KR', 'South Korea'],
  ['CN', 'China'],
  ['TW', 'Taiwan'],
  ['HK', 'Hong Kong'],
  ['SG', 'Singapore'],
  ['PH', 'Philippines'],
  ['ZA', 'South Africa'],
  ['AE', 'United Arab Emirates'],
  ['TR', 'Türkiye'],
];
