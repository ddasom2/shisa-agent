import path from 'node:path';
export function setupPetSettings({ BrowserWindow, ipcMain, dialog, app, appDir, manager, catalog, networkUi }) {
  let window = null;
  const ours = (e) => window && !window.isDestroyed() && e.sender === window.webContents && e.senderFrame === window.webContents.mainFrame;
  ipcMain.handle('pet-settings-get', (e) => ours(e) ? manager.settings() : null);
  ipcMain.handle('pet-settings-command', async (e, command, data) => {
    if (!ours(e)) return { ok: false };
    try {
      switch (command) {
        case 'spawn': {
          if (!Array.isArray(data) || data.length > 50) throw new Error('소환할 친구를 선택하세요.');
          let total = 0;
          for (const item of data) {
            if (!catalog.get(item?.character) || !Number.isInteger(item.count) || item.count < 1 || item.count > 24) throw new Error('소환 개수를 확인하세요.');
            total += item.count;
          }
          if (manager.settings().instances.length + total > 24) throw new Error('최대 24마리까지 소환할 수 있습니다.');
          for (const item of data) for (let i = 0; i < item.count; i++) manager.spawn(item.character);
          break;
        }
        case 'remove': manager.remove(data); break;
        case 'update': if (!manager.update(data?.id, data?.patch)) throw new Error('친구 설정을 확인하세요.'); break;
        case 'configure': manager.configure(data); break;
        case 'import': {
          const pick = await dialog.showOpenDialog(window, { title: '로컬 캐릭터 manifest 선택', properties: ['openFile'], filters: [{ name: 'Pet manifest', extensions: ['json'] }] });
          if (pick.canceled) return { ok: true };
          catalog.import(pick.filePaths[0]); manager.refresh(); break;
        }
        case 'network': networkUi.show(); break;
        case 'quit': app.quit(); break;
        default: throw new Error('알 수 없는 명령입니다.');
      }
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  return {
    show(id) {
      if (window && !window.isDestroyed()) { window.show(); window.focus(); window.webContents.send('pet-settings-focus', id); return; }
      window = new BrowserWindow({ width: 720, height: 720, minWidth: 560, minHeight: 520, title: '데스크톱 친구들',
        webPreferences: { preload: path.join(appDir, 'preload-pet-settings.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (e) => e.preventDefault());
      window.on('closed', () => { window = null; });
      window.loadFile(path.join(appDir, 'renderer', 'pet-settings.html'), { query: { instance: id ?? '' } });
    },
    changed() { if (window && !window.isDestroyed()) window.webContents.send('pet-settings-changed'); },
  };
}
