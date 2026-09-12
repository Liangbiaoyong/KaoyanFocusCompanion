const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('statsApi', {
  getData: () => ipcRenderer.invoke('stats:get'),
  close: () => ipcRenderer.invoke('stats:close'),
  onRefresh: (handler) => {
    ipcRenderer.on('stats:refresh', () => handler());
  },
});
