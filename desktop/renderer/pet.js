const image = document.getElementById('pet'), video = document.getElementById('video');
const sprite = document.getElementById('sprite'), placeholder = document.getElementById('placeholder');
let current = null, currentSrc = '', candidates = [], fallback = 0, blinkTimer = null, blinkEnd = null, dragging = false;
function loadNext() {
  const src = candidates[fallback++];
  if (!src) { image.hidden = true; video.hidden = true; video.pause(); video.removeAttribute('src'); video.load(); placeholder.hidden = false; return; }
  const isVideo = /\.webm(?:[?#]|$)/i.test(src) || current?.videoSources?.includes(src);
  placeholder.hidden = true; video.hidden = !isVideo; image.hidden = isVideo;
  if (isVideo) { video.src = src; video.play().catch(() => {}); }
  else { video.pause(); if (video.hasAttribute('src')) { video.removeAttribute('src'); video.load(); } image.src = src; }
}
image.addEventListener('error', loadNext); video.addEventListener('error', loadNext);
function apply(view) {
  if (!view) return;
  clearTimeout(blinkTimer); clearTimeout(blinkEnd);
  current = view;
  document.body.dataset.action = view.action; document.body.dataset.paused = String(view.paused);
  document.body.dataset.dragging = String(view.dragging);
  sprite.style.scale = `${view.facing < 0 ? -1 : 1} 1`;
  placeholder.textContent = `${view.name}\n그림 추가 필요`;
  image.alt = view.name; sprite.title = `${view.name} · 드래그로 이동 · 우클릭 설정`;
  const gestures = { look: '…', greet: '♪', stand: '♡', follow: '↝', play: '♫', rest: 'z' };
  document.getElementById('gesture').textContent = view.action === 'sleep' ? 'z' : gestures[view.interaction] ?? '';
  const media = view.animations[view.action] ?? view.animations.idle;
  const sources = [...new Set([media?.src, ...(media?.fallback ?? []), view.animations.idle?.src, ...(view.animations.idle?.fallback ?? [])].filter(Boolean))];
  // Imported URLs use state names; retain explicit media kinds for those URLs.
  view.videoSources = Object.values(view.animations).filter((a) => a.kind === 'video').map((a) => a.src);
  const signature = JSON.stringify(sources);
  if (signature !== currentSrc) { currentSrc = signature; candidates = sources; fallback = 0; loadNext(); }
  if (!video.hidden) { if (view.paused || view.dragging) video.pause(); else video.play().catch(() => {}); }
  if (view.action === 'idle' && view.animations.idle?.closed && fallback === 1) blinkTimer = setTimeout(() => {
    if (current !== view) return;
    image.src = view.animations.idle.closed;
    blinkEnd = setTimeout(() => { if (current === view) image.src = view.animations.idle.src; }, 160);
  }, 3000 + Math.random() * 4000);
}
window.pet.onView(apply); window.pet.get().then(apply);
sprite.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  dragging = true; sprite.setPointerCapture(event.pointerId); window.pet.startDrag();
});
function end() { if (dragging) { dragging = false; window.pet.endDrag(); } }
sprite.addEventListener('pointerup', end); sprite.addEventListener('pointercancel', end); sprite.addEventListener('lostpointercapture', end);
window.addEventListener('blur', end);
