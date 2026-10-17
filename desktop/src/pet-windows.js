import path from 'node:path';
import { PET_SIZE, MAX_PETS, PET_IDS, newPet, stepPet, clampPet } from './pet-motion.js';
import { characterName } from './character.js';

// Local companion windows do not share the assistant's IPC or daemon state.
export function createPetManager({ BrowserWindow, Menu, screen, appDir, saved = [], persist = () => {}, changed = () => {} }) {
  const pets = new Map();
  let nextId = 0, paused = false, last = performance.now(), disposing = false;
  const save = () => persist([...pets.values()].map((p) => p.motion.character));
  function remove(id) { pets.get(id)?.window.close(); }
  function spawn(character) {
    if (!PET_IDS.includes(character) || pets.size >= MAX_PETS) return false;
    const id = ++nextId, motion = newPet(character, screen.getPrimaryDisplay().workArea);
    const window = new BrowserWindow({
      width: PET_SIZE, height: PET_SIZE, x: Math.round(motion.x), y: Math.round(motion.y),
      transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, focusable: false, show: false,
      webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });
    const pet = { window, motion, hovering: false, menu: false };
    pets.set(id, pet);
    window.setAlwaysOnTop(true, 'floating');
    window.setIgnoreMouseEvents(true, { forward: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (e) => e.preventDefault());
    window.webContents.on('context-menu', () => {
      pet.menu = true;
      Menu.buildFromTemplate([
        { label: characterName(character), enabled: false },
        { label: paused ? '모두 움직이기' : '모두 쉬기', click: togglePause },
        { label: '이 친구 돌려보내기', click: () => remove(id) },
      ]).popup({ window, callback: () => { pet.menu = false; } });
    });
    window.once('ready-to-show', () => window.showInactive());
    window.on('closed', () => { pets.delete(id); if (!disposing) { save(); changed(); } });
    window.webContents.on('render-process-gone', () => window.close());
    window.loadFile(path.join(appDir, 'renderer', 'pet.html'), { query: { character } })
      .catch((error) => { console.error('[pet]', error.message); if (!window.isDestroyed()) window.close(); });
    save(); changed();
    return true;
  }
  function tick() {
    const now = performance.now(), dt = (now - last) / 1000; last = now;
    const cursor = screen.getCursorScreenPoint();
    for (const p of pets.values()) {
      const b = p.window.getBounds();
      const hover = cursor.x >= b.x + 12 && cursor.x < b.x + PET_SIZE - 12 && cursor.y >= b.y + 12 && cursor.y < b.y + PET_SIZE - 12;
      if (hover !== p.hovering) { p.hovering = hover; p.window.setIgnoreMouseEvents(!hover, { forward: true }); }
      const area = screen.getDisplayMatching(b).workArea;
      p.motion = paused || hover || p.menu ? clampPet(p.motion, area) : stepPet(p.motion, area, dt);
      const x = Math.round(p.motion.x), y = Math.round(p.motion.y);
      if (x !== b.x || y !== b.y) p.window.setPosition(x, y, false);
    }
  }
  function clear() { for (const id of [...pets.keys()]) remove(id); }
  function togglePause() { paused = !paused; changed(); }
  function menu() {
    return { label: `데스크톱 펫 (${pets.size}/${MAX_PETS})`, submenu: [
      ...PET_IDS.map((id) => ({ label: `${characterName(id)} 소환`, enabled: pets.size < MAX_PETS, click: () => spawn(id) })),
      { label: '친구들 함께 소환', enabled: pets.size <= MAX_PETS - PET_IDS.length, click: () => { for (const id of PET_IDS) spawn(id); } },
      { type: 'separator' },
      { label: paused ? '모두 움직이기' : '모두 쉬기', enabled: pets.size > 0, click: togglePause },
      { label: '모두 돌려보내기', enabled: pets.size > 0, click: clear },
    ] };
  }
  for (const id of Array.isArray(saved) ? saved.slice(0, MAX_PETS) : []) spawn(id);
  const timer = setInterval(tick, 1000 / 30);
  return { spawn, menu, dispose() { disposing = true; clearInterval(timer); clear(); } };
}
