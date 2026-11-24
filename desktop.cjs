const { app, BrowserWindow, Menu, session } = require('electron');
const path = require('node:path');

const title = 'Educología | Inventario';
app.setName('Educología');
app.setAppUserModelId('cr.una.educologia.inventario');

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let window;

  app.on('second-instance', () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });

  app
    .whenReady()
    .then(async () => {
      Menu.setApplicationMenu(null);
      session.defaultSession.setPermissionRequestHandler((_contents, _permission, respond) =>
        respond(false),
      );
      session.defaultSession.setPermissionCheckHandler(() => false);
      window = new BrowserWindow({
        title,
        width: 1240,
        height: 820,
        minWidth: 720,
        minHeight: 540,
        backgroundColor: '#f5f3f0',
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
        },
      });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      window.webContents.on('will-attach-webview', (event) => event.preventDefault());
      window.once('ready-to-show', () => window.show());
      await window.loadFile(path.join(__dirname, 'index.html'));
    })
    .catch((error) => {
      require('electron').dialog.showErrorBox(
        title,
        'No se pudo abrir la aplicación.\n' + error.message,
      );
      app.quit();
    });

  app.on('window-all-closed', () => app.quit());
}
