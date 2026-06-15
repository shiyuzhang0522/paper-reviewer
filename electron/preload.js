const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paperReviewerAPI', {
  openPdf: () => ipcRenderer.invoke('pdf:open'),
  saveAnnotatedPdf: (payload) => ipcRenderer.invoke('pdf:saveAnnotated', payload),
  saveSummary: (payload) => ipcRenderer.invoke('summary:save', payload),
  loadReviewState: (payload) => ipcRenderer.invoke('review:load', payload),
  saveReviewState: (payload) => ipcRenderer.invoke('review:save', payload),
  clearReviewState: (payload) => ipcRenderer.invoke('review:clear', payload),
});
