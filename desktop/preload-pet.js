const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pet', {
  onSnapshot: (handler) => {
    ipcRenderer.on('pet:snapshot', (_event, snapshot) => handler(snapshot));
  },
  onEvent: (handler) => {
    ipcRenderer.on('pet:event', (_event, event) => handler(event));
  },
  getSnapshot: () => ipcRenderer.invoke('pet:get-snapshot'),
  togglePause: () => ipcRenderer.invoke('pet:toggle-pause'),
  openSettings: () => ipcRenderer.invoke('pet:open-settings'),
  quit: () => ipcRenderer.invoke('pet:quit'),
  requestLayout: (expanded) => ipcRenderer.invoke('pet:request-layout', expanded),
  showMenu: () => ipcRenderer.send('pet:show-menu'),
});
