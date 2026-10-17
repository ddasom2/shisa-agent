// Editable data, shared by the catalog, FSM and settings UI. No name-based behavior branches.
export const ACTIONS = Object.freeze(['idle', 'walk', 'run', 'sleep', 'play', 'interact']);
export const PROFILES = {
  calm: { weights: { idle: 4, walk: 3, run: 0.2, sleep: 4, play: 1 }, duration: [5, 12], social: 0.3, follow: 0.2 },
  shy: { weights: { idle: 6, walk: 2, run: 0.2, sleep: 3, play: 1 }, duration: [5, 10], social: 0.15, follow: 0.1 },
  friendly: { weights: { idle: 2, walk: 5, run: 2, sleep: 1, play: 3 }, duration: [3, 8], social: 0.8, follow: 0.7 },
  energetic: { weights: { idle: 1, walk: 3, run: 6, sleep: 0.5, play: 4 }, duration: [2, 5], social: 0.6, follow: 0.5 },
  playful: { weights: { idle: 1, walk: 4, run: 3, sleep: 1, play: 5 }, duration: [3, 7], social: 0.8, follow: 0.9 },
};
export const DEFAULT_PROFILES = { shisa: 'calm', chiikawa: 'shy', hachi: 'friendly', usagi: 'energetic', momonga: 'playful', rakko: 'calm', kurimanju: 'calm' };
export function cleanProfile(raw, fallback = 'calm') {
  const base = PROFILES[fallback] ?? PROFILES.calm;
  const bound = (v, lo, hi, d) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
  const duration = [bound(raw?.duration?.[0], 1, 30, base.duration[0]), bound(raw?.duration?.[1], 1, 60, base.duration[1])];
  duration[1] = Math.max(duration[0], duration[1]);
  return { weights: Object.fromEntries(ACTIONS.filter((a) => a !== 'interact').map((a) => [a, bound(raw?.weights?.[a], 0, 100, base.weights[a])])),
    duration, social: bound(raw?.social, 0, 1, base.social), follow: bound(raw?.follow, 0, 1, base.follow) };
}
