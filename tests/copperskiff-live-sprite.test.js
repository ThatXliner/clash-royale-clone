import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCopperskiffBattleArt,
  getCopperskiffBattleFrame,
} from '../src/ui/combat-art.js';
import {
  bindCombatViewModel,
  createCombatViewModel,
} from '../src/ui/combat-state.js';
import {
  getCopperskiffFacingDirection,
  getCopperskiffSpriteAction,
} from '../src/ui/combat-motion.js';

class Style {
  values = new Map();
  setProperty(name, value) { this.values.set(name, String(value)); }
}

class Node {
  attributes = new Map();
  children = [];
  className = '';
  dataset = {};
  ownerDocument = null;
  style = new Style();

  appendChild(child) {
    child.ownerDocument = this.ownerDocument;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = children;
    for (const child of children) child.ownerDocument = this.ownerDocument;
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function documentWithPresentation(bodyCssPixels, frameScale, reducedMotion) {
  const document = {
    createElement(name) {
      const node = new Node();
      node.name = name;
      node.ownerDocument = document;
      return node;
    },
    createElementNS(_namespace, name) { return this.createElement(name); },
    documentElement: { dataset: {
      combatBodyCssPixels: String(bodyCssPixels),
      combatFrameScale: String(frameScale),
    } },
    defaultView: { matchMedia: () => ({ matches: reducedMotion }) },
  };
  const layer = document.createElement('div');
  return { document, layer };
}

function copperskiff(side, id = side === 'north' ? 1 : 2) {
  return {
    hitpoints: 614,
    id,
    kind: 'copperskiff',
    layer: 'air',
    maxHitpoints: 614,
    position: { x: 9_000, y: side === 'north' ? 23_000 : 9_000 },
    side,
    targetId: null,
  };
}

function markersFor(bodyCssPixels, frameScale, reducedMotion) {
  const { document, layer } = documentWithPresentation(bodyCssPixels, frameScale, reducedMotion);
  const view = createCombatViewModel({
    entities: [copperskiff('north'), copperskiff('south')],
    events: [],
    tick: 17,
    towers: [],
  });
  bindCombatViewModel(layer, view);
  return layer.children[0].children
    .filter((node) => node.dataset.kind === 'copperskiff')
    .sort((left, right) => left.dataset.side.localeCompare(right.dataset.side))
    .map((marker) => ({
      art: marker.children.find((child) => child.dataset.artId === 'copperskiff'),
      marker,
      document,
    }));
}

test('Copperskiff atlas covers both teams, two fixed poses, and four actor-facing directions', () => {
  const expectedColumns = { east: 0, north: 1, south: 2, west: 3 };
  const expectedRows = {
    north: { idle: 0, contact: 1 },
    south: { idle: 2, contact: 3 },
  };
  const seenWindows = new Set();
  for (const side of ['north', 'south']) {
    for (const action of ['idle', 'contact']) {
      for (const direction of ['east', 'north', 'south', 'west']) {
        const frame = getCopperskiffBattleFrame({
          action, direction, reducedMotion: false, side, tick: 1,
        });
        assert.equal(frame.column, expectedColumns[direction]);
        assert.equal(frame.row, expectedRows[side][action]);
        assert.deepEqual(frame.source, {
          x: expectedColumns[direction] * 64,
          y: expectedRows[side][action] * 64,
          width: 64,
          height: 64,
        });
        assert.equal(frame.viewBox, `${frame.source.x} ${frame.source.y} 64 64`);
        seenWindows.add(`${frame.source.x}:${frame.source.y}`);
      }
    }
  }
  assert.equal(seenWindows.size, 16, 'each state uses one unique, non-cropped cell');
});

test('Copperskiff facing uses combat screen axes, including the accepted positive-y-up mapping', () => {
  const unit = { side: 'south', position: { x: 9_000, y: 12_000 } };
  const facing = (x, y) => getCopperskiffFacingDirection(unit, {
    position: { x: 9_000 + x, y: 12_000 + y },
  });
  assert.equal(facing(2_000, 0), 'east');
  assert.equal(facing(-2_000, 0), 'west');
  assert.equal(facing(0, 2_000), 'north');
  assert.equal(facing(0, -2_000), 'south');
  assert.equal(facing(100, 101), 'north', 'vertical direction wins an exact near-tie');
  assert.equal(getCopperskiffFacingDirection(unit, null), 'north');
});

test('canonical attack/recoil ticks select the static contact cell and preserve reduced-motion information', () => {
  for (const pose of ['attack', 'recoil']) assert.equal(getCopperskiffSpriteAction(pose), 'contact');
  for (const pose of ['idle', 'deploy', 'anticipate', 'move']) assert.equal(getCopperskiffSpriteAction(pose), 'idle');

  const normal = getCopperskiffBattleFrame({
    action: 'contact', direction: 'east', reducedMotion: false, side: 'north', tick: 90,
  });
  const reduced = getCopperskiffBattleFrame({
    action: 'contact', direction: 'east', reducedMotion: true, side: 'north', tick: 91,
  });
  assert.equal(reduced.id, normal.id);
  assert.deepEqual(reduced.source, normal.source);
});

test('live markers keep their canonical health-bar footprint while the 64px sprite scales once', () => {
  for (const { bodyCssPixels, frameScale } of [
    { bodyCssPixels: 13, frameScale: 0.5 },
    { bodyCssPixels: 26, frameScale: 0.75 },
  ]) {
    const rendered = markersFor(bodyCssPixels, frameScale, false);
    assert.equal(rendered.length, 2);
    for (const { art, marker } of rendered) {
      assert.ok(art);
      const direction = marker.dataset.side === 'north' ? 'south' : 'north';
      const column = { east: 0, north: 1, south: 2, west: 3 }[direction];
      const row = marker.dataset.side === 'north' ? 0 : 2;
      const expectedFrameCssPixels = 64 * bodyCssPixels / 13 / frameScale;
      assert.ok(Math.abs(Number.parseFloat(art.style.width) - expectedFrameCssPixels) < 1e-9);
      assert.equal(art.style.width, art.style.height);
      assert.equal(art.style.left, '50%');
      assert.equal(art.style.top, '50%');
      assert.equal(art.style.translate, '-50% -84.375%');
      assert.equal(art.style.pointerEvents, 'none');
      assert.equal(art.getAttribute('viewBox'), `${column * 64} ${row * 64} 64 64`);
      assert.equal(marker.style.width, undefined, 'the canonical marker retains stylesheet sizing');
      assert.equal(marker.style.height, undefined, 'sprite scaling does not resize collision/UI geometry');
      assert.equal(marker.style.values.get('--combat-y'), String(32_000 - Number(marker.dataset.side === 'north' ? 23_000 : 9_000)));
      assert.equal(marker.children.find((child) => child.className === 'combat-health')?.className,
        'combat-health');
    }
  }
});

test('reduced-motion render keeps static actor-facing and pose cells', () => {
  const normal = markersFor(13, 0.5, false);
  const reduced = markersFor(13, 0.5, true);
  for (let index = 0; index < normal.length; index += 1) {
    const normalArt = normal[index].art;
    const reducedArt = reduced[index].art;
    assert.equal(normalArt.getAttribute('viewBox'), reducedArt.getAttribute('viewBox'));
    assert.equal(normalArt.dataset.spriteFrame, reducedArt.dataset.spriteFrame);
    assert.equal(normalArt.style.width, reducedArt.style.width);
    assert.equal(normalArt.dataset.spriteDirection, reducedArt.dataset.spriteDirection);
    assert.equal(reducedArt.dataset.reducedMotion, 'true');
  }
});

test('direct sprite factory rejects missing actor-facing state instead of guessing a camera label', () => {
  const { document } = documentWithPresentation(13, 1, false);
  assert.throws(() => createCopperskiffBattleArt(document, {
    side: 'north', tick: 0,
  }), /direction must be actor-facing cardinal/u);
});
