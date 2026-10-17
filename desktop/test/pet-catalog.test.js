import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPetCatalog, localMediaFile } from '../src/pet-catalog.js';
const png = Buffer.from([137,80,78,71,13,10,26,10]);
test('catalog reuses five builtins and imports local characters/animation mappings across restart', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-catalog-'));
  try {
    const dir = path.join(root, 'catalog'), source = path.join(root, 'source'); fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'idle.png'), png); fs.writeFileSync(path.join(source, 'walk.gif'), 'GIF89a'); fs.writeFileSync(path.join(source, 'play.webm'), Buffer.from([26,69,223,163]));
    const file = path.join(source, 'pet.json'); fs.writeFileSync(file, JSON.stringify({ id: 'chiikawa', name: '치이카와', profile: 'shy', animations: { idle: 'idle.png', walk: 'walk.gif', play: 'play.webm' } }));
    let catalog = createPetCatalog({ directory: dir, agentHome: root });
    assert.equal(catalog.list().filter((c) => c.builtin).length, 5); assert.equal(catalog.get('chiikawa').missing, true);
    catalog.import(file); let c = catalog.get('chiikawa');
    assert.equal(c.profileName, 'shy'); assert.equal(c.missing, false); assert.equal(c.animations.play.kind, 'video');
    assert.ok(fs.existsSync(catalog.resolve(c.animations.idle.src)));
    fs.rmSync(source, { recursive: true });
    catalog = createPetCatalog({ directory: dir, agentHome: root }); c = catalog.get('chiikawa'); assert.ok(c.animations.walk); assert.equal(c.animations.sleep, undefined, 'renderer falls back to idle');
    assert.equal(catalog.resolve('pet-asset://local/../../secret'), undefined);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test('media import rejects external paths, fake formats and symlink escapes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pet-local-'));
  try {
    const dir = path.join(root, 'images'); fs.mkdirSync(dir); fs.writeFileSync(path.join(root, 'outside.png'), png); fs.writeFileSync(path.join(dir, 'fake.png'), 'not an image');
    for (const name of ['../outside.png', 'https://example.com/a.png', '\\\\server\\image.png', 'fake.png']) assert.throws(() => localMediaFile(dir, name));
    if (process.platform !== 'win32') { fs.symlinkSync(path.join(root, 'outside.png'), path.join(dir, 'link.png')); assert.throws(() => localMediaFile(dir, 'link.png')); }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
