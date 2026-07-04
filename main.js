const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs').promises;

const WORKSPACE = path.join(__dirname, 'workspace');
async function init() {
    try { await fs.mkdir(WORKSPACE, { recursive: true }); } catch (e) {}
}
init();

let win;
app.whenReady().then(() => {
    win = new BrowserWindow({ 
        webPreferences: { preload: path.join(__dirname, 'preload.js') } 
    });
    win.loadURL('https://gemini.google.com/');
    globalShortcut.register('CommandOrControl+Shift+\\', () => win.webContents.send('toggle-command-mode'));
    globalShortcut.register('CommandOrControl+Shift+A', () => win.webContents.send('toggle-auto-send'));
});

ipcMain.on('get-base-dir', (e) => { e.returnValue = WORKSPACE; });

ipcMain.handle('write-file', async (e, filePath, content) => {
    try {
        const targetPath = path.isAbsolute(filePath) ? filePath : path.join(WORKSPACE, path.basename(filePath));
        await fs.writeFile(targetPath, content, 'utf8');
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('read-file', async (e, fileName) => {
    try {
        const targetPath = path.isAbsolute(fileName) ? fileName : path.join(WORKSPACE, path.basename(fileName));
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
            const items = await fs.readdir(targetPath);
            return items.join(', ');
        }
        return await fs.readFile(targetPath, 'utf8');
    } catch (err) {
        return "File not found";
    }
});