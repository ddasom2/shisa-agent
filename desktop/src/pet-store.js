import { randomUUID } from 'node:crypto';
export const STORE_VERSION = 2;
export const INSTANCE_LIMIT = 24;
export const numeric = (value, lo, hi, fallback) => typeof value === 'number' && Number.isFinite(value) ? Math.max(lo, Math.min(hi, value)) : fallback;
export function instanceSettings(value = {}) {
  return { size: Math.round(numeric(value.size, 64, 256, 128)), speed: numeric(value.speed, 0.25, 3, 1), frequency: numeric(value.frequency, 0.25, 3, 1) };
}
export function restorePets(saved, validIds, makeId = randomUUID) {
  const raw = Array.isArray(saved) ? { instances: saved.map((character) => ({ character })) } : saved ?? {};
  const used = new Set();
  const instances = (Array.isArray(raw.instances) ? raw.instances : []).slice(0, INSTANCE_LIMIT).flatMap((p) => {
    if (!p || !validIds.includes(p.character)) return [];
    const id = typeof p.id === 'string' && /^[\w-]{1,80}$/.test(p.id) && !used.has(p.id) ? p.id : makeId();
    used.add(id);
    return [{ id, character: p.character, ...instanceSettings(p),
      ...(Number.isFinite(p.x) && Number.isFinite(p.y) ? { x: p.x, y: p.y } : {}),
      profileName: typeof p.profileName === 'string' ? p.profileName : undefined, displayId: p.displayId ?? null }];
  });
  return { version: STORE_VERSION, paused: raw.paused === true, interactions: raw.interactions !== false, alwaysOnTop: raw.alwaysOnTop !== false, instances };
}
