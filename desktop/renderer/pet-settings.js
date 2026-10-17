const $ = (id) => document.getElementById(id), api = window.petSettings;
const node = (tag, text) => { const n = document.createElement(tag); if (text) n.textContent = text; return n; };
let state, editing = false;
async function command(action, data) {
  const result = await api.command(action, data);
  $('status').textContent = result?.ok ? '적용했습니다.' : result?.error || '적용하지 못했습니다.';
  if (result?.ok) { editing = false; await refresh(); }
}
function number(label, value, min, max, step = '1') {
  const wrap = node('label', label), input = node('input'); input.type = 'number'; input.value = value; input.min = min; input.max = max; input.step = step;
  wrap.append(input); return { wrap, input };
}
function select(label, value, options) {
  const wrap = node('label', label), input = node('select');
  for (const [id, name] of options) { const opt = node('option', name); opt.value = id; input.append(opt); }
  input.value = value; wrap.append(input); return { wrap, input };
}
function focus(id) { document.getElementById(`friend-${id}`)?.focus(); }
async function refresh() {
  if (editing) return;
  state = await api.get(); if (!state) return;
  const counts = new Map([...$('catalog').children].map((el) => [el.dataset.id, { checked: el.querySelector('[type=checkbox]').checked, count: el.querySelector('[type=number]').value }]));
  $('catalog').replaceChildren(...state.catalog.map((c) => {
    const label = node('label'); label.className = 'choice'; label.dataset.id = c.id;
    const check = node('input'); check.type = 'checkbox'; check.checked = counts.get(c.id)?.checked ?? false;
    const count = node('input'); count.type = 'number'; count.min = 1; count.max = 24; count.value = counts.get(c.id)?.count ?? 1; count.setAttribute('aria-label', `${c.name} 소환 개수`);
    label.append(check, node('span', `${c.name}${c.missing ? ' · 그림 없음' : ''}`), count); return label;
  }));
  $('globals').replaceChildren(...[['paused', '모두 일시정지'], ['interactions', '상호작용'], ['alwaysOnTop', '항상 위 표시']].map(([key, text]) => {
    const label = node('label', text), input = node('input'); input.type = 'checkbox'; input.checked = state[key];
    input.addEventListener('change', () => command('configure', { [key]: input.checked })); label.prepend(input); return label;
  }));
  $('instances').replaceChildren(node('h2', `화면에 있는 친구 ${state.instances.length}/24`), ...state.instances.map((p, i) => {
    const section = node('section'); section.className = 'friend'; section.id = `friend-${p.id}`; section.tabIndex = -1;
    section.append(node('h2', `${i + 1}. ${state.catalog.find((c) => c.id === p.character)?.name ?? p.character}`));
    const size = number('크기 (DIP)', p.size, 64, 256), speed = number('이동 속도 배율', p.speed, .25, 3, '.25');
    const frequency = number('행동 빈도 배율', p.frequency, .25, 3, '.25');
    const personality = select('성격', p.profileName ?? 'calm', state.profiles.map((id) => [id, { calm: '차분함', shy: '소심함', friendly: '사교적', energetic: '활발함', playful: '장난꾸러기' }[id]]));
    const display = select('모니터', p.displayId, state.displays.map((d, i) => [d.id, `${i + 1} · ${d.width}×${d.height}`]));
    const fields = node('div'); fields.className = 'fields'; fields.append(size.wrap, speed.wrap, frequency.wrap, personality.wrap, display.wrap);
    const save = node('button', '적용'); save.addEventListener('click', () => command('update', { id: p.id, patch: { size: Number(size.input.value), speed: Number(speed.input.value), frequency: Number(frequency.input.value), profileName: personality.input.value, displayId: state.displays.find((d) => String(d.id) === display.input.value)?.id } }));
    const remove = node('button', '돌려보내기'); remove.addEventListener('click', () => command('remove', p.id)); section.append(fields, save, remove); return section;
  }));
}
$('summon').addEventListener('submit', (event) => {
  event.preventDefault(); command('spawn', [...$('catalog').children].filter((el) => el.querySelector('[type=checkbox]').checked).map((el) => ({ character: el.dataset.id, count: Number(el.querySelector('[type=number]').value) })));
});
$('import').addEventListener('click', () => command('import'));
$('network').addEventListener('click', () => command('network'));
$('quit').addEventListener('click', () => api.command('quit'));
$('instances').addEventListener('focusin', () => { editing = true; });
$('instances').addEventListener('focusout', () => { editing = false; });
api.onChange(() => { if (!editing) refresh(); }); api.onFocus(focus);
await refresh(); focus(new URLSearchParams(location.search).get('instance'));
