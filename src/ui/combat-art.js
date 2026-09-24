// Original Rivermark combat artwork, authored in repository; CC0-1.0.
// Vector paths are bounded to a 64 × 64 canvas. No external/reference assets.
const INK = '#191D22';
const BONE = '#F4EBD6';
const COPPER = '#E9A83A';
const WOOD = '#4A332A';
const LEAF = '#5C8A46';
const STONE = '#9BA5A2';
const SHALE = '#65716F';
const shapes = {
  coilblade: [
    ['M20 43 18 57 27 57 31 43M36 43 38 57 47 57 44 42', WOOD],
    ['M18 24 42 24 48 44 15 44Z', 'team'],
    ['M24 13 37 13 41 26 22 26Z', BONE],
    ['M28 13 28 6 33 10 37 6 36 13', COPPER],
    ['M45 39 48 17 58 8 55 29 49 40Z', BONE],
    ['M41 39 53 42', COPPER],
    ['M25 21 36 21', INK],
  ],
  mossguard: [
    ['M16 42 13 56 25 56 30 43M35 43 39 56 50 56 46 41', WOOD],
    ['M14 24 40 19 49 43 19 48Z', LEAF],
    ['M22 14 36 10 43 22 31 29 20 24Z', WOOD],
    ['M21 16 15 8 27 12 32 4 35 13 45 9 40 20', LEAF],
    ['M9 26 27 29 25 49 16 54 7 44Z', 'team'],
    ['M16 34 16 45M11 38 21 38', BONE],
    ['M42 29 57 23 59 35 45 39Z', WOOD],
  ],
  brassbolt: [
    ['M24 42 20 57 29 57 34 43 37 57 45 57 40 41', WOOD],
    ['M22 26 38 24 43 44 22 45Z', 'team'],
    ['M23 14 38 14 38 27 25 27Z', BONE],
    ['M20 15 24 9 39 9 43 17Z', COPPER],
    ['M37 29 53 27 53 9 60 9 60 38 38 40Z', COPPER],
    ['M51 10 61 10M52 17 60 17M28 21 35 21', INK],
  ],
  reedsting: [
    ['M26 42 19 56 26 58 33 47 41 57 47 53 38 41', WOOD],
    ['M22 26 35 22 43 44 19 45Z', 'team'],
    ['M21 21 28 9 39 21 35 30 25 29Z', LEAF],
    ['M26 22 35 22', BONE],
    ['M45 7Q65 29 44 53L48 29Z', COPPER],
    ['M47 8 46 52M35 31 61 27M57 24 62 27 58 31', BONE],
  ],
  'briar-runner': [
    ['M23 41 15 54 24 57 31 45 42 55 49 50 37 38', WOOD],
    ['M20 25 36 22 43 42 21 44Z', 'team'],
    ['M19 24 16 13 24 17 28 8 33 17 44 15 39 27Z', LEAF],
    ['M26 22 34 22', BONE],
    ['M44 38 53 14 57 24 49 41Z', BONE],
  ],
  'briar-darter': [
    ['M22 44 20 55 28 55 33 44 38 55 46 55 40 43', WOOD],
    ['M20 28 35 23 43 43 20 45Z', 'team'],
    ['M22 26 18 16 26 18 34 8 37 18 44 21 35 29Z', LEAF],
    ['M32 30 57 15 61 20 35 36Z', WOOD],
    ['M52 18 56 23', COPPER],
    ['M23 23 29 23', BONE],
  ],
  cinderling: [
    ['M20 43 16 52 26 54 33 45 39 54 49 50 43 40', WOOD],
    ['M16 34 23 21 21 12 31 19 35 6 43 21 51 27 48 43 33 49 20 44Z', '#C6452E'],
    ['M23 35 30 28 34 17 40 29 42 39 33 44Z', COPPER],
    ['M18 39 47 39 44 46 23 48Z', 'team'],
    ['M26 31 29 31M37 31 40 31', INK],
  ],
  copperskiff: [
    ['M17 31 46 31 41 47 30 53 20 45Z', COPPER],
    ['M20 34 42 34 39 43 24 43Z', 'team'],
    ['M29 13 34 13 34 33 29 33Z', WOOD],
    ['M4 18Q17 8 31 17Q47 6 60 16L36 23 26 23Z', BONE],
    ['M27 43 35 43 35 58 27 58Z', WOOD],
    ['M24 29 27 22 37 22 40 30Z', COPPER],
  ],
  skymaul: [
    ['M21 29 41 29 46 43 32 52 18 42Z', 'team'],
    ['M22 28 15 10 4 17 13 34ZM40 28 49 8 61 16 51 34Z', '#5B4B8A'],
    ['M24 20 39 20 41 31 22 31Z', BONE],
    ['M30 43 34 43 36 59 29 59Z', WOOD],
    ['M19 51 46 51 49 61 17 61Z', COPPER],
    ['M27 26 36 26', INK],
  ],
  stonehauler: [
    ['M18 43 14 56 26 57 32 48 39 57 51 55 46 41', SHALE],
    ['M12 24 20 15 28 18 34 9 44 14 53 22 55 36 48 47 18 47 9 38Z', STONE],
    ['M12 25 5 32 8 45 18 46 24 35 21 24Z', SHALE],
    ['M44 23 52 18 60 23 59 38 51 44 45 37Z', SHALE],
    ['M23 14 32 9 41 14 42 25 35 31 24 26Z', '#B9C0B6'],
    ['M18 27 26 30 23 37 18 42 12 40 14 32Z', 'team'],
    ['M39 27 46 23 51 28 49 36 43 39 39 34Z', COPPER],
    ['M27 22 30 22M36 21 39 21', INK],
    ['M28 36 39 36 42 42 24 42Z', WOOD],
    ['M28 56 39 56', BONE],
  ],
};
for (const paths of Object.values(shapes)) {
  for (const path of paths) Object.freeze(path);
  Object.freeze(paths);
}
export const COMBAT_ART_ARCHETYPES = Object.freeze(Object.keys(shapes));
Object.freeze(shapes);

export function createCombatArt(document, kind, side, layer) {
  const create = typeof document.createElementNS === 'function'
    ? (tag) => document.createElementNS('http://www.w3.org/2000/svg', tag)
    : (tag) => document.createElement(tag);
  const svg = create('svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'combat-art');
  svg.setAttribute('aria-hidden', 'true');
  svg.dataset.artId = Object.hasOwn(shapes, kind) ? kind : `witness-${layer}`;
  // Unshipped witness-only kinds use an explicit family silhouette.
  const paths = Object.hasOwn(shapes, kind) ? shapes[kind] : shapes[layer === 'air' ? 'copperskiff' : 'coilblade'];
  for (const [d, fill] of paths) {
    const node = create('path');
    node.setAttribute('d', d);
    node.setAttribute('fill', fill === 'team' ? (side === 'north' ? '#C6452E' : '#2E7F86') : fill);
    node.setAttribute('stroke', INK);
    node.setAttribute('stroke-width', '2');
    node.setAttribute('stroke-linejoin', 'round');
    node.setAttribute('stroke-linecap', 'round');
    svg.appendChild(node);
  }
  const crest = create('path');
  crest.setAttribute('d', side === 'north' ? 'M28 35 32 30 36 35Z' : 'M27 33Q32 39 37 33');
  crest.setAttribute('fill', side === 'north' ? COPPER : 'none');
  crest.setAttribute('stroke', side === 'north' ? COPPER : '#DCEDE9');
  crest.setAttribute('stroke-width', '2');
  svg.appendChild(crest);
  return svg;
}

export const COMBAT_ART_STYLE = `.combat-target-link{display:none}.combat-marker[class]{border:0;background:none;border-radius:0;box-shadow:none;width:6.2%;height:auto;aspect-ratio:1}.combat-marker--entity-ground{filter:drop-shadow(0 2px 0 #191d2244)}.combat-marker--entity-air::before{content:"";position:absolute;left:18%;right:18%;height:13%;bottom:-15%;border-radius:50%;background:#191d2244}.combat-art{display:block;width:100%;height:100%;overflow:visible}.combat-marker[data-kind="mossguard"],.combat-marker[data-kind="skymaul"]{width:7.5%}.combat-marker[data-kind="stonehauler"]{width:8.2%}.combat-marker[data-kind="briar-runner"],.combat-marker[data-kind="briar-darter"],.combat-marker[data-kind="cinderling"]{width:4.8%}.combat-marker--tower[class]{width:7%;height:0;aspect-ratio:auto}.combat-marker[class] .combat-health{width:80%;height:4px;bottom:105%;border-radius:1px;background:#DCEDE9;box-shadow:0 0 0 1px #191D22}.combat-marker--north[class] .combat-health{background:#E9A83A}.combat-marker--tower[class] .combat-health{bottom:28px;height:4px;box-shadow:0 0 0 1px #191D22}.combat-marker[data-reaction="damage"] .combat-art{filter:brightness(1.7)}.combat-marker[data-reaction="target"] .combat-art{transform:rotate(-7deg)}.combat-marker--north[data-reaction="target"] .combat-art{transform:rotate(7deg)}`;
