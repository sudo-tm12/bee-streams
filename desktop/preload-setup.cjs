'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('beeSetup', {
  getContext: () => ipcRenderer.invoke('setup:get-context'),
  saveKey: (key, opts) => ipcRenderer.invoke('setup:save-key', key, opts),
  openTmdb: () => ipcRenderer.invoke('setup:open-tmdb'),
});
