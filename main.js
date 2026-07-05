const { app, BrowserWindow, ipcMain, globalShortcut, clipboard } = require('electron');
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
        const dir = path.dirname(targetPath);
        await fs.mkdir(dir, { recursive: true });
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

ipcMain.handle('paste-text', async (e, text) => {
    try {
        clipboard.writeText(text);
        await new Promise(r => setTimeout(r, 100));
        if (win && win.webContents) win.webContents.paste();
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});

ipcMain.handle('upload-file', async (e, filePath) => {
    const fileName = path.basename(filePath);
    try {
        const content = await fs.readFile(filePath, 'utf8');

        // Try CDP to set file input (works across shadow DOM)
        try {
            await win.webContents.debugger.attach();
            const doc = await win.webContents.debugger.sendCommand('DOM.getDocument', { depth: -1, pierce: true });
            const { nodeId } = await win.webContents.debugger.sendCommand('DOM.querySelector', {
                nodeId: doc.root.nodeId,
                selector: 'input[type="file"]'
            });
            if (nodeId && nodeId !== 0) {
                await win.webContents.debugger.sendCommand('DOM.setFileInputFiles', { files: [filePath], nodeId });
                await win.webContents.executeJavaScript(`
                    (function() {
                        const el = document.querySelector('input[type="file"]');
                        if (el) el.dispatchEvent(new Event('change', { bubbles: true }));
                    })()
                `);
                win.webContents.debugger.detach();
                return { success: true };
            }
            win.webContents.debugger.detach();
        } catch (_) {
            try { win.webContents.debugger.detach(); } catch (_2) {}
        }

        // Fallback: synthetic drop on chat input area
        const safeContent = JSON.stringify(content);
        const safeName = JSON.stringify(fileName);
        await win.webContents.executeJavaScript(`
            (async function() {
                function findDropTarget(root) {
                    if (!root) return null;
                    if (root.shadowRoot) {
                        for (const sel of ['rich-textarea', '[contenteditable]', '.ql-editor']) {
                            let el = root.shadowRoot.querySelector(sel);
                            if (el) return el;
                        }
                        for (const child of root.shadowRoot.children) {
                            const found = findDropTarget(child);
                            if (found) return found;
                        }
                    }
                    for (const child of root.children) {
                        const found = findDropTarget(child);
                        if (found) return found;
                    }
                    return null;
                }
                const target = findDropTarget(document.body) || document.body;
                const file = new File([${safeContent}], ${safeName}, { type: 'text/plain' });
                const dt = new DataTransfer();
                dt.items.add(file);
                target.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
            })()
        `);
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
});
