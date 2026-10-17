import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PET_SIZE, MAX_PETS, newPet, stepPet, clampPet } from '../src/pet-motion.js';
import { createPetManager } from '../src/pet-windows.js';
const area = { x: -1920, y: -200, width: 1920, height: 1080 };
test('independent motion, bounded in negative-origin work areas, without mutating peers', () => {
  const a = newPet('hachi', area, () => 0.2), b = newPet('usagi', area, () => 0.7);
  const original = structuredClone(b);
  let p = a;
  for (let i = 0; i < 10000; i++) {
    p = stepPet(p, area, 1 / 30, () => 0.6);
    assert.ok(p.x >= area.x && p.x <= area.x + area.width - PET_SIZE);
    assert.ok(p.y >= area.y && p.y <= area.y + area.height - PET_SIZE);
  }
  assert.deepEqual(b, original);
  assert.notDeepEqual(p, a);
  assert.notEqual(a.vx, b.vx);
});
test('bounce, rest, suspend cap, small screens and monitor removal', () => {
  const p = { ...newPet('hachi', area), x: area.x, y: area.y, vx: -40, vy: -30, turn: 5 };
  const bounced = stepPet(p, area, 0.1);
  assert.equal(bounced.vx, 40); assert.equal(bounced.vy, 30);
  const resting = stepPet({ ...p, rest: 1 }, area, 0.1);
  assert.equal(resting.x, p.x); assert.equal(resting.rest, 0.9);
  assert.deepEqual(stepPet(p, area, 3600), bounced);
  assert.deepEqual(clampPet({ x: -9000, y: 9000 }, { x: 0, y: 0, width: 60, height: 60 }), { x: 0, y: 0 });
  assert.throws(() => newPet('../bad', area));
});
function fixture(saved = []) {
  const windows = [], writes = [];
  class Window extends EventEmitter {
    constructor(options) {
      super(); this.options = options; this.bounds = { ...options }; this.webContents = new EventEmitter();
      this.webContents.setWindowOpenHandler = (handler) => { this.open = handler; };
      windows.push(this);
    }
    setAlwaysOnTop() {} setIgnoreMouseEvents() {} showInactive() {}
    loadFile(file, options) { this.file = file; this.query = options.query; return Promise.resolve(); }
    close() { this.emit('closed'); } isDestroyed() { return false; }
    getBounds() { return this.bounds; } setPosition(x, y) { Object.assign(this.bounds, { x, y }); }
  }
  const manager = createPetManager({ BrowserWindow: Window, Menu: { buildFromTemplate: () => ({ popup() {} }) },
    screen: { getPrimaryDisplay: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }), getCursorScreenPoint: () => ({ x: 9999, y: 9999 }) },
    appDir: '/app', saved, persist: (ids) => writes.push(ids) });
  return { manager, windows, writes };
}
test('multiple copies, roster restoration, limits, close and quit lifecycle', () => {
  const { manager, windows, writes } = fixture(['hachi', 'usagi', 'invalid', 'hachi']);
  try {
    assert.equal(windows.length, 3);
    assert.equal(windows[0].query.character, 'hachi');
    assert.equal(windows[1].query.character, 'usagi');
    assert.equal(windows[0].options.webPreferences.sandbox, true);
    assert.deepEqual(windows[0].open(), { action: 'deny' });
    windows[0].close();
    assert.deepEqual(writes.at(-1), ['usagi', 'hachi']);
    for (let i = 2; i < MAX_PETS; i++) assert.equal(manager.spawn('momonga'), true);
    assert.equal(manager.spawn('usagi'), false);
    assert.equal(manager.spawn('invalid'), false);
    const menu = manager.menu().submenu;
    assert.equal(menu[0].enabled, false);
    menu.find((item) => item.label === '모두 쉬기').click();
    assert.ok(manager.menu().submenu.some((item) => item.label === '모두 움직이기'));
    const count = writes.length;
    manager.dispose();
    assert.equal(writes.length, count, 'quitting must preserve the saved roster');
  } finally { manager.dispose(); }
});
test('corrupt saved roster is ignored', () => {
  const { manager, windows } = fixture({ character: 'usagi' });
  try { assert.equal(windows.length, 0); } finally { manager.dispose(); }
});
