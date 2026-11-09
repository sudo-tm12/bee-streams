'use strict';
const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

contextBridge.exposeInMainWorld('bee', {
  isDesktop: true,
  getSettings: () => ipcRenderer.invoke('settings:get'),
  testKey: (key) => ipcRenderer.invoke('settings:test-key', key),
  saveKey: (key, opts) => ipcRenderer.invoke('settings:save-key', key, opts),
  removeKey: () => ipcRenderer.invoke('settings:remove-key'),
  setRegion: (region) => ipcRenderer.invoke('settings:set-region', region),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  clearCache: () => ipcRenderer.invoke('app:clear-cache'),
  setMiniPlayer: (on) => ipcRenderer.invoke('window:set-mini', on),
  getMiniPlayer: () => ipcRenderer.invoke('window:get-mini'),
  onBlocked: (cb) => subscribe('bee:blocked', cb),
  onCommand: (cb) => subscribe('bee:command', cb),
  onMiniChanged: (cb) => subscribe('bee:mini-changed', cb),
});
