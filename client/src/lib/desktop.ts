/** Bridge to the desktop shell (exposed by preload-app.cjs). Absent when running in a plain browser. */

export type KeyKind = 'v3-key' | 'v4-token' | 'none';

export interface DesktopSettings {
  hasKey: boolean;
  keyHint: string;
  keyKind: KeyKind;
  keyEncrypted: boolean;
  region: string;
  version: string;
  blockedTotal: number;
}

export interface KeyCheckResult {
  ok: boolean;
  code?: string;
  message?: string;
  kind?: KeyKind;
  settings?: DesktopSettings;
}

export interface BlockedEvent {
  kind: 'popup' | 'redirect' | 'download' | 'notification';
  host: string;
  total: number;
}

export type DesktopCommand =
  | { type: 'home' | 'search' | 'my-list' | 'settings' }
  | { type: 'navigate'; path: string };

interface BeeBridge {
  isDesktop: true;
  getSettings(): Promise<DesktopSettings>;
  testKey(key?: string): Promise<KeyCheckResult>;
  saveKey(key: string, opts?: { skipCheck?: boolean }): Promise<KeyCheckResult>;
  removeKey(): Promise<boolean>;
  setRegion(region: string): Promise<boolean>;
  openExternal(url: string): Promise<boolean>;
  clearCache(): Promise<boolean>;
  setMiniPlayer(on: boolean): Promise<boolean>;
  getMiniPlayer(): Promise<boolean>;
  onBlocked(cb: (e: BlockedEvent) => void): () => void;
  onCommand(cb: (c: DesktopCommand) => void): () => void;
  onMiniChanged(cb: (on: boolean) => void): () => void;
}

declare global {
  interface Window {
    bee?: BeeBridge;
  }
}

export const desktop: BeeBridge | null = typeof window !== 'undefined' && window.bee ? window.bee : null;

export function openExternal(url: string) {
  if (desktop) void desktop.openExternal(url);
  else window.open(url, '_blank', 'noopener,noreferrer');
}
