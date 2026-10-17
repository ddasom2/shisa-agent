export const PET_SIZE = 128;
export const MAX_PETS = 24;
export const PET_IDS = Object.freeze(['shisa', 'hachi', 'rakko', 'momonga', 'usagi']);
export function clampPet(p, a) {
  return { ...p, x: Math.max(a.x, Math.min(p.x, a.x + Math.max(0, a.width - (p.size ?? PET_SIZE)))), y: Math.max(a.y, Math.min(p.y, a.y + Math.max(0, a.height - (p.size ?? PET_SIZE)))) };
}
export function newPet(character, a, random = Math.random) {
  if (!PET_IDS.includes(character)) throw new Error('Unknown pet');
  const angle = random() * Math.PI * 2, speed = 22 + random() * 26;
  return { character, x: a.x + random() * Math.max(0, a.width - PET_SIZE), y: a.y + random() * Math.max(0, a.height - PET_SIZE), vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, rest: 0, turn: 2 + random() * 5 };
}
export function stepPet(p, a, seconds, random = Math.random) {
  const dt = Math.max(0, Math.min(seconds, 0.1)); // resume from sleep without teleporting
  let n = clampPet(p, a);
  if (p.rest > 0) return { ...n, rest: Math.max(0, p.rest - dt) };
  n.turn -= dt;
  if (n.turn <= 0) {
    const angle = random() * Math.PI * 2, speed = 22 + random() * 26;
    n = { ...n, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, turn: 2 + random() * 5, rest: random() < 0.3 ? 0.5 + random() * 2 : 0 };
  }
  n.x += n.vx * dt; n.y += n.vy * dt;
  if (n.x < a.x || n.x > a.x + a.width - PET_SIZE) n.vx *= -1;
  if (n.y < a.y || n.y > a.y + a.height - PET_SIZE) n.vy *= -1;
  return clampPet(n, a);
}
