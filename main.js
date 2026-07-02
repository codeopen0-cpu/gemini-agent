const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
app.whenReady().then(() => {
  win = new BrowserWindow({ webPreferences: { preload: path.join(__dirname, 'preload.js') } });
  win.loadURL('https://gemini.google.com/');
  
  globalShortcut.register('CommandOrControl+Shift+\\', () => {
    win.webContents.send('toggle-command-mode');
  });
});

ipcMain.on('get-base-dir', (e) => { e.returnValue = __dirname; });
ipcMain.handle('write-file', (e, path, content) => { fs.writeFileSync(path, content); return "Success"; });
ipcMain.handle('read-file', (e, path) => {
  const stat = fs.statSync(path);
  if (stat.isDirectory()) {
    const items = fs.readdirSync(path).map(name => {
      const full = path + '\\' + name;
      const isDir = fs.statSync(full).isDirectory();
      return isDir ? full + '\\' : full;
    });
    return items.join(', ') || '(empty)';
  }
  return fs.readFileSync(path, 'utf8');
});