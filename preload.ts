import { contextBridge, ipcRenderer } from 'electron';
import { pathToFileURL } from 'node:url';

function basename(filePath: string): string {
  const normalizedPath = String(filePath).replace(/\\/g, '/');
  const segments = normalizedPath.split('/');
  return segments[segments.length - 1] || normalizedPath;
}

function extname(filePath: string): string {
  const fileName = basename(filePath);
  const lastDotIndex = fileName.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return '';
  }

  return fileName.slice(lastDotIndex);
}

contextBridge.exposeInMainWorld('versions', {
  node: (): string => process.versions.node,
  electron: (): string => process.versions.electron,
  chrome: (): string => process.versions.chrome,
});

contextBridge.exposeInMainWorld('audioAPI', {
  openAudioFiles: (): Promise<string[]> => ipcRenderer.invoke('dialog:open-audio-files') as Promise<string[]>,
  onMenuAudioFilesSelected: (callback: (filePaths: string[]) => void): void => {
    ipcRenderer.on('audio-files:selected', (_event, filePaths: string[]) => {
      callback(filePaths);
    });
  },
  filePathToUrl: (filePath: string): string => pathToFileURL(filePath).href,
  basename,
  extname,
});
