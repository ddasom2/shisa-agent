const $ = (id) => document.getElementById(id);
const api = window.networkMode;
let history = [], pending = false;
const cfg = await api.get();
if (cfg) {
  $('current').textContent = `현재 모드: ${{ normal: '일반', offline: '오프라인 펫', intranet: '사내망 AI' }[cfg.mode]}`;
  $('mode').value = cfg.mode; $('endpoint').value = cfg.endpoint; $('model').value = cfg.model;
  $('key-status').textContent = cfg.hasKey ? '저장된 키가 있습니다. 새 키 입력으로 교체할 수 있습니다.' : '저장된 키가 없습니다.';
  $('chat').hidden = cfg.mode !== 'intranet';
}
function fields() { $('server').hidden = $('mode').value !== 'intranet'; }
$('mode').addEventListener('change', fields); fields();
$('settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const result = await api.save({ mode: $('mode').value, endpoint: $('endpoint').value.trim(), model: $('model').value.trim(), apiKey: $('key').value.trim(), clearKey: $('clear-key').checked });
  $('status').textContent = result?.ok ? '재시작합니다…' : result?.error || '저장하지 못했습니다.';
});
function render() {
  $('messages').replaceChildren(...history.map((m) => {
    const p = document.createElement('p'); p.textContent = `${m.role === 'user' ? '나' : 'AI'}: ${m.content}`; return p;
  }));
}
$('reset').addEventListener('click', () => { if (!pending) { history = []; render(); } });
$('ask').addEventListener('submit', async (e) => {
  e.preventDefault(); if (pending) return;
  const text = $('prompt').value.trim(); if (!text) return;
  pending = true; $('send').disabled = true; $('reset').disabled = true; $('status').textContent = '내부 모델에 요청 중…';
  const next = [...history, { role: 'user', content: text }].slice(-19);
  try {
    const result = await api.chat(next);
    if (result?.ok) { history = [...next, { role: 'assistant', content: result.text }]; $('prompt').value = ''; render(); $('status').textContent = '응답을 받았습니다.'; }
    else $('status').textContent = result?.error || '요청에 실패했습니다.';
  } catch { $('status').textContent = '요청에 실패했습니다.'; }
  finally { pending = false; $('send').disabled = false; $('reset').disabled = false; }
});
