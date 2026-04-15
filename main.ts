import {
  app,
  BrowserWindow,
  Menu,
  dialog,
  ipcMain,
  session,
  shell,
  type FileFilter,
  type OpenDialogOptions,
} from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import buildMenu from './menu';
import { readAudioMetadata } from './audio-metadata-service';
import { fetchLyricsFromRemote } from './lyrics-remote-service';
import { startLocalAppServer } from './local-http-server';
import { getYouTubeConfig, searchYouTubeVideos } from './youtube-service';

const isDev = process.env.NODE_ENV === 'development';
const AUDIO_FILE_FILTERS: FileFilter[] = [
  { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
];
const AUDIO_EXTENSIONS = new Set<string>(['.mp3', '.wav', '.ogg', '.m4a']);
const YOUTUBE_REQUEST_URLS = [
  'https://www.youtube.com/*',
  'https://*.youtube.com/*',
  'https://www.youtube-nocookie.com/*',
  'https://*.youtube-nocookie.com/*',
];

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let youtubeEmbedIdentityConfigured = false;
let localAppBaseUrl = '';

function readHeader(requestHeaders: Record<string, string | string[]>, key: string): string {
  const directValue = requestHeaders[key];

  if (typeof directValue === 'string') {
    return directValue;
  }

  if (Array.isArray(directValue)) {
    return directValue[0] || '';
  }

  const matchingKey = Object.keys(requestHeaders).find(
    (headerKey) => headerKey.toLowerCase() === key.toLowerCase()
  );

  if (!matchingKey) {
    return '';
  }

  const matchingValue = requestHeaders[matchingKey];

  if (typeof matchingValue === 'string') {
    return matchingValue;
  }

  return Array.isArray(matchingValue) ? matchingValue[0] || '' : '';
}

function writeHeader(
  requestHeaders: Record<string, string | string[]>,
  key: string,
  value: string
): void {
  const matchingKey = Object.keys(requestHeaders).find(
    (headerKey) => headerKey.toLowerCase() === key.toLowerCase()
  );

  if (matchingKey) {
    requestHeaders[matchingKey] = value;
    return;
  }

  requestHeaders[key] = value;
}

function configureYouTubeEmbedIdentity(embedBaseUrl: string): void {
  if (youtubeEmbedIdentityConfigured) {
    return;
  }

  youtubeEmbedIdentityConfigured = true;

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: YOUTUBE_REQUEST_URLS },
    (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      writeHeader(requestHeaders, 'Referer', `${embedBaseUrl}/`);
      writeHeader(requestHeaders, 'Origin', embedBaseUrl);

      callback({ requestHeaders });
    }
  );
}

async function collectAudioFilesFromDirectory(directoryPath: string): Promise<string[]> {
  const audioFiles: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });
    const sortedEntries = [...entries].sort((left, right) =>
      left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: 'base' })
    );

    for (const entry of sortedEntries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();

      if (AUDIO_EXTENSIONS.has(extension)) {
        audioFiles.push(entryPath);
      }
    }
  }

  await walk(directoryPath);
  return audioFiles;
}

async function openAudioFolderDialog(
  browserWindow?: BrowserWindow
): Promise<AudioFolderSelection> {
  const dialogOptions: OpenDialogOptions = {
    properties: ['openDirectory'],
    buttonLabel: 'Abrir carpeta',
  };
  const result = browserWindow
    ? await dialog.showOpenDialog(browserWindow, dialogOptions)
    : await dialog.showOpenDialog(dialogOptions);

  if (result.canceled || result.filePaths.length === 0) {
    return {
      folderPath: '',
      filePaths: [],
    };
  }

  const folderPath = result.filePaths[0] || '';

  if (!folderPath) {
    return {
      folderPath: '',
      filePaths: [],
    };
  }

  const filePaths = await collectAudioFilesFromDirectory(folderPath);

  return {
    folderPath,
    filePaths,
  };
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    title: 'Local Audio Player',
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 620,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }

  if (!localAppBaseUrl) {
    throw new Error('El servidor local de la app no esta disponible.');
  }

  void mainWindow.loadURL(`${localAppBaseUrl}/index.html`);

  const mainMenu = Menu.buildFromTemplate(
    buildMenu(mainWindow, AUDIO_FILE_FILTERS, async () => {
      const selection = await openAudioFolderDialog(mainWindow);

      if (selection.folderPath) {
        mainWindow.webContents.send('audio-folder:selected', selection);
      }
    })
  );
  Menu.setApplicationMenu(mainMenu);

  return mainWindow;
}

ipcMain.handle('dialog:open-audio-files', async (): Promise<string[]> => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: AUDIO_FILE_FILTERS,
  });

  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('dialog:open-audio-folder', async (): Promise<AudioFolderSelection> => {
  return openAudioFolderDialog();
});

ipcMain.handle('audio:read-metadata', async (_event, filePath: string): Promise<AudioFileMetadata> => {
  return readAudioMetadata(filePath);
});

ipcMain.handle('lyrics:lookup', async (_event, query: LyricsLookupQuery): Promise<LyricsResult> => {
  return fetchLyricsFromRemote(query);
});

ipcMain.handle('youtube:get-config', async (): Promise<YouTubeConfig> => {
  return getYouTubeConfig();
});

ipcMain.handle('youtube:search', async (_event, query: string): Promise<YouTubeSearchResponse> => {
  return searchYouTubeVideos(query);
});

ipcMain.handle('youtube:open-external', async (_event, url: string): Promise<boolean> => {
  const targetUrl = String(url || '').trim();

  if (!targetUrl) {
    return false;
  }

  await shell.openExternal(targetUrl);
  return true;
});

void app.whenReady().then(async () => {
  const localServer = await startLocalAppServer(path.join(__dirname, 'UI'));
  localAppBaseUrl = localServer.baseUrl;
  configureYouTubeEmbedIdentity(localAppBaseUrl);
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', () => {
    void localServer.stop().catch(() => {
      // Ignore shutdown issues from the ephemeral local server.
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
