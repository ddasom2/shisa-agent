const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('pet', {
  get: () => ipcRenderer.invoke('pet-view-get'),
  onView: (callback) => ipcRenderer.on('pet-view', (_event, data) => callback(data)),
  startDrag: () => ipcRenderer.send('pet-drag-start'),
  endDrag: () => ipcRenderer.send('pet-drag-end'),
});
