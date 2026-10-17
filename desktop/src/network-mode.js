import { isIP } from 'node:net';
export const NETWORK_MODES = ['normal', 'offline', 'intranet'];
export function privateAddress(host) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase();
  if (h === 'localhost' || h === '::1') return true;
  if (isIP(h) === 6) return /^(fc|fd)[0-9a-f]{2}:/.test(h);
  if (isIP(h) !== 4) return false;
  const [a, b] = h.split('.').map(Number);
  return a === 127 || a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}
export function internalEndpoint(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || !privateAddress(u.hostname) || u.username || u.password || u.search || u.hash) throw new Error('서버 주소는 localhost 또는 사설 IP의 HTTP(S) 주소를 입력하세요.');
  if (u.hostname === 'localhost') u.hostname = '127.0.0.1'; // no DNS or proxy lookup
  return u.href.replace(/\/+$/, '');
}
export function modeConfig(value) {
  if (!NETWORK_MODES.includes(value?.mode)) throw new Error('실행 모드를 선택하세요.');
  const mode = value.mode;
  const endpoint = typeof value?.endpoint === 'string' ? value.endpoint : '';
  const model = typeof value?.model === 'string' ? value.model.trim() : '';
  if (mode === 'intranet') {
    if (!model || model.length > 200 || /[\r\n]/.test(model)) throw new Error('모델 이름을 입력하세요 (최대 200자).');
    return { mode, endpoint: internalEndpoint(endpoint), model };
  }
  return { mode, endpoint: '', model: '' };
}
export function localResource(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return !u.host && !/^[/\\]{2}/.test(decodeURIComponent(u.pathname));
    return (u.protocol === 'cy-asset:' && u.host === 'app') || (u.protocol === 'pet-asset:' && u.host === 'local') || u.protocol === 'devtools:';
  } catch { return false; }
}
export function chatMessages(value) {
  if (!Array.isArray(value) || !value.length || value.length > 20) throw new Error('대화는 최대 20개 메시지까지 보낼 수 있습니다.');
  let total = 0;
  const messages = value.map((m) => {
    if (!['user', 'assistant'].includes(m?.role) || typeof m.content !== 'string' || !m.content.trim() || m.content.length > 8000) throw new Error('메시지를 확인하세요 (최대 8000자).');
    total += m.content.length;
    return { role: m.role, content: m.content };
  });
  if (total > 32000 || messages.at(-1).role !== 'user') throw new Error('대화가 너무 깁니다. 새 대화를 시작하세요.');
  return messages;
}
