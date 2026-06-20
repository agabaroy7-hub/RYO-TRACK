import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { WorkTrackService } from './services/worktrack-service';

let mainWindow: BrowserWindow | null = null;
let service: WorkTrackService;

async function createWindow() {
  service = new WorkTrackService(app.getPath('userData'));
  await service.init();

  const iconPath = app.isPackaged
    ? path.join(app.getAppPath(), 'dist/renderer/taskflow-icon.ico')
    : path.join(process.cwd(), 'public', 'taskflow-icon.ico');

  mainWindow = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1180,
    minHeight: 800,
    backgroundColor: '#050816',
    icon: iconPath,
    title: 'RYO TRACK',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  const devUrl = process.env.VITE_DEV_SERVER_URL ?? (!app.isPackaged ? 'http://localhost:5173' : undefined);
  if (devUrl) {
    await mainWindow.loadURL(devUrl);
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), 'dist/renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('worktrack:get-dashboard', async () => service.getDashboard());
ipcMain.handle('worktrack:log-work', async (_event, input) => service.logWork(input));
ipcMain.handle('worktrack:update-goals', async (_event, input) => service.updateGoals(input));
ipcMain.handle('worktrack:create-goal-template', async (_event, input) => service.createGoalTemplate(input));
ipcMain.handle('worktrack:apply-goal-template', async (_event, templateId) => service.applyGoalTemplate(templateId));
ipcMain.handle('worktrack:delete-goal-template', async (_event, templateId) => service.deleteGoalTemplate(templateId));
ipcMain.handle('worktrack:reset-day', async () => service.resetDay());
ipcMain.handle('worktrack:reset-everything', async () => service.resetEverything());