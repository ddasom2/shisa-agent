import { characterAssets, characterName, CHARACTER_IDS } from '../src/character.js';
const id = new URLSearchParams(location.search).get('character');
const character = CHARACTER_IDS.includes(id) ? id : 'shisa';
const assets = characterAssets(character);
const image = document.querySelector('#pet');
image.alt = characterName(character);
image.title = `${image.alt} · 우클릭으로 돌려보내기`;
const sources = [...assets.stills, '../assets/character.svg'];
let fallback = 0;
image.addEventListener('error', () => { if (fallback < sources.length) image.src = sources[fallback++]; });
image.src = sources[fallback++];
function blink() {
  setTimeout(() => {
    if (assets.closed && fallback === 1) {
      image.src = assets.closed;
      setTimeout(() => { if (fallback === 1) image.src = assets.open; }, 160);
    }
    blink();
  }, 3000 + Math.random() * 4000);
}
blink();
