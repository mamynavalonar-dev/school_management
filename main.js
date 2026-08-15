// main.js (ESM)
import { app, BrowserWindow } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function loadDevelopmentPage(win) {
  const developmentUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
  let lastError;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await win.loadURL(developmentUrl);
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }
  throw lastError;
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    }
  });

  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  if (app.isPackaged) {
    await win.loadFile(path.join(__dirname, 'dist/index.html'));
  } else {
    await loadDevelopmentPage(win);
  }
}

app.whenReady().then(createWindow).catch((error) => {
  console.error('Impossible de démarrer la fenêtre Electron :', error);
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow().catch((error) => console.error('Impossible de rouvrir la fenêtre :', error));
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
