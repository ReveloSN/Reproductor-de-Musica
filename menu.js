const { dialog } = require('electron');

function buildMenu(mainWindow, audioFilters) {
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
            dialog.showMessageBox(mainWindow, {
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

module.exports = buildMenu;
