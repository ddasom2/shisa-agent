import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginBehavior, chooseAction, stepWorld, INTERACTIONS } from '../src/pet-behavior.js';
import { cleanProfile, ACTIONS } from '../src/pet-profiles.js';
import { restorePets } from '../src/pet-store.js';
const areas = [{ id: 1, x: -1600, y: -200, width: 1600, height: 900 }, { id: 2, x: 0, y: 0, width: 1280, height: 720 }];
function pet(id, x = -1000, extra = {}) {
  return beginBehavior({ id, character: 'hachi', x, y: 100, vx: 32, vy: 8, size: 128, speed: 1, frequency: 1, displayId: 1, profile: cleanProfile(null, 'friendly'), ...extra }, () => .5);
}
test('all autonomous actions can be selected from data and time out', () => {
  for (const action of ACTIONS.filter((a) => a !== 'interact')) {
    const profile = cleanProfile({ weights: Object.fromEntries(['idle', 'walk', 'run', 'sleep', 'play'].map((a) => [a, a === action ? 1 : 0])), duration: [1, 1] });
    assert.equal(chooseAction(profile, () => .5), action);
    const [next] = stepWorld([{ ...pet('a'), profile, remaining: 0 }], areas, .1, { random: () => .5 });
    assert.equal(next.action, action); assert.equal(next.remaining, 1);
  }
  assert.equal(chooseAction(cleanProfile({ weights: { idle: 0, walk: 0, run: 0, sleep: 0, play: 0 } })), 'idle');
});
test('bounded motion with per-instance size, monitor removal, sleep and drag hold', () => {
  let world = [pet('a', -1500, { size: 256 }), pet('b', -900)];
  for (let i = 0; i < 20000; i++) {
    world = stepWorld(world, areas, .033, { random: () => .7 });
    for (const p of world) {
      assert.ok(p.x >= -1600 && p.x + p.size <= 0); assert.ok(p.y >= -200 && p.y + p.size <= 700);
      assert.ok(Number.isFinite(p.x));
    }
  }
  const held = { ...pet('held'), held: true, action: 'run' };
  assert.deepEqual(stepWorld([held], areas, 50)[0], held);
  const [migrated] = stepWorld([pet('lost')], [areas[1]], .1);
  assert.ok(migrated.x >= 0 && migrated.x + migrated.size <= 1280);
  const moving = { ...pet('runner'), action: 'run', remaining: 10 };
  assert.deepEqual(stepWorld([moving], areas, 3600), stepWorld([moving], areas, .1));
});
test('pairs synchronize every interaction and release on timeout with cooldown', () => {
  for (const kind of INTERACTIONS) {
    const a = { ...pet('a'), action: 'interact', pair: 'a:b', partner: 'b', interaction: kind, remaining: 1 };
    const b = { ...pet('b', -880), action: 'interact', pair: 'a:b', partner: 'a', interaction: kind, remaining: 1 };
    let result = stepWorld([a, b], areas, .1, { random: () => 0 });
    assert.equal(result[0].pair, result[1].pair); assert.equal(result[0].remaining, result[1].remaining);
    for (let i = 0; i < 15; i++) result = stepWorld(result, areas, .1, { random: () => 0 });
    for (const p of result) { assert.equal(p.pair, null); assert.ok(p.cooldown > 8); }
  }
});
test('proximity triggers probabilistic interaction; drag, removal and disable cancel both', () => {
  const input = [pet('a'), pet('b', -900)].map((p) => ({ ...p, cooldown: 0 }));
  const paired = stepWorld(input, areas, .1, { random: () => 0 });
  assert.equal(paired[0].action, 'interact'); assert.equal(paired[0].pair, paired[1].pair);
  assert.equal(input[0].pair, null, 'inputs are immutable');
  const noChance = stepWorld(input, areas, .1, { random: () => .999 }); assert.equal(noChance[0].pair, null);
  for (const result of [stepWorld(paired, areas, .1, { interactions: false }), stepWorld([{ ...paired[0], held: true }, paired[1]], areas, .1), stepWorld([paired[0]], areas, .1)]) {
    assert.ok(result.every((p) => p.pair === null));
  }
});
test('overlap resolves gently without moving held pets, separation stays bounded', () => {
  const a = pet('a'), b = pet('b');
  const [one, two] = stepWorld([{ ...a, held: true }, b], areas, .1, { interactions: false });
  assert.equal(one.x, a.x); assert.ok(two.x > b.x);
  assert.ok(two.x - b.x <= 4);
});
test('old rosters and v2 layouts restore without losing duplicate instances or options', () => {
  let id = 0;
  const old = restorePets(['hachi', 'hachi', 'usagi', 'invalid'], ['hachi', 'usagi'], () => `id-${++id}`);
  assert.equal(old.instances.length, 3); assert.equal(new Set(old.instances.map((p) => p.id)).size, 3);
  const stored = { version: 2, paused: true, interactions: false, alwaysOnTop: false, instances: [
    { id: 'saved', character: 'hachi', x: -1400, y: -100, size: 160, speed: 2, frequency: .5, displayId: 1, profileName: 'playful' },
  ] };
  assert.deepEqual(restorePets(stored, ['hachi']), stored);
  assert.equal(restorePets({ instances: [{ character: 'hachi', size: Infinity, x: NaN, y: 0 }] }, ['hachi']).instances[0].size, 128);
  assert.deepEqual(restorePets([], ['hachi']).instances, []);
});
