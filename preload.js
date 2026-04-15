const { contextBridge, ipcRenderer } = require('electron');
const { pathToFileURL } = require('url');

function basename(filePath) {
  const normalizedPath = String(filePath).replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || normalizedPath;
}

function extname(filePath) {
  const fileName = basename(filePath);
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return '';
  }

  return fileName.slice(lastDotIndex);
}

contextBridge.exposeInMainWorld('versions', {
  node: () => process.versions.node,
  electron: () => process.versions.electron,
  chrome: () => process.versions.chrome,
});

contextBridge.exposeInMainWorld('audioAPI', {
  openAudioFiles: () => ipcRenderer.invoke('dialog:open-audio-files'),
  onMenuAudioFilesSelected: (callback) => {
    ipcRenderer.on('audio-files:selected', (_, filePaths) => {
      callback(filePaths);
    });
  },
  filePathToUrl: (filePath) => pathToFileURL(filePath).href,
  basename,
  extname,
});
