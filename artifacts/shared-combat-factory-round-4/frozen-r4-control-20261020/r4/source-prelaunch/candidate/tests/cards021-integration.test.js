import assert from "node:assert/strict";
import test from "node:test";

import { EDITABLE_DECK_CARD_IDS } from "../src/content/session-troop-roster.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession, getGameSessionAudioReplay } from "../src/sim/game-session.js";
import { createCombatEffectsViewModel } from "../src/ui/combat-effects.js";
import { createCombatMotionView } from "../src/ui/combat-motion.js";
import { createGameUiFrame } from "../src/ui/game-ui-projection.js";

const SOUTH = Object.freeze({ x: 3_500, y: 14_500 });
const NORTH = Object.freeze({ x: 3_500, y: 17_500 });
const BURIED_COIL = "buried-coil";
const DECK = Object.freeze([
  BURIED_COIL,
  "mossguard",
  "duskwing-trio",
  "coilblade",
  "copperskiff",
  "skymaul",
  "brassbolt",
  "reedsting",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function seedForHands(deck, southCardId, northCardId) {
  for (let seed = 0; seed < 1_000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes(southCardId) && north.includes(northCardId)) return seed;
  }
  throw new Error(`no bounded seeded starting-hand witness for ${southCardId}/${northCardId}`);
}

function sessionSetup(seed, { deck = DECK, legalNorthCardId = null,
  thinkIntervalTicks = 3_600 } = {}) {
  const setup = JSON.parse(createEditableGameSessionSetup(deck, seed));
  setup.legalNorthDeployments = legalNorthCardId === null ? [] : [{
    cardId: legalNorthCardId,
    point: NORTH,
  }];
  setup.thinkIntervalTicks = thinkIntervalTicks;
  setup.thinkOffsetTicks = 0;
  return canonical(setup);
}

function deployPlayerCard(session, cardId, commandId = 0) {
  const slot = session.state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `${cardId} has to be in the authentic player hand`);
  return session.submitPlayerCommand(canonical({
    cardId,
    commandId,
    point: SOUTH,
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
}

function stepUntil(session, predicate, maxTicks, label) {
  for (let stepped = 0; stepped < maxTicks && !predicate(); stepped += 1) {
    session.step();
  }
  assert.ok(predicate(), `${label} did not occur within ${maxTicks} real session ticks`);
}

test("Buried Coil custom eight-card GameSession deploys, spends once, reveals, and contacts ground and air", () => {
  for (const targetCardId of ["mossguard", "duskwing-trio"]) {
    const seed = seedForHands(DECK, BURIED_COIL, targetCardId);
    const session = new GameSession(sessionSetup(seed, {
      legalNorthCardId: targetCardId,
      thinkIntervalTicks: 1,
    }));
    const before = session.state;
    assert.deepEqual(deployPlayerCard(session, BURIED_COIL), {
      accepted: true,
      commandId: 0,
      tick: 0,
      type: "player-command-admitted",
    });
    const initialBoundary = session.step();
    const afterDeploy = session.state;
    const coil = afterDeploy.battle.structures.find(({ cardId, side }) =>
      cardId === BURIED_COIL && side === "south");
    assert.ok(coil?.alive, `${targetCardId}: shared GameSession materializes the selected building`);
    assert.equal(afterDeploy.decks.south.sequence, before.decks.south.sequence + 1,
      `${targetCardId}: the player deck cycles exactly once`);
    assert.equal(afterDeploy.elixir.sides.south.amount, before.elixir.sides.south.amount - 4,
      `${targetCardId}: the player pays the existing four-elixir card cost once`);
    assert.equal(afterDeploy.cardRuntime.history.filter(({ cardId, side }) =>
      cardId === BURIED_COIL && side === "south").length, 1);
    assert.equal(session.replay.filter(({ materialization, side, type }) =>
      type === "session-structure-deployed" && side === "south" &&
      materialization.cardId === BURIED_COIL).length, 1);
    assert.ok(initialBoundary.some(({ cardId, side, type }) =>
      type === "structure-materialized" && side === "south" && cardId === BURIED_COIL));

    const aiTarget = afterDeploy.battle.units.find(({ cardId, side }) =>
      cardId === targetCardId && side === "north");
    assert.ok(aiTarget?.alive, `${targetCardId}: the actual seeded opponent deploys its legal hand card`);
    assert.equal(session.replay.filter(({ deployment, side, type }) =>
      type === "session-deployed" && side === "north" &&
      deployment.cardId === targetCardId).length, 1);

    const checkpoint = session.serialize();
    const left = GameSession.restore(checkpoint);
    const right = GameSession.restore(checkpoint);
    assert.equal(left.serialize(), checkpoint);
    assert.equal(right.serialize(), checkpoint);
    const leftEvents = left.stepMany(103);
    const rightEvents = right.stepMany(103);
    assert.deepEqual(leftEvents, rightEvents,
      `${targetCardId}: two authenticated restores independently continue the same battle branch`);
    assert.equal(left.serialize(), right.serialize());
    assert.equal(left.replayBytes(), right.replayBytes());

    const attack = left.replay.find(({ buildingId, type }) =>
      buildingId === coil.id && type === "structure-attack");
    assert.ok(attack, `${targetCardId}: the real building reducer resolves an attack`);
    assert.equal(attack.amount, 230, "the current runtime estimate is used without confidence promotion");
    const contactedTarget = left.state.battle.units.find(({ id }) => id === attack.targetId);
    assert.equal(contactedTarget?.cardId, targetCardId);
    assert.equal(contactedTarget?.side, "north");
    assert.equal(contactedTarget?.layer, targetCardId === "mossguard" ? "ground" : "air");
    const reveal = left.replay.find(({ buildingId, type }) =>
      buildingId === coil.id && type === "building-revealed");
    assert.ok(reveal, `${targetCardId}: contact flow reveals the actual hidden building`);
    assert.equal(left.state.battle.structures.find(({ id }) => id === coil.id).hidden, false);
    const sourcePolicy = left.state.battle.structures.find(({ id }) => id === coil.id).policy;
    assert.equal(sourcePolicy.disposition, "question");
    assert.equal(sourcePolicy.confidence, "unverified");
    assert.equal(sourcePolicy.corpusFields.damage.authoritative, false);
    assert.equal(sourcePolicy.corpusFields.damage.confidence, "unverified");
  }
});

function assertBuriedCoilDirectContact({ cardId, deck = DECK, layer, lethal }) {
  const seed = seedForHands(deck, BURIED_COIL, cardId);
  const session = new GameSession(sessionSetup(seed, {
    deck,
    legalNorthCardId: cardId,
    thinkIntervalTicks: 1,
  }));
  deployPlayerCard(session, BURIED_COIL);
  session.step();

  const coil = session.state.battle.structures.find(({ cardId, side }) =>
    cardId === BURIED_COIL && side === "south");
  assert.ok(coil, `${cardId}: the real Coil structure remains in shared battle state`);
  stepUntil(session, () => session.replay.some(({ buildingId, type }) =>
    buildingId === coil.id && type === "structure-attack"), 1_200,
  `${cardId}: the real Buried Coil launch`);
  const attacks = session.replay.filter(({ buildingId, type }) =>
    buildingId === coil.id && type === "structure-attack");
  const attack = attacks[0];
  const failureContext = attack === undefined ? JSON.stringify({
    coil: {
      alive: coil.alive,
      hidden: coil.hidden,
      hitpoints: coil.hitpoints,
      id: coil.id,
      targetKey: coil.targetKey,
      targetable: coil.targetable,
    },
    misses: session.replay.filter(({ sourceId, type }) =>
      sourceId === coil.id && type === "building-contact-missed"),
    northDeployments: session.replay.filter(({ deployment, side, type }) =>
      side === "north" && type === "session-deployed" &&
      deployment.cardId === cardId),
    tick: session.state.tick,
    units: session.state.battle.units.map(({ alive, cardId: unitCardId, hitpoints, id,
      layer: unitLayer, position, side, targetable }) => ({ alive, cardId: unitCardId,
      hitpoints, id, layer: unitLayer, position, side, targetable })),
  }) : "";
  assert.ok(attack, `${cardId}: the real Buried Coil launches its first queued hit ${failureContext}`);
  const isCoilDamage = ({ externalSourceId, targetId, type }) =>
    type === "damage" && externalSourceId === `building:${attack.buildingId}` &&
    targetId === attack.targetId;
  stepUntil(session, () => session.replay.some(({ externalSourceId, targetId, tick, type }) =>
    isCoilDamage({ externalSourceId, targetId, type }) && tick === attack.tick + 1), 2,
  `${cardId}: the queued next-boundary damage`);
  const damageHistory = () => session.replay.filter(isCoilDamage);
  const firstDamage = damageHistory()[0];
  assert.ok(firstDamage, `${cardId}: the admitted next-boundary contact applies real unit damage`);
  assert.equal(firstDamage.tick, attack.tick + 1);
  assert.equal(firstDamage.amount, attack.amount);
  assert.equal(firstDamage.currentHealthAfter, Math.max(0,
    firstDamage.currentHealthBefore - firstDamage.amount));
  if (lethal) {
    assert.ok(firstDamage.currentHealthAfter > 0,
      `${cardId}: the first authentic structure contact is nonlethal`);
    stepUntil(session, () => damageHistory().some(({ currentHealthAfter, tick }) =>
      tick > firstDamage.tick && currentHealthAfter === 0), 1_200,
    `${cardId}: a later authentic structure contact kills the previously damaged air target`);
  }
  const damage = lethal
    ? damageHistory().find(({ currentHealthAfter, tick }) =>
      tick > firstDamage.tick && currentHealthAfter === 0)
    : firstDamage;
  assert.ok(damage, `${cardId}: the selected actual contact resolves its intended outcome`);
  assert.equal(damage.currentHealthAfter, Math.max(0,
    damage.currentHealthBefore - damage.amount));
  assert.equal(damage.currentHealthAfter === 0, lethal,
    `${cardId}: the selected direct-contact record covers the intended ${lethal ? "lethal" : "nonlethal"} clamp`);
  const targetUnit = session.state.battle.units.find(({ id }) => id === attack.targetId);
  const damageAudit = damageHistory().map(({ amount, currentHealthAfter, currentHealthBefore,
    externalSourceId, targetId, tick }) => ({ amount, currentHealthAfter, currentHealthBefore,
    externalSourceId, sourceSide: coil.side, targetId, targetSide: targetUnit?.side ?? null, tick }));
  console.log(`${cardId}: authentic Buried Coil damage history ${JSON.stringify(damageAudit)}`);

  const projection = session.projectionSnapshot();
  if (lethal) {
    const firstRoot = projection.combatEffectFeed.records.find(({ phase, tick, type, payload }) =>
      phase === "open" && type === "contact" && tick === firstDamage.tick &&
      payload.sourceId === attack.buildingId && payload.targetId === attack.targetId);
    assert.ok(firstRoot, `${cardId}: the first nonlethal attack has its own authenticated contact root`);
    assert.deepEqual(projection.combatEffectFeed.records.filter(({ rootId }) =>
      rootId === firstRoot.rootId).map(({ phase }) => phase),
    ["open", "contact", "damage", "close"],
    `${cardId}: the first air contact closes as nonlethal before the later kill`);
  }
  const root = projection.combatEffectFeed.records.find(({ phase, tick, type }) =>
    phase === "open" && type === "contact" && tick === damage.tick);
  assert.ok(root, `${cardId}: actual structure contact receives a direct-contact root`);
  const targetPosition = session.state.battle.units.find(({ id }) => id === attack.targetId).position;
  assert.deepEqual(root.payload.point, {
    denominator: "1",
    xNumerator: String(targetPosition.x),
    yNumerator: String(targetPosition.y),
  });
  assert.equal(root.payload.sourceId, attack.buildingId);
  assert.equal(root.payload.targetId, attack.targetId);
  assert.match(root.payload.sequence, new RegExp(`^${damage.tick}:(0|[1-9][0-9]*)$`, "u"));
  const causalRecords = projection.combatEffectFeed.records.filter(({ rootId }) =>
    rootId === root.rootId);
  assert.deepEqual(causalRecords.map(({ phase }) => phase), lethal
    ? ["open", "contact", "damage", "death", "close"]
    : ["open", "contact", "damage", "close"]);
  assert.deepEqual(causalRecords.find(({ phase }) => phase === "damage").payload, {
    amount: damage.amount,
    currentHealthAfter: damage.currentHealthAfter,
    currentHealthBefore: damage.currentHealthBefore,
    targetId: damage.targetId,
  });

  const applyBoundaryEffects = createCombatEffectsViewModel(
    projection.combatEffectFeed, damage.tick,
  );
  const contactRecord = causalRecords.find(({ phase }) => phase === "contact");
  const boundaryImpacts = applyBoundaryEffects.impacts.filter(({ key, kind, sourceSequence }) =>
    kind === "contact" && key === `${root.rootId}:contact:${contactRecord.eventId}` &&
    sourceSequence === root.payload.sequence);
  assert.equal(boundaryImpacts.length, 1,
    `${cardId}: direct contact produces one point-impact visual at its apply boundary`);
  const cursorEffects = createCombatEffectsViewModel(
    projection.combatEffectFeed, session.state.tick,
  );
  assert.equal(session.state.tick, damage.tick + 1,
    `${cardId}: the real browser frame advances one cursor beyond the canonical contact tick`);
  assert.equal(cursorEffects.impacts.some(({ key }) => key.startsWith(`${root.rootId}:`)), false,
    `${cardId}: the feed view does not duplicate the contact at the post-step cursor`);
  const expectedResidualKey = `${root.rootId}:${contactRecord.payload.point.xNumerator}:${contactRecord.payload.point.yNumerator}:${contactRecord.payload.point.denominator}`;
  const motionAtCursor = createCombatMotionView(projection, cursorEffects);
  const contactResiduals = motionAtCursor.residuals.filter(({ key }) => key === expectedResidualKey);
  assert.equal(contactResiduals.length, 1,
    `${cardId}: the existing authenticated motion residual is the single post-step point impact`);
  assert.deepEqual(contactResiduals[0], {
    key: expectedResidualKey,
    kind: "contact",
    point: contactRecord.payload.point,
    tick: damage.tick,
  });
  assert.equal(cursorEffects.paths.some(({ key }) => key.includes(root.rootId)), false,
    `${cardId}: a direct contact never projects a moving path`);
  assert.equal(cursorEffects.projectiles.some(({ key }) => key.includes(root.rootId)), false,
    `${cardId}: a direct contact never projects a physical projectile`);

  const frame = createGameUiFrame(session);
  assert.ok(frame.combat.events.some(({ entityId, tick, type }) =>
    entityId === attack.targetId && tick === damage.tick && type === "damage"),
  `${cardId}: the normal combat projection carries the target damage reaction`);
  assert.deepEqual(frame.effects.events, projection.combatEffectFeed.records,
    `${cardId}: visible effects derive from the authenticated feed`);
  const audio = getGameSessionAudioReplay(session);
  assert.ok(audio.some(({ amount, externalSourceId, targetId, tick, type }) =>
    type === "damage" && amount === damage.amount &&
    externalSourceId === `building:${attack.buildingId}` &&
    targetId === attack.targetId && tick === damage.tick),
  `${cardId}: the original damage event continues to drive audio`);

  const serialized = session.serialize();
  const restored = GameSession.restore(serialized);
  assert.equal(restored.serialize(), serialized, `${cardId}: the hit checkpoint restores exactly`);
  assert.deepEqual(restored.projectionSnapshot().combatEffectFeed,
    projection.combatEffectFeed, `${cardId}: direct contact effects restore exactly`);
  const restoredFrame = createGameUiFrame(restored);
  const restoredMotion = createCombatMotionView(restored.projectionSnapshot(), restoredFrame.effects);
  assert.deepEqual(restoredFrame.effects.impacts, cursorEffects.impacts,
    `${cardId}: exact restore does not duplicate the post-contact impact`);
  assert.deepEqual(restoredMotion.residuals.filter(({ key }) => key === expectedResidualKey),
    contactResiduals, `${cardId}: the single point impact reappears identically after exact restore`);
  assert.deepEqual(getGameSessionAudioReplay(restored), audio,
    `${cardId}: original audio events remain restore-exact`);
  session.stepMany(4);
  restored.stepMany(4);
  assert.equal(restored.serialize(), session.serialize(),
    `${cardId}: live and restored branches continue identically`);
  const liveBranchFrame = createGameUiFrame(session);
  const restoredBranchFrame = createGameUiFrame(restored);
  const liveBranchMotion = createCombatMotionView(session.projectionSnapshot(), liveBranchFrame.effects);
  const restoredBranchMotion = createCombatMotionView(restored.projectionSnapshot(), restoredBranchFrame.effects);
  assert.deepEqual(restoredBranchFrame.effects.impacts, liveBranchFrame.effects.impacts,
    `${cardId}: forked branches project the same post-contact effects`);
  assert.deepEqual(restoredBranchMotion.residuals, liveBranchMotion.residuals,
    `${cardId}: forked branches project the same authenticated contact residuals`);
  session.stepMany(4);
  restored.stepMany(4);
  const expiredLiveFrame = createGameUiFrame(session);
  const expiredRestoredFrame = createGameUiFrame(restored);
  const expiredLiveMotion = createCombatMotionView(session.projectionSnapshot(), expiredLiveFrame.effects);
  const expiredRestoredMotion = createCombatMotionView(restored.projectionSnapshot(), expiredRestoredFrame.effects);
  assert.equal(expiredLiveMotion.residuals.some(({ key }) => key === expectedResidualKey), false,
    `${cardId}: the direct point residual expires after its bounded display lifetime`);
  assert.deepEqual(expiredRestoredMotion.residuals, expiredLiveMotion.residuals,
    `${cardId}: restored branches expire the residual at the same deterministic cursor`);
  assert.deepEqual(getGameSessionAudioReplay(restored), getGameSessionAudioReplay(session));
}

test("Buried Coil ground contact feeds actual Mossguard damage, hit reaction, audio, and restore", () => {
  assertBuriedCoilDirectContact({ cardId: "mossguard", layer: "ground", lethal: false });
});

test("Buried Coil air contact feeds actual Copperskiff damage, hit reaction, audio, and restore", () => {
  assertBuriedCoilDirectContact({ cardId: "copperskiff", layer: "air", lethal: true });
});

test("seeded AI deploys Buried Coil through its custom deck and preserves hidden lifetime on restore", () => {
  const seed = seedForHands(DECK, "mossguard", BURIED_COIL);
  const setup = sessionSetup(seed, {
    legalNorthCardId: BURIED_COIL,
    thinkIntervalTicks: 3_600,
  });
  const session = new GameSession(setup);
  const before = session.state;
  const events = session.step();
  const coil = session.state.battle.structures.find(({ cardId, side }) =>
    cardId === BURIED_COIL && side === "north");
  assert.ok(coil?.alive, "seeded AI materializes Buried Coil through ordinary GameSession admission");
  assert.equal(session.state.decks.north.sequence, before.decks.north.sequence + 1);
  assert.equal(session.state.elixir.sides.north.amount, before.elixir.sides.north.amount - 4);
  assert.equal(session.replay.filter(({ materialization, side, type }) =>
    type === "session-structure-deployed" && side === "north" &&
    materialization.cardId === BURIED_COIL).length, 1);
  assert.ok(events.some(({ cardId, side, type }) =>
    type === "structure-materialized" && side === "north" && cardId === BURIED_COIL));
  assert.equal(coil.hidden, true, "without an eligible target the hidden building remains concealed");
  assert.equal(coil.targetable, false);
});

test("Buried Coil hidden state and provisional lifetime survive an actual pre-expiry restore", () => {
  const seed = seedForHands(DECK, BURIED_COIL, "mossguard");
  const session = new GameSession(sessionSetup(seed));
  deployPlayerCard(session, BURIED_COIL);
  session.step();
  const [coil] = session.state.battle.structures;
  assert.equal(coil.cardId, BURIED_COIL);
  assert.equal(coil.alive, true);
  assert.equal(coil.hidden, true, "without an eligible enemy the actual structure starts concealed");
  assert.equal(coil.targetable, false);

  session.stepMany(1_799);
  assert.equal(session.state.tick, 1_800);
  const preExpiry = session.serialize();
  const restored = GameSession.restore(preExpiry);
  assert.equal(restored.serialize(), preExpiry,
    "the actual hidden structure and its causal lifetime transcript restore exactly before expiry");
  const terminalBoundary = session.step();
  assert.deepEqual(restored.step(), terminalBoundary);
  assert.equal(restored.serialize(), session.serialize());
  const expired = session.state.battle.structures.find(({ id }) => id === coil.id);
  assert.equal(expired.alive, false);
  assert.equal(expired.deathCause, "expiry");
  assert.ok(session.replay.some(({ buildingId, reason, type }) =>
    type === "structure-destroyed" && buildingId === coil.id && reason === "lifetime"));
});
