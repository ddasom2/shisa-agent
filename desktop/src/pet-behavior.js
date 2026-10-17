import { clampPet } from './pet-motion.js';
import { cleanProfile } from './pet-profiles.js';
export const INTERACTIONS = ['look', 'greet', 'stand', 'follow', 'play', 'rest'];
export function beginBehavior(p, random = Math.random) {
  return { ...p, action: 'idle', remaining: 1 + random() * 3, facing: p.vx < 0 ? -1 : 1,
    cooldown: 3 + random() * 4, pair: null, interaction: null, partner: null };
}
export function chooseAction(profile, random = Math.random) {
  const entries = Object.entries(profile.weights), total = entries.reduce((n, [, v]) => n + v, 0);
  if (!total) return 'idle';
  let n = random() * total;
  for (const [action, weight] of entries) { n -= weight; if (n < 0) return action; }
  return 'idle';
}
function release(p) {
  p.pair = null; p.partner = null; p.interaction = null; p.action = 'idle'; p.remaining = 1.5; p.cooldown = 10;
}
export function stepWorld(input, areas, seconds, { random = Math.random, interactions = true, paused = false } = {}) {
  const dt = Math.max(0, Math.min(seconds, 0.1));
  const pets = input.map((p) => ({ ...p }));
  const byId = new Map(pets.map((p) => [p.id, p]));
  const areaFor = (p) => areas.find((a) => a.id === p.displayId) ?? areas[0];
  if (!areas.length) return pets;
  for (const p of pets) {
    Object.assign(p, clampPet(p, areaFor(p)));
    if (p.pair) {
      const other = byId.get(p.partner);
      if (!interactions || !other || other.pair !== p.pair || p.held || other.held || paused) release(p);
    }
    if (paused || p.held) continue;
    p.cooldown = Math.max(0, p.cooldown - dt); p.remaining -= dt;
    if (p.remaining <= 0) {
      if (p.pair) { release(p); continue; }
      const profile = cleanProfile(p.profile);
      p.action = chooseAction(profile, random);
      p.remaining = (profile.duration[0] + random() * (profile.duration[1] - profile.duration[0])) / p.frequency;
      // Gradual changes in heading; no random 180-degree flips.
      const angle = Math.atan2(p.vy, p.vx) + (random() - 0.5) * 0.9;
      p.vx = Math.cos(angle) * 32; p.vy = Math.sin(angle) * 20;
    }
  }
  if (interactions && !paused) {
    for (let i = 0; i < pets.length; i++) for (let j = i + 1; j < pets.length; j++) {
      const a = pets[i], b = pets[j];
      if (a.pair || b.pair || a.held || b.held || a.cooldown > 0 || b.cooldown > 0 || a.displayId !== b.displayId) continue;
      const distance = Math.hypot(a.x + a.size / 2 - b.x - b.size / 2, a.y + a.size / 2 - b.y - b.size / 2);
      if (distance > (a.size + b.size) * 0.8) continue;
      const pa = cleanProfile(a.profile), pb = cleanProfile(b.profile);
      if (random() > (pa.social + pb.social) * 0.5 * dt * 0.6) continue;
      const kind = random() < (pa.follow + pb.follow) * 0.25 ? 'follow' : INTERACTIONS[Math.floor(random() * INTERACTIONS.length)];
      const pair = [a.id, b.id].sort().join(':');
      for (const [p, other] of [[a, b], [b, a]]) Object.assign(p, {
        pair, partner: other.id, interaction: kind, action: 'interact', remaining: 2 + random() * 2,
        facing: other.x >= p.x ? 1 : -1,
      });
      b.remaining = a.remaining; // one bounded duration for both participants
    }
  }
  for (const p of pets) {
    if (paused || p.held) continue;
    let factor = p.action === 'walk' ? 1 : p.action === 'run' ? 2.2 : 0;
    if (p.pair && ['follow', 'play'].includes(p.interaction)) {
      const other = byId.get(p.partner);
      const leader = p.id < other.id;
      factor = p.interaction === 'play' ? 1.7 : 1;
      if (!leader) {
        const targetX = other.x - other.facing * (other.size + p.size) * 0.42;
        p.vx += (Math.max(-32, Math.min(32, (targetX - p.x) * 1.2)) - p.vx) * dt * 3;
        p.vy += (Math.max(-20, Math.min(20, (other.y - p.y) * 1.2)) - p.vy) * dt * 3;
      }
    }
    p.x += p.vx * factor * p.speed * dt; p.y += p.vy * factor * p.speed * dt;
    const area = areaFor(p);
    if (p.x < area.x || p.x > area.x + area.width - p.size) p.vx *= -1;
    if (p.y < area.y || p.y > area.y + area.height - p.size) p.vy *= -1;
    if (factor && Math.abs(p.vx) > 2) p.facing = p.vx < 0 ? -1 : 1;
  }
  // Gentle separation, including stationary pets. Dragged/hovered windows stay put.
  if (!paused) for (let i = 0; i < pets.length; i++) for (let j = i + 1; j < pets.length; j++) {
    const a = pets[i], b = pets[j];
    if (a.displayId !== b.displayId) continue;
    const dx = b.x + b.size / 2 - a.x - a.size / 2, dy = b.y + b.size / 2 - a.y - a.size / 2;
    const distance = Math.hypot(dx, dy), min = (a.size + b.size) * 0.32;
    if (distance >= min) continue;
    const force = Math.min(min - distance, 40 * dt), nx = distance ? dx / distance : 1, ny = distance ? dy / distance : 0;
    if (!a.held) { a.x -= nx * force; a.y -= ny * force; }
    if (!b.held) { b.x += nx * force; b.y += ny * force; }
  }
  return pets.map((p) => clampPet(p, areaFor(p)));
}
