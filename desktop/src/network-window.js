import fs from 'node:fs';
import path from 'node:path';
import { modeConfig } from './network-mode.js';
import { intranetChat } from './intranet-chat.js';
export function readNetworkConfig(file, read = fs.readFileSync, defaultMode = 'normal') {
  try { return modeConfig(JSON.parse(read(file, 'utf8'))); }
  catch (error) {
    if (error.code === 'ENOENT') return modeConfig({ mode: defaultMode });
    // A corrupt policy must never silently enable Internet access.
    return modeConfig({ mode: 'offline' });
  }
}
export function setupNetworkWindow({ app, BrowserWindow, ipcMain, safeStorage, appDir, config, file }) {
  let window = null, busy = false;
  const keyFile = `${file}.key`;
  const ours = (e) => !!window && !window.isDestroyed() && e.sender === window.webContents && e.senderFrame === window.webContents.mainFrame;
  const publicConfig = () => ({ ...config, hasKey: fs.existsSync(keyFile) });
  ipcMain.handle('network-mode-get', (e) => ours(e) ? publicConfig() : null);
  ipcMain.handle('network-mode-save', (e, value) => {
    if (!ours(e)) return { ok: false };
    try {
      const next = modeConfig(value);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      if (typeof value.apiKey !== 'string' || value.apiKey.length > 4096 || /[\r\n]/.test(value.apiKey)) throw new Error('API 키 형식을 확인하세요.');
      if (value.apiKey) {
        if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('이 PC에서 키를 안전하게 저장할 수 없습니다.');
        fs.writeFileSync(keyFile, safeStorage.encryptString(value.apiKey), { mode: 0o600 });
      } else if (value.clearKey === true) fs.rmSync(keyFile, { force: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(next), { mode: 0o600 });
      fs.renameSync(`${file}.tmp`, file);
      app.relaunch({ args: process.argv.slice(1).filter((arg) => arg !== '--offline-pets') }); app.quit();
      return { ok: true };
    } catch (error) { return { ok: false, error: error.message }; }
  });
  ipcMain.handle('network-mode-chat', async (e, messages) => {
    if (!ours(e) || config.mode !== 'intranet') return { ok: false, error: '사내망 AI 모드를 선택하세요.' };
    if (busy) return { ok: false, error: '이전 답변을 기다려 주세요.' };
    busy = true;
    try {
      const key = fs.existsSync(keyFile) ? safeStorage.decryptString(fs.readFileSync(keyFile)) : '';
      return { ok: true, text: await intranetChat(config, key, messages) };
    } catch { return { ok: false, error: '사내망 AI 요청에 실패했습니다. 서버 주소·모델 이름·키·TLS 인증서를 확인하세요. 외부 모델로 전환하지 않습니다.' }; }
    finally { busy = false; }
  });
  return {
    show() {
      if (window && !window.isDestroyed()) { window.show(); window.focus(); return; }
      window = new BrowserWindow({ width: 640, height: 760, minWidth: 480, minHeight: 560,
        title: '네트워크 모드 · 사내망 AI', webPreferences: {
          preload: path.join(appDir, 'preload-network.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false,
        } });
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      window.webContents.on('will-navigate', (e) => e.preventDefault());
      window.on('closed', () => { window = null; });
      window.loadFile(path.join(appDir, 'renderer', 'network.html'));
    },
  };
}
