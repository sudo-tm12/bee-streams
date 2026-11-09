import { useEffect, useState } from 'react';
import { desktop, type DesktopSettings } from './desktop';
import { createStore, useStore } from './store';

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

let settingsPromise: Promise<DesktopSettings | null> | null = null;

export function loadDesktopSettings(force = false): Promise<DesktopSettings | null> {
  if (!desktop) return Promise.resolve(null);
  if (!settingsPromise || force) {
    settingsPromise = desktop.getSettings().then((s) => {
      if (s.region && s.region !== regionStore.get()) regionStore.set(s.region);
      return s;
    });
  }
  return settingsPromise;
}

export function useDesktopSettings() {
  const [settings, setSettings] = useState<DesktopSettings | null>(null);
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    void loadDesktopSettings(nonce > 0).then((s) => {
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
