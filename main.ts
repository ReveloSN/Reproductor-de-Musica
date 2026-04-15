import { app, BrowserWindow, Menu, dialog, ipcMain, type FileFilter } from 'electron';
import path from 'node:path';
import buildMenu from './menu';

const isDev = process.env.NODE_ENV === 'development';
const AUDIO_FILE_FILTERS: FileFilter[] = [
  { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
];

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

  void mainWindow.loadFile(path.join(__dirname, 'UI', 'index.html'));

  const mainMenu = Menu.buildFromTemplate(buildMenu(mainWindow, AUDIO_FILE_FILTERS));
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

void app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
