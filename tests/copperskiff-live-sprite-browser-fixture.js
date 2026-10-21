import {
  createCopperskiffBattleArt,
  getCopperskiffBattleFrame,
} from '../src/ui/combat-art.js';
import { getCombatStyleText } from '../src/ui/combat-state.js';

const samples = document.querySelector('#samples');
const style = document.createElement('style');
style.textContent = getCombatStyleText();
document.head.appendChild(style);
const bodyCssPixels = window.innerWidth < 600 ? 13 : 26;
document.documentElement.dataset.combatBodyCssPixels = String(bodyCssPixels);
document.documentElement.dataset.combatFrameScale = '1';
const states = [];
for (const side of ['north', 'south']) {
  for (const action of ['idle', 'contact']) {
    for (const direction of ['east', 'north', 'south', 'west']) {
      const sample = document.createElement('figure');
      sample.dataset.sample = `${side}-${direction}-${action}`;
      const frame = getCopperskiffBattleFrame({
        action,
        direction,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        side,
        tick: 90,
      });
      const art = createCopperskiffBattleArt(document, {
        action,
        bodyCssPixels,
        direction,
        frameScale: 1,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        side,
        tick: 90,
      });
      sample.style.width = `${64 * bodyCssPixels / 13}px`;
      sample.style.height = `${64 * bodyCssPixels / 13}px`;
      sample.appendChild(art);
      const caption = document.createElement('figcaption');
      caption.textContent = `${side} · ${direction} · ${action}`;
      sample.appendChild(caption);
      samples.appendChild(sample);
      states.push({
        action: frame.action,
        column: frame.column,
        direction: frame.direction,
        id: frame.id,
        row: frame.row,
        side: frame.side,
        source: frame.source,
        viewBox: frame.viewBox,
      });
    }
  }
}
const image = new Image();
image.onload = () => {
  document.documentElement.dataset.assetReady = String(
    image.naturalWidth === 256 && image.naturalHeight === 256,
  );
  document.documentElement.dataset.bodyCssPixels = String(bodyCssPixels);
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, 256, 256).data;
  const alphaBounds = states.map(({ source, id }) => {
    let left = 64;
    let top = 64;
    let right = -1;
    let bottom = -1;
    for (let y = source.y; y < source.y + source.height; y += 1) {
      for (let x = source.x; x < source.x + source.width; x += 1) {
        if (pixels[(y * 256 + x) * 4 + 3] <= 16) continue;
        left = Math.min(left, x - source.x);
        top = Math.min(top, y - source.y);
        right = Math.max(right, x - source.x);
        bottom = Math.max(bottom, y - source.y);
      }
    }
    return { id, left, top, right, bottom };
  });
  window.__copperskiffSpriteFixture = {
    bodyCssPixels,
    decodedWidth: image.naturalWidth,
    decodedHeight: image.naturalHeight,
    frames: states,
    alphaBounds,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
};
image.onerror = () => { document.documentElement.dataset.assetReady = 'false'; };
image.src = new URL('../public/assets/copperskiff-battle-sprite.png', import.meta.url).href;
