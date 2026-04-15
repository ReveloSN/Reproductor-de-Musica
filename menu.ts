import { dialog, type BrowserWindow, type FileFilter, type MenuItemConstructorOptions } from 'electron';

function buildMenu(
  mainWindow: BrowserWindow,
  audioFilters: FileFilter[],
  openAudioFolder: () => Promise<void>
): MenuItemConstructorOptions[] {
  return [
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Agregar canciones',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile', 'multiSelections'],
              filters: audioFilters,
            });

            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('audio-files:selected', result.filePaths);
            }
          },
        },
        {
          label: 'Abrir carpeta como playlist',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => {
            try {
              await openAudioFolder();
            } catch (error) {
              const detail = error instanceof Error ? error.message : String(error);
              await dialog.showMessageBox(mainWindow, {
                type: 'error',
                title: 'No fue posible abrir la carpeta',
                message: 'La carpeta elegida no pudo procesarse como playlist.',
                detail,
              });
            }
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Acerca de',
          click: () => {
            void dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Acerca de',
              message: 'Local Audio Player',
              detail:
                'Reproductor local hecho con Electron para gestionar playlists con lista doblemente enlazada.',
            });
          },
        },
        { type: 'separator' },
        { role: 'toggleDevTools' },
      ],
    },
  ];
}

export default buildMenu;
