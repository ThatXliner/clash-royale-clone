import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const root = '/tmp/cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009';
const load = (path) => import(pathToFileURL(`${root}/${path}`).href);
const [roster, deckModule, sessionModule, rlModule, liveModule, ordinary, authority] =
  await Promise.all([
    load('src/content/playable-roster.js'),
    load('src/content/editable-deck.js'),
    load('src/sim/game-session.js'),
    load('src/rl/environment.js'),
    load('src/sim/live-battle.js'),
    load('src/sim/ordinary-projectile-splash.js'),
    load('src/shared/ordinary-projectile-delivery-authority.js'),
  ]);
const { PLAYABLE_CARD_IDS } = roster;
const { createEditableGameSessionSetup } = deckModule;
const { GameSession } = sessionModule;
const { createRLEnvironment } = rlModule;
const { LiveBattle } = liveModule;
const { selectOrdinaryProjectileSplashTargets } = ordinary;
const { getOrdinaryProjectileSplashProfile } = authority;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function setup(deck, seed = 2) {
  const value = JSON.parse(createEditableGameSessionSetup(deck, seed));
  value.startingElixir = { north: 10, south: 10 };
  value.thinkIntervalTicks = 3_600;
  value.thinkOffsetTicks = 0;
  return value;
}
function command(session, point) {
  const slot = session.state.decks.south.hand.indexOf('kilnkeeper');
  assert.notEqual(slot, -1);
  return canonical({ cardId: 'kilnkeeper', commandId: 0, point, slot,
    tick: session.state.tick, type: 'deploy' });
}
function baseDeck(extra = []) {
  const ids = ['kilnkeeper', ...extra];
  return [...ids, ...PLAYABLE_CARD_IDS.filter((id) => !ids.includes(id))]
    .slice(0, 8);
}
function runSessionContact(kind) {
  let deck;
  let spawnList = [];
  let deployPoint = { x: 3_500, y: 14_500 };
  let seed = 2;
  let approachTicks = 121;
  if (kind === 'unit') {
    deck = baseDeck(['cinder-host']);
    spawnList = [{ cardId: 'cinder-host', point: { x: 3_500, y: 21_000 } }];
  } else if (kind === 'building') {
    deck = baseDeck(['cinder-host', 'ember-basin']);
    seed = 26;
    spawnList = [
      { cardId: 'cinder-host', point: { x: 7_000, y: 23_500 } },
      { cardId: 'ember-basin', point: { x: 7_000, y: 20_000 } },
    ];
    deployPoint = { x: 7_000, y: 14_500 };
  } else {
    deck = baseDeck();
    approachTicks = 293;
    deployPoint = { x: 6_000, y: 14_500 };
  }
  const value = setup(deck, seed);
  if (kind === 'building') value.thinkIntervalTicks = 1;
  value.legalNorthDeployments = spawnList;
  const session = new GameSession(canonical(value));
  const southSequenceBefore = session.state.decks.south.sequence;
  const startTarget = kind === 'tower'
    ? session.state.battle.towers.find(({ id }) => id === 'north:lane:west').hitpoints : null;
  session.submitPlayerCommand(command(session, deployPoint));
  session.stepMany(approachTicks);
  const projectile = session.state.battle.projectiles.find(({ splashProfile }) =>
    splashProfile !== undefined);
  assert.ok(projectile, `${kind}: pending splash projectile exists`);
  assert.equal(projectile.damage, 281);
  assert.equal(projectile.splashProfile.radiusMillitiles, 1_500);
  const pendingBytes = session.serialize();
  const pendingRestored = GameSession.restore(pendingBytes);
  assert.equal(pendingRestored.serialize(), pendingBytes);
  const ticks = projectile.impactTick - session.state.tick + 1;
  const forwardEvents = session.stepMany(ticks);
  const restoredEvents = pendingRestored.stepMany(ticks);
  assert.deepEqual(restoredEvents, forwardEvents, `${kind}: pending restore events`);
  assert.equal(pendingRestored.serialize(), session.serialize(), `${kind}: pending restore bytes`);
  assert.equal(pendingRestored.replayBytes(), session.replayBytes(), `${kind}: replay bytes`);

  const impacts = session.replay.filter(({ projectileId, type }) =>
    projectileId === projectile.id && type === 'projectile-impact');
  assert.equal(impacts.length, 1, `${kind}: projectile impacts once`);
  assert.equal(impacts[0].status, 'contact');
  const contacts = session.replay.filter(({ projectileId, type }) =>
    projectileId === projectile.id && type === 'external-structure-contact');
  const hits = session.replay.filter(({ projectileId, type }) =>
    projectileId === projectile.id && type === 'damage');
  if (kind === 'unit') {
    assert.ok(hits.length >= 2, 'unit primary and at least one splash victim were damaged');
    assert.ok(hits.every(({ amount }) => amount === 281));
    assert.equal(new Set(hits.map(({ targetId }) => targetId)).size, hits.length);
    const primary = session.state.battle.units.find(({ id }) => id === projectile.targetId);
    assert.ok(primary, 'primary remains represented after impact');
    assert.notDeepEqual(primary.position, projectile.targetPosition);
    const dx = BigInt(primary.position.x - projectile.targetPosition.x);
    const dy = BigInt(primary.position.y - projectile.targetPosition.y);
    const limit = BigInt(1_500 + primary.radius);
    const distanceSquared = dx * dx + dy * dy;
    assert.ok(distanceSquared <= limit * limit, 'moving primary remains in locked splash circle');
  }
  if (kind === 'building') {
    assert.equal(contacts.length, 1, 'building takes one canonical contact');
    assert.equal(contacts[0].damage, 281);
    const building = session.state.battle.structures.find(({ id }) => id === projectile.targetId);
    assert.ok(building);
    assert.equal(building.hitpoints, building.maxHitpoints - 281);
  }
  if (kind === 'tower') {
    assert.equal(contacts.length, 1, 'tower takes one canonical contact');
    assert.equal(contacts[0].structureId, 'north:lane:west');
    assert.equal(contacts[0].damage, 281);
    assert.equal(session.state.battle.towers.find(({ id }) => id === 'north:lane:west').hitpoints,
      startTarget - 281);
  }
  const committed = session.replay.filter(({ deployment, type }) =>
    type === 'session-deployed' && deployment?.cardId === 'kilnkeeper');
  assert.equal(committed.length, 1);
  assert.equal(committed[0].spend.cost, 5);
  assert.equal(committed[0].spend.accepted, true);
  assert.equal(session.state.decks.south.sequence, southSequenceBefore + 1);

  const damagedBytes = session.serialize();
  const damagedA = GameSession.restore(damagedBytes);
  const damagedB = GameSession.restore(damagedBytes);
  assert.equal(damagedA.serialize(), damagedBytes);
  const eventsA = damagedA.stepMany(3);
  const eventsB = damagedB.stepMany(3);
  assert.deepEqual(eventsA, eventsB, `${kind}: damaged restore branches events`);
  assert.equal(damagedA.serialize(), damagedB.serialize(), `${kind}: damaged restore branches bytes`);
  assert.equal(damagedA.replayBytes(), damagedB.replayBytes(), `${kind}: damaged restore replay`);

  return {
    kind,
    pendingBytesSha256: createHash('sha256').update(pendingBytes).digest('hex'),
    pendingTick: JSON.parse(pendingBytes).transcript.at(-1)?.tick ?? null,
    impactTick: projectile.impactTick,
    impactCount: impacts.length,
    unitHitIds: hits.map(({ targetId }) => targetId),
    unitHitAmounts: hits.map(({ amount }) => amount),
    structureContacts: contacts.map(({ structureId, damage }) => ({ structureId, damage })),
    elixirSpend: committed[0].spend.cost,
    southCycleAdvance: session.state.decks.south.sequence - southSequenceBefore,
    movingPrimaryDistanceSquared: kind === 'unit' ? String((() => {
      const primary = session.state.battle.units.find(({ id }) => id === projectile.targetId);
      const dx = BigInt(primary.position.x - projectile.targetPosition.x);
      const dy = BigInt(primary.position.y - projectile.targetPosition.y);
      return dx * dx + dy * dy;
    })()) : null,
    unitHitDistancesAtImpact: kind === 'unit' ? hits.map(({ targetId }) => {
      const target = session.state.battle.units.find(({ id }) => id === targetId);
      const dx = BigInt(target.position.x - projectile.targetPosition.x);
      const dy = BigInt(target.position.y - projectile.targetPosition.y);
      return { targetId, distanceSquared: String(dx * dx + dy * dy), circleRadius: 1_500 + target.radius };
    }) : [],
    restoreBranchesExact: true,
  };
}

// The RL adapter sees and accepts the real five-elixir Kilnkeeper action.
const rlDeck = baseDeck();
let seed = 0;
for (; seed < 1_000; seed += 1) {
  const { DeckCycle } = await load('src/sim/deck.js');
  if (new DeckCycle({ deck: rlDeck, seed: `${seed}:south` }).state.hand.includes('kilnkeeper')) break;
}
assert.ok(seed < 1_000);
const env = createRLEnvironment({ deck: rlDeck, seed, strideTicks: 1, horizonTicks: 8 });
const observation = env.observe();
const slot = observation.hand.indexOf('kilnkeeper');
const action = env.actionSpace().actions.find(({ point, slot: actionSlot }) =>
  actionSlot === slot && point.x === 8_500 && point.y === 14_500);
assert.ok(action && observation.actionMask[action.id]);
const sequenceBefore = GameSession.restore(JSON.parse(env.serialize()).session).state.decks.south.sequence;
const result = env.step(action.id);
const session = GameSession.restore(JSON.parse(env.serialize()).session);
const play = session.replay.find(({ deployment, type }) =>
  type === 'session-deployed' && deployment?.cardId === 'kilnkeeper');
assert.equal(play.spend.cost, 5);
assert.equal(play.spend.accepted, true);
assert.equal(session.state.decks.south.sequence, sequenceBefore + 1);

// Exercise the live selector with a moving-world boundary fixture.
const profile = getOrdinaryProjectileSplashProfile('kilnkeeper', 'kilnkeeper');
const center = { x: 0, y: 0 };
const targets = selectOrdinaryProjectileSplashTargets({
  center,
  enemySide: 'north',
  primaryTargetId: 2,
  profile,
  structures: [],
  units: [
    { alive: true, id: 1, layer: 'ground', position: center, radius: 0, side: 'south', targetable: true },
    { alive: true, id: 2, layer: 'ground', position: center, radius: 0, side: 'north', targetable: true },
    { alive: true, id: 3, layer: 'air', position: { x: 1_500, y: 0 }, radius: 0, side: 'north', targetable: true },
    { alive: true, id: 4, layer: 'ground', position: { x: 1_501, y: 0 }, radius: 0, side: 'north', targetable: true },
    { alive: false, id: 5, layer: 'ground', position: center, radius: 0, side: 'north', targetable: true },
    { alive: true, id: 6, layer: 'ground', position: center, radius: 0, side: 'north', targetable: false },
  ],
});
assert.deepEqual(targets.map(({ id }) => id), [3]);

const unit = runSessionContact('unit');
const building = runSessionContact('building');
const tower = runSessionContact('tower');
console.log(JSON.stringify({
  rl: { seed, actionId: action.id, legal: observation.actionMask[action.id],
    cardId: 'kilnkeeper', spend: play.spend.cost, cycleAdvance: 1,
    tick: result.observation.tick },
  selectorBoundary: { includedAt1500: targets.map(({ id }) => id), excluded: [1, 2, 4, 5, 6] },
  contacts: [unit, building, tower],
}, null, 2));
