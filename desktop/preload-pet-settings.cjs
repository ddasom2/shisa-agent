const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('petSettings', {
  get: () => ipcRenderer.invoke('pet-settings-get'),
  command: (command, data) => ipcRenderer.invoke('pet-settings-command', command, data),
  onChange: (callback) => ipcRenderer.on('pet-settings-changed', () => callback()),
  onFocus: (callback) => ipcRenderer.on('pet-settings-focus', (_e, id) => callback(id)),
});
