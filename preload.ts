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
  openAudioFolder: (): Promise<AudioFolderSelection> =>
    ipcRenderer.invoke('dialog:open-audio-folder') as Promise<AudioFolderSelection>,
  onMenuAudioFilesSelected: (callback: (filePaths: string[]) => void): void => {
    ipcRenderer.on('audio-files:selected', (_event, filePaths: string[]) => {
      callback(filePaths);
    });
  },
  onMenuAudioFolderSelected: (callback: (selection: AudioFolderSelection) => void): void => {
    ipcRenderer.on('audio-folder:selected', (_event, selection: AudioFolderSelection) => {
      callback(selection);
    });
  },
  filePathToUrl: (filePath: string): string => {
    const origin = globalThis.location?.origin || '';

    if (origin.startsWith('http://') || origin.startsWith('https://')) {
      return `${origin}/__media__?path=${encodeURIComponent(filePath)}`;
    }

    return pathToFileURL(filePath).href;
  },
  basename,
  extname,
  readAudioMetadata: (filePath: string): Promise<AudioFileMetadata> =>
    ipcRenderer.invoke('audio:read-metadata', filePath) as Promise<AudioFileMetadata>,
  fetchLyrics: (query: LyricsLookupQuery): Promise<LyricsResult> =>
    ipcRenderer.invoke('lyrics:lookup', query) as Promise<LyricsResult>,
});

contextBridge.exposeInMainWorld('youtubeAPI', {
  getConfig: (): Promise<YouTubeConfig> =>
    ipcRenderer.invoke('youtube:get-config') as Promise<YouTubeConfig>,
  getApiKeyState: (): Promise<YouTubeApiKeyState> =>
    ipcRenderer.invoke('youtube:get-api-key-state') as Promise<YouTubeApiKeyState>,
  saveApiKey: (apiKey: string): Promise<YouTubeApiKeyState> =>
    ipcRenderer.invoke('youtube:save-api-key', apiKey) as Promise<YouTubeApiKeyState>,
  clearSavedApiKey: (): Promise<YouTubeApiKeyState> =>
    ipcRenderer.invoke('youtube:clear-saved-api-key') as Promise<YouTubeApiKeyState>,
  searchVideos: (query: string): Promise<YouTubeSearchResponse> =>
    ipcRenderer.invoke('youtube:search', query) as Promise<YouTubeSearchResponse>,
  openVideo: (url: string): Promise<boolean> =>
    ipcRenderer.invoke('youtube:open-external', url) as Promise<boolean>,
});

contextBridge.exposeInMainWorld('aiAPI', {
  getConfig: (): Promise<AIPlaylistConfig> =>
    ipcRenderer.invoke('ai:get-config') as Promise<AIPlaylistConfig>,
  generatePlaylist: (request: AIPlaylistGenerateRequest): Promise<AIPlaylistResult> =>
    ipcRenderer.invoke('ai:generate-playlist', request) as Promise<AIPlaylistResult>,
});
