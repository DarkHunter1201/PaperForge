import { app, BrowserWindow, shell } from 'electron';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { AppContainer } from './application/app-container';
import { registerIpc } from './ipc';

let container: AppContainer | null = null;

const applicationRoot = app.isPackaged
  ? (process.env.PORTABLE_EXECUTABLE_DIR ?? dirname(app.getPath('exe')))
  : process.cwd();
const dataRoot = resolve(process.env.PAPERFORGE_DATA_ROOT ?? join(applicationRoot, '.paperforge'));
const electronPaths = {
  userData: join(dataRoot, 'config', 'electron'),
  sessionData: join(dataRoot, 'cache', 'electron'),
  logs: join(dataRoot, 'logs', 'electron'),
  crashDumps: join(dataRoot, 'logs', 'crash-dumps'),
};
for (const path of Object.values(electronPaths)) mkdirSync(path, { recursive: true });
app.setPath('userData', electronPaths.userData);
app.setPath('sessionData', electronPaths.sessionData);
app.setPath('logs', electronPaths.logs);
app.setPath('crashDumps', electronPaths.crashDumps);

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1120,
    minHeight: 720,
    backgroundColor: '#070b12',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  window.once('ready-to-show', () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'));
  }
  return window;
}

app.whenReady().then(() => {
  container = new AppContainer(app);
  registerIpc(container, app.getVersion());
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  container?.close();
  container = null;
});
