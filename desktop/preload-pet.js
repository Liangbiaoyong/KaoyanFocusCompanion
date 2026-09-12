const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onSnapshot: (handler) => {
    ipcRenderer.on('pet:snapshot', (_event, snapshot) => handler(snapshot));
  },
  getSnapshot: () => ipcRenderer.invoke('pet:get-snapshot'),
  togglePause: () => ipcRenderer.invoke('pet:toggle-pause'),
  openSettings: () => ipcRenderer.invoke('pet:open-settings'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
});
