import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { characterAssets, CHARACTERS } from './character.js';
import { ACTIONS, PROFILES, DEFAULT_PROFILES, cleanProfile } from './pet-profiles.js';
const ID = /^[a-z][a-z0-9-]{0,63}$/;
const EXT = new Set(['.png', '.gif', '.webm', '.jpg', '.jpeg', '.webp', '.mp4']);
export function localMediaFile(root, relative) {
  if (typeof relative !== 'string' || path.isAbsolute(relative) || /^[\\/]|^[a-z]:/i.test(relative) || relative.includes('://')) throw new Error('이미지는 manifest 폴더 안의 상대 경로여야 합니다.');
  const base = fs.realpathSync(root), file = path.resolve(base, relative), real = fs.realpathSync(file);
  if (!real.startsWith(base + path.sep) || real !== file || fs.lstatSync(file).isSymbolicLink() || !fs.statSync(file).isFile() || !EXT.has(path.extname(file).toLowerCase())) throw new Error('PNG, GIF, WebM 로컬 파일만 지원합니다.');
  const size = fs.statSync(file).size;
  if (size > 64 * 1024 * 1024 || size < 4) throw new Error('파일은 64MB 이하로 준비하세요.');
  const fd = fs.openSync(file, 'r'), header = Buffer.alloc(16);
  try { fs.readSync(fd, header, 0, 16, 0); } finally { fs.closeSync(fd); }
  const ext = path.extname(file).toLowerCase();
  const valid = ext === '.png' ? header.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : ext === '.gif' ?  /^GIF8[79]a/.test(header.toString()) : ['.jpg', '.jpeg'].includes(ext) ? header.subarray(0, 3).equals(Buffer.from([255,216,255])) : ext === '.webp' ? header.toString('ascii', 0, 4) === 'RIFF' && header.toString('ascii', 8, 12) === 'WEBP' : ext === '.mp4' ? header.toString('ascii', 4, 8) === 'ftyp' : header.subarray(0, 4).equals(Buffer.from([26,69,223,163]));
  if (!valid) throw new Error('파일 형식과 확장자가 일치하지 않습니다.');
  return file;
}
export function createPetCatalog({ directory, agentHome }) {
  fs.mkdirSync(directory, { recursive: true });
  const entries = new Map(), resources = new Map();
  for (const [id, character] of Object.entries(CHARACTERS)) {
    if (character.custom) continue;
    const assets = characterAssets(id), play = assets.clips?.dance;
    entries.set(id, { id, name: character.name, builtin: true, missing: false,
      profile: cleanProfile(null, DEFAULT_PROFILES[id]), profileName: DEFAULT_PROFILES[id] ?? 'calm',
      animations: { idle: { src: assets.open, fallback: assets.stills, closed: assets.closed },
        ...(play ? { play: { src: play.src, fallback: [play.poster, assets.open].filter(Boolean) } } : {}) } });
  }
  for (const [id, name] of [['chiikawa', '치이카와'], ['kurimanju', '쿠리만쥬']]) entries.set(id, {
    id, name, missing: true, profile: cleanProfile(null, DEFAULT_PROFILES[id]), profileName: DEFAULT_PROFILES[id], animations: {},
  });
  function register(raw, root, imported = true) {
    if (!ID.test(raw?.id) || typeof raw.name !== 'string' || !raw.name.trim() || raw.name.length > 80) throw new Error('캐릭터 id 또는 이름을 확인하세요.');
    const profileName = Object.hasOwn(PROFILES, raw.profile) ? raw.profile : DEFAULT_PROFILES[raw.id] ?? 'calm';
    const animations = {};
    for (const [url] of resources) if (url.startsWith(`pet-asset://local/${raw.id}/`)) resources.delete(url);
    for (const state of ACTIONS) {
      if (!raw.animations?.[state]) continue;
      const file = localMediaFile(root, raw.animations[state]);
      const src = `pet-asset://local/${raw.id}/${state}?v=${fs.statSync(file).mtimeMs}`;
      resources.set(src, file); animations[state] = { src, kind: ['.webm', '.mp4'].includes(path.extname(file).toLowerCase()) ? 'video' : 'image' };
    }
    if (!animations.idle) throw new Error('idle 애니메이션은 반드시 지정하세요.');
    entries.set(raw.id, { id: raw.id, name: raw.name.trim(), imported, missing: false, profileName,
      profile: cleanProfile(typeof raw.profile === 'object' ? raw.profile : null, profileName), animations });
  }
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!item.isDirectory() || !ID.test(item.name)) continue;
    try { const root = path.join(directory, item.name); register(JSON.parse(fs.readFileSync(path.join(root, 'pet.json'), 'utf8')), root); } catch { /* unusable user resources do not prevent launch */ }
  }
  // Reuse original Shisa Agent custom characters without requiring its daemon.
  const original = path.join(agentHome, 'characters');
  if (fs.existsSync(original)) for (const item of fs.readdirSync(original, { withFileTypes: true })) {
    if (!item.isDirectory() || !/^u-[a-z0-9]{4,32}$/.test(item.name) || entries.has(item.name)) continue;
    try {
      const root = path.join(original, item.name), c = JSON.parse(fs.readFileSync(path.join(root, 'character.json'), 'utf8'));
      entries.set(item.name, { id: item.name, name: c.name || item.name, missing: true, profile: cleanProfile(), profileName: 'calm', animations: {} });
      const mapping = { idle: 'eyes_open', sleep: 'eyes_closed', play: 'dance', interact: 'cheer' };
      register({ id: item.name, name: c.name, animations: Object.fromEntries(Object.entries(mapping).filter(([, slot]) => EXT.has(path.extname(c.media?.[slot] ?? '').toLowerCase())).map(([state, slot]) => [state, c.media[slot]])) }, root, false);
    } catch { /* unsupported media do not break other characters */ }
  }
  return {
    list: () => [...entries.values()], get: (id) => entries.get(id), resolve: (url) => resources.get(url),
    import(manifestFile) {
      if (fs.statSync(manifestFile).size > 65536) throw new Error('manifest는 64KB 이하로 준비하세요.');
      const raw = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
      if (!ID.test(raw?.id) || typeof raw.name !== 'string' || raw.name.length > 80 || !raw.name.trim()) throw new Error('캐릭터 id 또는 이름을 확인하세요.');
      const source = path.dirname(manifestFile), animations = {}, files = [];
      for (const state of ACTIONS) if (raw.animations?.[state]) {
        const file = localMediaFile(source, raw.animations[state]);
        const filename = `${state}-${randomUUID()}${path.extname(file).toLowerCase()}`;
        animations[state] = filename; files.push([file, filename]);
      }
      if (!animations.idle) throw new Error('idle 애니메이션은 반드시 지정하세요.');
      const root = path.join(directory, raw.id);
      fs.mkdirSync(root, { recursive: true });
      if (fs.lstatSync(root).isSymbolicLink() || fs.realpathSync(root) !== path.join(fs.realpathSync(directory), raw.id)) throw new Error('캐릭터 저장 폴더가 올바르지 않습니다.');
      for (const [file, filename] of files) fs.copyFileSync(file, path.join(root, filename));
      const stored = { id: raw.id, name: raw.name, profile: raw.profile, animations };
      fs.writeFileSync(path.join(root, 'pet.json.tmp'), JSON.stringify(stored, null, 2));
      fs.renameSync(path.join(root, 'pet.json.tmp'), path.join(root, 'pet.json'));
      register(stored, root);
      return entries.get(raw.id);
    },
  };
}
