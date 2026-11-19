const { app, BrowserWindow, Menu, session, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

protocol.registerSchemesAsPrivileged([{
  scheme: 'educologia',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}]);

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
      protocol.handle('educologia', request => {
        const address = new URL(request.url);
        if (address.hostname !== 'app') return new Response('No encontrado', { status: 404 });
        let pathname;
        try { pathname = decodeURIComponent(address.pathname); }
        catch { return new Response('Ruta inválida', { status: 400 }); }
        const target = path.resolve(__dirname, '.' + pathname);
        const allowedRoot = __dirname + path.sep;
        if (!target.startsWith(allowedRoot)) return new Response('No encontrado', { status: 404 });
        return net.fetch(pathToFileURL(target).toString());
      });
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
      await window.loadURL('educologia://app/index.html');
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
