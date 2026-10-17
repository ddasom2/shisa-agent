const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('networkMode', {
  get: () => ipcRenderer.invoke('network-mode-get'),
  save: (value) => ipcRenderer.invoke('network-mode-save', value),
  chat: (messages) => ipcRenderer.invoke('network-mode-chat', messages),
});
