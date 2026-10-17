import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PET_SIZE, MAX_PETS, PET_IDS, newPet, clampPet } from './pet-motion.js';
import { characterName, characterAssets } from './character.js';
import { beginBehavior, stepWorld } from './pet-behavior.js';
import { restorePets, instanceSettings } from './pet-store.js';
import { cleanProfile, PROFILES } from './pet-profiles.js';

// Existing spawn/menu API is retained; v1 string rosters migrate into versioned layouts.
export function createPetManager({ BrowserWindow, Menu, screen, ipcMain, appDir, catalog,
  saved = [], persist = () => {}, changed = () => {}, openSettings = () => {},
  clock = { now: () => performance.now(), setInterval, clearInterval }, random = Math.random }) {
  const pets = new Map();
  const list = () => catalog?.list() ?? PET_IDS.map((id) => ({ id, name: characterName(id), profile: cleanProfile(), animations: { idle: { src: characterAssets(id).open } } }));
  const getCharacter = (id) => list().find((c) => c.id === id);
  const initial = restorePets(saved, list().map((c) => c.id));
  let paused = initial.paused, interactions = initial.interactions, alwaysOnTop = initial.alwaysOnTop;
  let last = clock.now(), disposing = false, booting = true, revision = 0, dirty = false, lastSave = last;
  const displays = () => (screen.getAllDisplays?.() ?? [screen.getPrimaryDisplay()]).map((d, i) => ({ ...d.workArea, id: d.id ?? i }));
  const snapshot = () => ({ version: 2, paused, interactions, alwaysOnTop,
    instances: [...pets.values()].map(({ motion: m }) => ({ id: m.id, character: m.character, x: m.x, y: m.y,
      size: m.size, speed: m.speed, frequency: m.frequency, displayId: m.displayId, profileName: m.profileName })) });
  const save = () => { if (!booting && !disposing) { persist(snapshot()); dirty = false; lastSave = clock.now(); } };
  function notify() { changed(); }
  function view(p) {
    const c = getCharacter(p.motion.character);
    return { character: c.id, name: c.name, animations: c.animations, action: paused ? 'idle' : p.motion.action,
      facing: p.motion.facing, interaction: p.motion.interaction, paused, dragging: !!p.drag };
  }
  function sendView(p, force = false) {
    const m = p.motion, signature = `${m.action}|${m.facing}|${m.interaction}|${paused}|${!!p.drag}|${revision}`;
    if (p.loaded && (force || signature !== p.signature)) { p.window.webContents.send?.('pet-view', view(p)); p.signature = signature; }
  }
  function remove(id) { pets.get(id)?.window.close(); }
  function spawn(character, options = {}) {
    const c = getCharacter(character);
    if (!c || pets.size >= MAX_PETS) return false;
    const areas = displays(), area = areas.find((a) => a.id === options.displayId) ?? areas[0];
    // Keep original random spawning, now with per-instance dimensions and profiles.
    const base = PET_IDS.includes(character) ? newPet(character, area, random) : { ...newPet('shisa', area, random), character };
    const profileName = Object.hasOwn(PROFILES, options.profileName) ? options.profileName : c.profileName;
    const motion = beginBehavior(clampPet({ ...base, ...instanceSettings(options),
      id: options.id ?? randomUUID(), character, displayId: area.id, profileName,
      profile: options.profileName && profileName !== c.profileName ? cleanProfile(null, profileName) : c.profile,
      ...(Number.isFinite(options.x) && Number.isFinite(options.y) ? { x: options.x, y: options.y } : {}) }, area), random);
    const id = motion.id;
    if (pets.has(id)) return false;
    const window = new BrowserWindow({
      width: motion.size, height: motion.size, x: Math.round(motion.x), y: Math.round(motion.y),
      transparent: true, backgroundColor: '#00000000', frame: false, hasShadow: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      skipTaskbar: true, focusable: false, show: false,
      webPreferences: { preload: path.join(appDir, 'preload-pet.cjs'), sandbox: true, contextIsolation: true, nodeIntegration: false, spellcheck: false, backgroundThrottling: false },
    });
    const pet = { window, motion, hovering: false, menu: false, loaded: false, drag: null };
    pets.set(id, pet);
    window.setAlwaysOnTop(alwaysOnTop, 'floating');
    window.setIgnoreMouseEvents(true, { forward: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (e) => e.preventDefault());
    window.webContents.on('did-finish-load', () => { pet.loaded = true; sendView(pet, true); });
    window.webContents.on('context-menu', () => {
      pet.menu = true;
      Menu.buildFromTemplate([
        { label: c.name, enabled: false },
        { label: '이 친구 설정…', click: () => openSettings(id) },
        { label: paused ? '모두 움직이기' : '모두 쉬기', click: togglePause },
        { label: '이 친구 돌려보내기', click: () => remove(id) },
      ]).popup({ window, callback: () => { pet.menu = false; } });
    });
    window.once('ready-to-show', () => window.showInactive());
    window.on('closed', () => { pets.delete(id); if (!disposing) { save(); notify(); } });
    window.webContents.on('render-process-gone', () => { if (!window.isDestroyed()) window.close(); });
    window.loadFile(path.join(appDir, 'renderer', 'pet.html'), { query: { character } })
      .catch((error) => { console.error('[pet]', error.message); if (!window.isDestroyed()) window.close(); });
    save(); notify();
    return true;
  }
  function tick() {
    const now = clock.now();
    const moving = [...pets.values()].some((p) => p.drag || (!paused && (['walk', 'run'].includes(p.motion.action) || ['follow', 'play'].includes(p.motion.interaction))));
    if (!moving && now - last < 100) return; // idle/paused pets poll at 10 Hz
    const dt = (now - last) / 1000; last = now;
    const cursor = screen.getCursorScreenPoint(), areas = displays();
    for (const p of pets.values()) {
      const b = p.window.getBounds();
      if (p.drag) {
        const target = screen.getDisplayNearestPoint?.(cursor);
        const area = areas.find((a) => a.id === target?.id) ?? areas[0];
        Object.assign(p.motion, clampPet({ ...p.motion, x: cursor.x - p.drag.x, y: cursor.y - p.drag.y, displayId: area.id }, area));
      }
      const margin = p.motion.size * 0.08;
      const hover = !!p.drag || (cursor.x >= b.x + margin && cursor.x < b.x + b.width - margin && cursor.y >= b.y + margin && cursor.y < b.y + b.height - margin);
      if (hover !== p.hovering) { p.hovering = hover; p.window.setIgnoreMouseEvents(!hover, { forward: true }); }
      p.motion.held = hover || p.menu || !!p.drag;
      if (!areas.some((a) => a.id === p.motion.displayId)) p.motion.displayId = areas[0].id;
    }
    const world = stepWorld([...pets.values()].map((p) => p.motion), areas, dt, { random, paused, interactions });
    for (const m of world) {
      const p = pets.get(m.id), b = p.window.getBounds(); p.motion = m;
      const x = Math.round(m.x), y = Math.round(m.y);
      if (x !== b.x || y !== b.y) { p.window.setPosition(x, y, false); dirty = true; }
      sendView(p);
    }
    if (dirty && now - lastSave >= 5000) save();
  }
  const mine = (e) => [...pets.values()].find((p) => e.sender === p.window.webContents && e.senderFrame === p.window.webContents.mainFrame);
  const dragStart = (e) => {
    const p = mine(e); if (!p) return;
    const cursor = screen.getCursorScreenPoint(); p.drag = { x: cursor.x - p.motion.x, y: cursor.y - p.motion.y };
  };
  const dragEnd = (e) => { const p = mine(e); if (p) { p.drag = null; p.motion.remaining = Math.max(p.motion.remaining, 1); save(); } };
  ipcMain?.handle('pet-view-get', (e) => { const p = mine(e); return p ? view(p) : null; });
  ipcMain?.on('pet-drag-start', dragStart); ipcMain?.on('pet-drag-end', dragEnd);
  function clear() { for (const id of [...pets.keys()]) remove(id); }
  function togglePause() { paused = !paused; save(); for (const p of pets.values()) sendView(p); notify(); }
  function settings() { return { ...snapshot(), catalog: list(), profiles: Object.keys(PROFILES), displays: displays() }; }
  function update(id, patch) {
    const p = pets.get(id); if (!p || !patch || typeof patch !== 'object') return false;
    Object.assign(p.motion, instanceSettings({ ...p.motion, ...patch }));
    if (Object.hasOwn(PROFILES, patch.profileName)) { p.motion.profileName = patch.profileName; const c = getCharacter(p.motion.character); p.motion.profile = patch.profileName === c.profileName ? c.profile : cleanProfile(null, patch.profileName); }
    if (displays().some((a) => a.id === patch.displayId)) {
      const area = displays().find((a) => a.id === patch.displayId);
      if (p.motion.displayId !== area.id) { p.motion.x = area.x + 40; p.motion.y = area.y + 40; }
      p.motion.displayId = area.id;
    }
    const area = displays().find((a) => a.id === p.motion.displayId) ?? displays()[0];
    Object.assign(p.motion, clampPet(p.motion, area));
    p.window.setBounds?.({ x: Math.round(p.motion.x), y: Math.round(p.motion.y), width: p.motion.size, height: p.motion.size }, false);
    save(); notify(); return true;
  }
  function configure(patch) {
    if (typeof patch?.paused === 'boolean') paused = patch.paused;
    if (typeof patch?.interactions === 'boolean') interactions = patch.interactions;
    if (typeof patch?.alwaysOnTop === 'boolean') {
      alwaysOnTop = patch.alwaysOnTop;
      for (const p of pets.values()) p.window.setAlwaysOnTop(alwaysOnTop, 'floating');
    }
    save(); notify();
  }
  function menu() {
    return { label: `데스크톱 펫 (${pets.size}/${MAX_PETS})`, submenu: [
      { label: '친구 소환·설정…', click: () => openSettings() },
      ...list().map((c) => ({ label: `${c.name} 소환${c.missing ? ' (그림 없음)' : ''}`, enabled: pets.size < MAX_PETS, click: () => spawn(c.id) })),
      { label: '친구들 함께 소환', enabled: pets.size <= MAX_PETS - PET_IDS.length, click: () => { for (const id of PET_IDS) spawn(id); } },
      { type: 'separator' },
      { label: paused ? '모두 움직이기' : '모두 쉬기', enabled: pets.size > 0, click: togglePause },
      { label: '모두 돌려보내기', enabled: pets.size > 0, click: clear },
    ] };
  }
  for (const instance of initial.instances) spawn(instance.character, instance);
  booting = false;
  const timer = clock.setInterval(tick, 1000 / 30);
  // Removing/changing a monitor is handled by the next tick, including when paused.
  return { spawn, remove, menu, settings, update, configure, clear, refresh() { revision++; for (const p of pets.values()) { p.signature = null; sendView(p); } notify(); },
    dispose() {
      if (disposing) return;
      if (dirty) save(); disposing = true; clock.clearInterval(timer); clear();
      ipcMain?.removeHandler('pet-view-get'); ipcMain?.removeListener('pet-drag-start', dragStart); ipcMain?.removeListener('pet-drag-end', dragEnd);
    } };
}
