const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('settings:get'),
  saveConfig: (payload) => ipcRenderer.invoke('settings:save', payload),
  getRecent: () => ipcRenderer.invoke('settings:recent'),
  close: () => ipcRenderer.invoke('settings:close'),
});
