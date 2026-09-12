const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('settings:get'),
  saveConfig: (payload) => ipcRenderer.invoke('settings:save', payload),
  getRecent: () => ipcRenderer.invoke('settings:recent'),
  setAutoStart: (enabled) => ipcRenderer.invoke('settings:set-autostart', enabled),
  openStats: () => ipcRenderer.invoke('settings:open-stats'),
  resetToday: () => ipcRenderer.invoke('settings:reset-today'),
  close: () => ipcRenderer.invoke('settings:close'),
});
