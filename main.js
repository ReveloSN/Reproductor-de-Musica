const { app, BrowserWindow, Menu, dialog, ipcMain } = require('electron');
const path = require('node:path');
const buildMenu = require('./menu');

const isDev = process.env.NODE_ENV === 'development';
const AUDIO_FILE_FILTERS = [
  { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg', 'm4a'] },
];

function createWindow() {
  const win = new BrowserWindow({
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
    win.webContents.openDevTools({ mode: 'detach' });
  }

  win.loadFile(path.join(__dirname, 'UI', 'index.html'));

  const mainMenu = Menu.buildFromTemplate(buildMenu(win, AUDIO_FILE_FILTERS));
  Menu.setApplicationMenu(mainMenu);

  return win;
}

ipcMain.handle('dialog:open-audio-files', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: AUDIO_FILE_FILTERS,
  });

  return result.canceled ? [] : result.filePaths;
});

app.whenReady().then(() => {
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
