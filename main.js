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
        const targetPath = fileName === '.'
            ? __dirname
            : path.isAbsolute(fileName)
                ? fileName
                : path.join(WORKSPACE, path.basename(fileName));
        const stat = await fs.stat(targetPath);
        if (stat.isDirectory()) {
            const items = await fs.readdir(targetPath);
            const fullPaths = items.map(i => path.join(targetPath, i));
            return { type: 'dir', content: fullPaths.join(', ') };
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

let uploadApi = null;
ipcMain.handle('capture-upload-api', async () => {
    try {
        await win.webContents.debugger.attach();
        await win.webContents.debugger.sendCommand('Network.enable');
        uploadApi = await new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(null), 30000);
            const handler = async (e, params) => {
                const req = params.request;
                if (req.method === 'POST' && (req.url.includes('upload') || req.url.includes('/files') || req.url.includes('/_/BardChatUi'))) {
                    clearTimeout(timeout);
                    win.webContents.debugger.off('Network.requestWillBeSent', handler);
                    let body = null;
                    try {
                        const pd = await win.webContents.debugger.sendCommand('Network.getRequestPostData', { requestId: params.requestId });
                        body = pd.postData ? pd.postData.slice(0, 2000) : null;
                    } catch (_) {}
                    win.webContents.debugger.detach();
                    resolve({ url: req.url, headers: req.headers, method: req.method, bodySample: body });
                }
            };
            win.webContents.debugger.on('Network.requestWillBeSent', handler);
        });
        return { success: true, api: uploadApi };
    } catch (err) {
        try { win.webContents.debugger.detach(); } catch (_) {}
        return { success: false, error: err.message };
    }
});
const { execSync } = require('child_process');
function writeFileToClipboard(filePath) {
    try {
        const absPath = path.resolve(filePath);
        const scriptPath = path.join(app.getPath('temp'), 'ga_clipboard.ps1');
        const script = `
Add-Type -AssemblyName System.Windows.Forms
$files = New-Object Collections.Specialized.StringCollection
$files.Add('${absPath.replace(/'/g, "''")}')
[System.Windows.Forms.Clipboard]::SetFileDropList($files)
`;
        require('fs').writeFileSync(scriptPath, script, 'utf8');
        execSync(`powershell -NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"`, { timeout: 10000, shell: true });
        try { require('fs').unlinkSync(scriptPath); } catch (_) {}
        return true;
    } catch (_) { return false; }
}

ipcMain.handle('upload-file', async (e, filePath) => {
    const maxRetries = 3;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            // Step 1: Write file to OS clipboard as native file drop (CF_HDROP)
            if (!writeFileToClipboard(filePath)) {
                if (attempt < maxRetries - 1) { await new Promise(r => setTimeout(r, 500)); continue; }
                return { success: false, method: 'clipboard-write-failed' };
            }

            // Step 2: Focus chat input (best-effort, may fail if DOM is transitioning)
            await new Promise(r => setTimeout(r, 100));
            try {
                await win.webContents.executeJavaScript(`document.querySelector('[contenteditable]')?.focus()`);
            } catch (_) {}

            // Step 3: Dispatch trusted paste
            await new Promise(r => setTimeout(r, 200));
            win.webContents.paste();

            // Step 4: Give page time to process
            await new Promise(r => setTimeout(r, 800));

            return { success: true, method: 'clipboard-file-drop+paste' };
        } catch (err) {
            if (attempt < maxRetries - 1) {
                await new Promise(r => setTimeout(r, 1000));
                continue;
            }
            return { success: false, error: err.message, attempt };
        }
    }
});
