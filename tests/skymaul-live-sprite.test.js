import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditableGameSessionSetup } from '../src/content/editable-deck.js';
import { PLAYABLE_CARD_IDS } from '../src/content/playable-roster.js';
import { GameSession } from '../src/sim/game-session.js';
import {
  bindCombatViewModel,
  createCombatViewModel,
} from '../src/ui/combat-state.js';
import {
  bindCombatMotion,
  createCombatMotionView,
  getCopperskiffFacingDirection,
  getSkymaulSpriteAction,
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
    child.parentElement = this;
    this.children.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.children = [];
    for (const child of children) this.appendChild(child);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function documentWithPresentation(bodyCssPixels, frameScale, reducedMotion = false) {
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
  return { document, layer: document.createElement('div') };
}

function skymaul(id, side, position, targetId) {
  return {
    hitpoints: 1_000,
    id,
    kind: 'skymaul',
    layer: 'ground',
    maxHitpoints: 1_000,
    position,
    side,
    targetId,
  };
}

function staticPair(positions, bodyCssPixels, frameScale, reducedMotion = false) {
  const { document, layer } = documentWithPresentation(bodyCssPixels, frameScale, reducedMotion);
  const entities = [
    skymaul(1, 'north', positions.north, 2),
    skymaul(2, 'south', positions.south, 1),
  ];
  const view = createCombatViewModel({ entities, events: [], tick: 17, towers: [] });
  bindCombatViewModel(layer, view);
  return layer.children[0].children
    .filter((node) => node.dataset.kind === 'skymaul')
    .sort((left, right) => left.dataset.side.localeCompare(right.dataset.side))
    .map((marker) => ({ art: marker.children.find((child) => child.dataset.artId === 'skymaul'), marker, document }));
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sessionForSkymaul() {
  const deck = PLAYABLE_CARD_IDS;
  const southPoint = { x: 6_000, y: 14_999 };
  const northPoint = { x: 10_500, y: 17_001 };
  for (let seed = 0; seed < 1_000; seed += 1) {
    const setup = JSON.parse(createEditableGameSessionSetup(deck, seed));
    setup.legalNorthDeployments = [{ cardId: 'skymaul', point: northPoint }];
    setup.thinkIntervalTicks = 3_600;
    setup.thinkOffsetTicks = 0;
    const session = new GameSession(canonical(setup));
    const northSlot = session.state.decks.north.hand.indexOf('skymaul');
    const southSlot = session.state.decks.south.hand.indexOf('skymaul');
    if (northSlot < 0 || southSlot < 0) continue;
    const admission = session.submitPlayerCommand(canonical({
      cardId: 'skymaul',
      commandId: 0,
      point: southPoint,
      slot: southSlot,
      tick: 0,
      type: 'deploy',
    }));
    assert.deepEqual(admission, {
      accepted: true,
      commandId: 0,
      tick: 0,
      type: 'player-command-admitted',
    });
    session.stepMany(1);
    const committed = session.replay
      .filter(({ type, deployment }) => type === 'session-deployed' && deployment.cardId === 'skymaul')
      .map(({ side }) => side)
      .sort();
    const live = session.state.battle.units
      .filter(({ alive, archetypeId }) => alive && archetypeId === 'skymaul')
      .map(({ side }) => side)
      .sort();
    if (JSON.stringify(committed) !== JSON.stringify(['north', 'south']) ||
        JSON.stringify(live) !== JSON.stringify(['north', 'south'])) continue;
    return session;
  }
  throw new Error('no bounded seeded opening hand contains Skymaul for both sides');
}

function combatViewForSession(session) {
  const units = session.state.battle.units.filter(({ alive, hitpoints }) => alive && hitpoints > 0);
  const ids = new Set(units.map(({ id }) => id));
  return createCombatViewModel({
    entities: units.map((unit) => ({
      hitpoints: unit.hitpoints,
      id: unit.id,
      kind: unit.archetypeId,
      layer: unit.layer,
      maxHitpoints: unit.maxHealth,
      position: unit.position,
      side: unit.side,
      targetId: ids.has(unit.targetId) ? unit.targetId : null,
    })),
    events: [],
    tick: session.state.tick,
    towers: [],
  });
}

test('Skymaul maps canonical motion poses to three fixed atlas cues', () => {
  for (const pose of ['idle', 'deploy', 'anticipate', 'stun', 'unknown']) {
    assert.equal(getSkymaulSpriteAction(pose), 'idle');
  }
  assert.equal(getSkymaulSpriteAction('move'), 'walk');
  for (const pose of ['attack', 'recoil']) assert.equal(getSkymaulSpriteAction(pose), 'contact');
  assert.throws(() => getSkymaulSpriteAction(null), /pose must be a string/u);
});

test('Skymaul actor facing follows canonical target vectors for all four headings', () => {
  const unit = { side: 'south', position: { x: 9_000, y: 12_000 } };
  const facing = (dx, dy) => getCopperskiffFacingDirection(unit, {
    position: { x: unit.position.x + dx, y: unit.position.y + dy },
  });
  assert.equal(facing(2_000, 0), 'east');
  assert.equal(facing(-2_000, 0), 'west');
  assert.equal(facing(0, 2_000), 'north');
  assert.equal(facing(0, -2_000), 'south');
  assert.equal(facing(100, 101), 'north', 'vertical direction wins a near-tie');
  assert.equal(getCopperskiffFacingDirection(unit, null), 'north');
});

test('Skymaul battle markers keep team rows, source headings, pivot, size, health, and pointer behavior', () => {
  const cases = [
    {
      positions: { north: { x: 10_500, y: 17_001 }, south: { x: 6_000, y: 14_999 } },
      directions: { north: 'west', south: 'east' },
    },
    {
      positions: { north: { x: 9_000, y: 17_500 }, south: { x: 9_000, y: 14_500 } },
      directions: { north: 'south', south: 'north' },
    },
  ];
  for (const { bodyCssPixels, frameScale } of [
    { bodyCssPixels: 13, frameScale: 0.5 },
    { bodyCssPixels: 26, frameScale: 0.75 },
  ]) {
    for (const { positions, directions } of cases) {
      const rendered = staticPair(positions, bodyCssPixels, frameScale);
      assert.equal(rendered.length, 2);
      for (const { art, marker } of rendered) {
        const side = marker.dataset.side;
        const direction = directions[side];
        const team = side === 'north' ? 'ember' : 'river';
        const row = {
          north: { idle: 3, walk: 4, contact: 5 },
          south: { idle: 0, walk: 1, contact: 2 },
        }[side].idle;
        const column = { east: 0, north: 1, south: 2, west: 3 }[direction];
        const size = 64 * bodyCssPixels / 13 / frameScale;
        assert.ok(art, 'live marker owns Skymaul atlas art');
        assert.equal(art.dataset.spriteTeam, team);
        assert.equal(art.dataset.spriteDirection, direction);
        assert.equal(art.dataset.spriteAction, 'idle');
        assert.equal(art.dataset.pivot, '32:54');
        assert.equal(art.getAttribute('viewBox'), `${column * 64} ${row * 64} 64 64`);
        assert.equal(art.style.width, `${size}px`);
        assert.equal(art.style.height, `${size}px`);
        assert.equal(art.style.left, '50%');
        assert.equal(art.style.top, '50%');
        assert.equal(art.style.translate, '-50% -84.375%');
        assert.equal(art.style.pointerEvents, 'none');
        assert.equal(marker.style.values.has('width'), false);
        assert.equal(marker.style.values.has('height'), false);
        assert.equal(marker.children.filter((child) => child.className === 'combat-health').length, 1);
        assert.equal(art.dataset.simulationTick, '17');
      }
    }
  }
});

test('authentic GameSession projections bind Skymaul action, facing, and tick and restore deterministically', () => {
  const session = sessionForSkymaul();
  const checkpoint = session.serialize();
  const snapshot = session.projectionSnapshot();
  const motion = createCombatMotionView(snapshot);
  const skymaulPoses = motion.poses.filter(({ id }) =>
    session.state.battle.units.find((unit) => unit.id === id)?.archetypeId === 'skymaul');
  assert.equal(motion.tick, session.state.tick);
  assert.equal(skymaulPoses.length, 2);
  assert.ok(skymaulPoses.every((pose) => pose.spriteAction === 'idle'));
  assert.ok(skymaulPoses.every((pose) =>
    ['east', 'north', 'south', 'west'].includes(pose.spriteDirection)));

  const { document, layer } = documentWithPresentation(13, 0.5);
  bindCombatViewModel(layer, combatViewForSession(session));
  const effects = document.createElement('div');
  effects.appendChild(document.createElement('div'));
  bindCombatMotion(layer, effects, motion);
  const markers = layer.children[0].children.filter((node) => node.dataset.kind === 'skymaul');
  assert.equal(markers.length, 2);
  for (const marker of markers) {
    const art = marker.children.find((child) => child.dataset.artId === 'skymaul');
    const pose = skymaulPoses.find(({ id }) => String(id) === marker.dataset.combatId);
    assert.equal(art.dataset.spriteAction, pose.spriteAction);
    assert.equal(art.dataset.spriteDirection, pose.spriteDirection);
    assert.equal(art.dataset.simulationTick, String(motion.tick));
    assert.equal(art.dataset.reducedMotion, 'false');
  }

  const direct = GameSession.restore(checkpoint);
  assert.equal(direct.serialize(), checkpoint);
  assert.deepEqual(createCombatMotionView(direct.projectionSnapshot()), motion);
  session.stepMany(120);
  direct.stepMany(37);
  direct.stepMany(43);
  direct.stepMany(40);
  assert.equal(direct.serialize(), session.serialize());
  assert.deepEqual(
    createCombatMotionView(direct.projectionSnapshot()),
    createCombatMotionView(session.projectionSnapshot()),
    'chunked/restored progression retains canonical Skymaul pose selection',
  );
});
