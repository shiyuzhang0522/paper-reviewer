const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('paperReviewerAPI', {
  openPdf: () => ipcRenderer.invoke('pdf:open'),
  openImage: () => ipcRenderer.invoke('image:open'),
  readPdf: (payload) => ipcRenderer.invoke('pdf:read', payload),
  openInPreview: (payload) => ipcRenderer.invoke('pdf:openInPreview', payload),
  tilePreviewCompanion: () => ipcRenderer.invoke('window:tilePreviewCompanion'),
  saveAnnotatedPdf: (payload) => ipcRenderer.invoke('pdf:saveAnnotated', payload),
  openSummary: () => ipcRenderer.invoke('summary:open'),
  saveSummary: (payload) => ipcRenderer.invoke('summary:save', payload),
  saveSummaryPdf: (payload) => ipcRenderer.invoke('summary:savePdf', payload),
  loadReviewState: (payload) => ipcRenderer.invoke('review:load', payload),
  saveReviewState: (payload) => ipcRenderer.invoke('review:save', payload),
  clearReviewState: (payload) => ipcRenderer.invoke('review:clear', payload),
});
