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
            return { type: 'dir', content: items.join(', ') };
        }
        const content = await fs.readFile(targetPath, 'utf8');
        return { type: 'file', content, filePath: targetPath };
    } catch (err) {
        return { type: 'file', content: 'File not found', filePath: '' };
    }
});

ipcMain.handle('upload-file', async (e, filePath) => {
    try {
        await win.webContents.debugger.attach('1.3');
        const doc = await win.webContents.debugger.sendCommand('DOM.getDocument');
        const { nodeId } = await win.webContents.debugger.sendCommand('DOM.querySelector', {
            nodeId: doc.root.nodeId,
            selector: 'input[type="file"]'
        });
        if (!nodeId || nodeId === 0) {
            win.webContents.debugger.detach();
            return { success: false, error: 'No file input found' };
        }
        await win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { files: [filePath], nodeId });
        await win.webContents.executeJavaScript(`
            document.querySelector('input[type="file"]').dispatchEvent(new Event('change', { bubbles: true }));
        `);
        win.webContents.debugger.detach();
        return { success: true };
    } catch (err) {
        try { win.webContents.debugger.detach(); } catch (_) {}
        return { success: false, error: err.message };
    }
});
