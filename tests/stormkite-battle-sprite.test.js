import assert from "node:assert/strict";
import test from "node:test";

import {
  createStormkiteBattleArt,
  getStormkiteBattleFrame,
  updateStormkiteBattleArt,
} from "../src/ui/stormkite-battle-sprite.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { GameSession } from "../src/sim/game-session.js";
import {
  bindCombatMotion,
  createCombatMotionView,
} from "../src/ui/combat-motion.js";
import {
  bindCombatEffectsViewModel,
  createCombatEffectsViewModel,
  restoreCombatEffectsViewModel,
  serializeCombatEffectsViewModel,
} from "../src/ui/combat-effects.js";

function createTestDocument(reducedMotion = false) {
  let document;
  class Element {
    constructor(tag) {
      this.tagName = tag;
      this.ownerDocument = document;
      this.attributes = new Map();
      this.childNodes = [];
      this.dataset = {};
      this.style = {
        setProperty(name, value) {
          this[name] = String(value);
        },
      };
    }

    appendChild(child) {
      this.childNodes.push(child);
      return child;
    }

    replaceChildren(...children) {
      this.childNodes = children;
    }

    getAttribute(name) {
      return this.attributes.get(name) ?? null;
    }

    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
  }

  document = {
    defaultView: { matchMedia: () => ({ matches: reducedMotion }) },
    createElement: (tag) => new Element(tag),
    createElementNS: (_namespace, tag) => new Element(tag),
  };
  return document;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function stormkiteSession() {
  const deck = ["stormkite", ...PLAYABLE_CARD_IDS.slice(1)];
  const session = new GameSession(createEditableGameSessionSetup(deck, 1));
  const slot = session.state.decks.south.hand.indexOf("stormkite");
  assert.notEqual(slot, -1, "the canonical editable setup opens Stormkite for the player");
  const result = session.submitPlayerCommand(canonical({
    cardId: "stormkite",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
  assert.equal(result.accepted, true);
  return session;
}

function stepToStormkitePrimaryContact(session) {
  for (let elapsed = 0; elapsed < 720; elapsed += 1) {
    const events = session.step();
    if (events.some((event) => event.type === "chain-primary-settled" &&
        event.status === "pending")) return events;
  }
  throw new Error("canonical GameSession did not reach the Stormkite primary contact");
}

function projectSession(session) {
  const snapshot = session.projectionSnapshot();
  const effects = createCombatEffectsViewModel(
    snapshot.combatEffectFeed,
    snapshot.state.tick,
    snapshot.state.battle.projectiles,
    snapshot,
    session,
  );
  return { effects, motion: createCombatMotionView(snapshot, effects), snapshot };
}

function renderStormkiteArt(snapshot, motion, sourceId, reducedMotion) {
  const document = createTestDocument(reducedMotion);
  const source = snapshot.state.battle.units.find(({ id }) => id === sourceId);
  const pose = motion.poses.find(({ id }) => id === sourceId);
  const combat = document.createElement("div");
  const frame = document.createElement("div");
  const marker = document.createElement("div");
  const effects = document.createElement("div");
  const effectFrame = document.createElement("div");
  marker.dataset.combatId = String(sourceId);
  marker.dataset.side = source.side;
  marker.appendChild(createStormkiteBattleArt(document, {
    action: "idle",
    bodyCssPixels: 13,
    direction: pose.spriteDirection,
    side: source.side,
    tick: motion.tick,
  }));
  frame.appendChild(marker);
  combat.appendChild(frame);
  effects.appendChild(effectFrame);
  bindCombatMotion(combat, effects, motion);
  return marker.childNodes[0];
}

function renderCombatImpact(effects, impactKey) {
  const document = createTestDocument();
  const layer = document.createElement("div");
  bindCombatEffectsViewModel(layer, effects);
  return layer.childNodes[0].childNodes.find(({ dataset }) =>
    dataset.effectKey === impactKey);
}

function renderCombatDeath(snapshot, motion, reducedMotion) {
  const document = createTestDocument(reducedMotion);
  const combat = document.createElement("div");
  const frame = document.createElement("div");
  const effects = document.createElement("div");
  const effectFrame = document.createElement("div");
  combat.appendChild(frame);
  effects.appendChild(effectFrame);
  bindCombatMotion(combat, effects, motion);
  const remnant = effectFrame.childNodes.find(({ dataset }) =>
    dataset.deathId !== undefined && dataset.kind === "stormkite");
  assert.ok(snapshot, "the death renderer receives an authentic session projection");
  return remnant;
}

function submitStormkiteJourneyCard(session, commandId, cardId, point) {
  const state = session.state;
  const slot = state.decks.south.hand.indexOf(cardId);
  assert.notEqual(slot, -1, `the canonical seed-nine hand offers ${cardId}`);
  const accepted = session.submitPlayerCommand(canonical({ cardId, commandId, point,
    slot, tick: state.tick, type: "deploy" }));
  assert.equal(accepted.accepted, true,
    `the canonical seed-nine player command for ${cardId} is accepted`);
  return accepted;
}

function assertStormkiteHopImpact(snapshot, effects, sourceId, hopOrdinal, tick) {
  const event = snapshot.replay.filter((record) => record.type === "chain-hop-settled" &&
    record.tick === tick && record.lineage?.hopOrdinal === hopOrdinal &&
    record.lineage.primaryProjectileIdentity.sourceId === sourceId).at(-1);
  assert.ok(event, `canonical replay contains hop ${hopOrdinal} at tick ${tick}`);
  assert.ok(["pending", "complete"].includes(event.status),
    "the hop landed through the canonical structure owner");
  const identity = event.lineage.primaryProjectileIdentity;
  const key = `stormkite-chain-hop:${sourceId}:${identity.attackSequence}:` +
    `${hopOrdinal}:${tick}`;
  const impact = effects.impacts.find((record) => record.key === key);
  assert.ok(impact, "the existing contact flash is projected from the authenticated hop receipt");
  assert.equal(impact.kind, "contact");
  const owners = event.owner.kind === "crown-tower" ? snapshot.state.battle.towers
    : event.owner.kind === "unit" ? snapshot.state.battle.units
      : event.owner.kind === "building" ? snapshot.state.battle.structures : [];
  const target = owners.find(({ id }) => id === event.owner.id);
  assert.ok(target, `the settled ${event.owner.kind} owner has a canonical render position`);
  assert.deepEqual(impact.point, {
    denominator: "1",
    xNumerator: String(target.position.x),
    yNumerator: String(target.position.y),
  });
  return impact;
}

test("Stormkite battle atlas resolves all authored teams, directions and actions", () => {
  const cases = [
    ["north", "ember", 0],
    ["south", "river", 2],
  ];
  for (const [side, team, idleRow] of cases) {
    for (const [column, direction] of ["east", "north", "south", "west"].entries()) {
      const idle = getStormkiteBattleFrame({
        action: "idle", direction, side, tick: 17,
      });
      const contact = getStormkiteBattleFrame({
        action: "contact", direction, side, tick: 18,
      });
      assert.equal(idle.team, team);
      assert.equal(idle.row, idleRow);
      assert.equal(idle.column, column);
      assert.equal(idle.source.x, column * 64);
      assert.equal(idle.source.y, idleRow * 64);
      assert.equal(contact.team, team);
      assert.equal(contact.row, idleRow + 1);
      assert.equal(contact.source.x, column * 64);
      assert.equal(contact.source.y, (idleRow + 1) * 64);
    }
  }
});

test("reduced motion keeps Stormkite on its authored idle cell during contact", () => {
  const frame = getStormkiteBattleFrame({
    action: "contact",
    direction: "west",
    reducedMotion: true,
    side: "south",
    tick: 31,
  });
  assert.equal(frame.action, "idle");
  assert.equal(frame.id, "stormkite-river-west-idle");
  assert.equal(frame.row, 2);
  assert.equal(frame.source.y, 128);
  assert.equal(frame.reducedMotion, true);
});

test("Stormkite battle art displays and updates the original fixed-pivot atlas", () => {
  const document = createTestDocument();
  const art = createStormkiteBattleArt(document, {
    action: "idle",
    bodyCssPixels: 13,
    direction: "north",
    frameScale: 2,
    side: "south",
    tick: 44,
  });
  const atlas = art.childNodes[0];
  assert.equal(art.dataset.artId, "stormkite");
  assert.equal(art.dataset.spriteTeam, "river");
  assert.equal(art.dataset.pivot, "32:54");
  assert.equal(art.style.width, "32px");
  assert.match(atlas.getAttribute("href"), /stormkite-battle-sprite\.png$/u);
  assert.equal(atlas.getAttribute("width"), "256");
  assert.equal(atlas.getAttribute("height"), "256");

  const frame = updateStormkiteBattleArt(art, {
    action: "contact",
    direction: "west",
    reducedMotion: false,
    side: "north",
    tick: 51,
  });
  assert.equal(frame.id, "stormkite-ember-west-contact");
  assert.equal(art.getAttribute("viewBox"), "192 64 64 64");
  assert.equal(art.dataset.spriteDirection, "west");
  assert.equal(art.dataset.spriteTeam, "ember");
  assert.equal(art.dataset.simulationTick, "51");
});

test("Stormkite contact atlas selection follows canonical GameSession contacts and restores", () => {
  const session = stormkiteSession();
  const events = stepToStormkitePrimaryContact(session);
  const source = session.state.battle.units.find(({ cardId, side }) =>
    cardId === "stormkite" && side === "south");
  assert.ok(source, "the real player Stormkite is materialized in the canonical battle");
  assert.ok(events.some((event) => event.type === "chain-primary-settled" &&
    event.status === "pending"),
  "the authentic battle boundary confirms the primary contact and pending hop");

  const checkpoint = session.serialize();
  const projection = projectSession(session);
  const motion = projection.motion;
  const pose = motion.poses.find(({ id }) => id === source.id);
  assert.equal(pose.spriteAction, "contact",
    "the atlas contact cue is projected from the current canonical host contact");
  assert.ok(["east", "north", "south", "west"].includes(pose.spriteDirection));

  const restored = GameSession.restore(checkpoint);
  const restoredProjection = projectSession(restored);
  assert.deepEqual(restoredProjection.effects, projection.effects,
    "the primary projectile contact flash survives authentic session restore");
  assert.deepEqual(restoredProjection.motion, motion,
    "the contact artwork selection is stable after authentic session restore");

  const hopEvents = session.step();
  const hop = hopEvents.find((event) => event.type === "chain-hop-settled" &&
    event.lineage?.primaryProjectileIdentity?.sourceId === source.id);
  assert.equal(hop?.owner?.kind, "unit",
    "the canonical player Stormkite can chain from its first target to an enemy unit");
  const hopProjection = projectSession(session);
  const hopImpact = assertStormkiteHopImpact(
    hopProjection.snapshot, hopProjection.effects, source.id, 1, hop.tick,
  );
  assert.equal(hopImpact.kind, "contact");
  assert.equal(hopProjection.motion.poses.find(({ id }) => id === source.id)?.spriteAction,
    "contact");
  const restoredAfterHop = GameSession.restore(session.serialize());
  const restoredHopProjection = projectSession(restoredAfterHop);
  assert.deepEqual(restoredHopProjection.effects.impacts, hopProjection.effects.impacts,
    "the unit-owned chain contact flash is rederived from the restored canonical replay");
  assert.deepEqual(restoredHopProjection.motion, hopProjection.motion,
    "the unit-owned contact pose survives the same checkpoint restore");
});

test("an unforced north AI Stormkite contact keeps its canonical chain identity and art pose", () => {
  const deck = ["stormkite", ...PLAYABLE_CARD_IDS.slice(1)];
  const setupText = createEditableGameSessionSetup(deck, 9);
  const setup = JSON.parse(setupText);
  assert.deepEqual(setup.deck, deck);
  assert.ok(setup.projectileRuntimeProfiles);
  assert.equal(JSON.parse(setup.battleSetup).chainQuestionPolicy.cardId, "stormkite");

  const session = new GameSession(setupText);
  const contactEvents = session.stepMany(463);
  const serializedAtContact = JSON.parse(session.serialize());
  assert.equal(serializedAtContact.transcript.some(({ type }) => type === "submit"), false,
    "the player sends no commands; the canonical opponent controller chooses Stormkite itself");
  const deployment = contactEvents.find((event) => event.type === "session-deployed" &&
    event.side === "north" && event.deployment.cardId === "stormkite");
  assert.ok(deployment, "the north AI deploys Stormkite from its legal editable deck");
  const sourceId = deployment.deployment.entityIds[0];
  const source = session.state.battle.units.find(({ id }) => id === sourceId);
  assert.equal(source?.cardId, "stormkite");
  assert.equal(source?.side, "north");

  const primary = contactEvents.find((event) => event.type === "chain-primary-settled" &&
    event.status === "pending" &&
    event.lineage?.primaryProjectileIdentity?.sourceId === sourceId);
  assert.ok(primary, "the AI Stormkite reaches a real owner-confirmed primary contact");
  assert.equal(primary.owner?.kind, "crown-tower");
  const launch = contactEvents.find((event) => event.type === "projectile-launch" &&
    event.sourceId === sourceId && event.projectileId ===
      primary.lineage.primaryProjectileIdentity.projectileId);
  assert.ok(launch, "the primary contact follows Stormkite's host-minted projectile");

  const primaryProjection = projectSession(session);
  assert.equal(primaryProjection.effects.impacts.some(({ key }) =>
    key.startsWith("stormkite-chain-hop:")), false,
  "a primary hit does not show a secondary-hop cue before one settles");
  const motion = primaryProjection.motion;
  const pose = motion.poses.find(({ id }) => id === sourceId);
  assert.equal(pose?.spriteAction, "contact",
    "the authentic north AI impact selects Stormkite's contact atlas pose");
  assert.ok(["east", "north", "south", "west"].includes(pose.spriteDirection));
  const towersBeforeHops = session.state.battle.towers;
  const firstHopEvents = session.step();
  assert.ok(firstHopEvents.some((event) => event.type === "chain-hop-settled" &&
    event.status === "pending" && event.tick === 463 &&
    event.lineage?.primaryProjectileIdentity?.sourceId === sourceId));
  const firstHopProjection = projectSession(session);
  const firstImpact = assertStormkiteHopImpact(
    firstHopProjection.snapshot, firstHopProjection.effects, sourceId, 1, 463,
  );
  const firstFlash = renderCombatImpact(firstHopProjection.effects, firstImpact.key);
  assert.equal(firstFlash?.dataset.kind, "contact",
    "the canonical hop receipt mounts the existing visible contact flash");
  assert.equal(firstFlash?.style["--effect-x-num"], firstImpact.point.xNumerator);
  assert.equal(firstFlash?.style["--effect-y-num"],
    String(32_000 - Number(firstImpact.point.yNumerator)),
    "the flash is placed at the typed owner location on the arena");
  const forgedSnapshot = {
    ...firstHopProjection.snapshot,
    replay: firstHopProjection.snapshot.replay.map((event) =>
      event.type === "chain-hop-settled" && event.tick === 463
        ? { ...event, status: "no-owner-decrease" }
        : event),
  };
  assert.throws(() => createCombatEffectsViewModel(
    forgedSnapshot.combatEffectFeed,
    forgedSnapshot.state.tick,
    forgedSnapshot.state.battle.projectiles,
    forgedSnapshot,
    session,
  ), /matching authentic session snapshot/u,
  "forged failed receipts cannot create a chain contact cue");
  const firstHopPose = firstHopProjection.motion.poses.find(({ id }) => id === sourceId);
  assert.equal(firstHopPose?.spriteAction, "contact",
    "the same committed hop boundary selects Stormkite's contact atlas pose");
  const normalArt = renderStormkiteArt(
    firstHopProjection.snapshot, firstHopProjection.motion, sourceId, false,
  );
  const reducedArt = renderStormkiteArt(
    firstHopProjection.snapshot, firstHopProjection.motion, sourceId, true,
  );
  assert.equal(normalArt.dataset.spriteAction, "contact");
  assert.equal(normalArt.getAttribute("viewBox").split(" ")[1], "64");
  assert.equal(reducedArt.dataset.spriteAction, "idle");
  assert.equal(reducedArt.getAttribute("viewBox").split(" ")[1], "0",
    "reduced motion holds the authored idle cell instead of blinking on contact");

  const checkpoint = session.serialize();
  for (const branch of [GameSession.restore(checkpoint), session.fork()]) {
    const projection = projectSession(branch);
    assert.deepEqual(projection.effects.impacts, firstHopProjection.effects.impacts,
      "the canonical hop flash restores and forks at the exact committed tick");
    assert.deepEqual(projection.motion, firstHopProjection.motion,
      "the contact pose survives exact session restore and fork");
    assert.equal(assertStormkiteHopImpact(
      projection.snapshot, projection.effects, sourceId, 1, 463,
    ).key, firstImpact.key);
    const effectBytes = serializeCombatEffectsViewModel(projection.effects);
    assert.deepEqual(restoreCombatEffectsViewModel(
      effectBytes,
      projection.snapshot.state.battle.projectiles,
      projection.snapshot,
      branch,
    ), projection.effects,
    "the contact view also serializes and restores from the authentic session snapshot");
    const restoredNormal = renderStormkiteArt(
      projection.snapshot, projection.motion, sourceId, false,
    );
    const restoredReduced = renderStormkiteArt(
      projection.snapshot, projection.motion, sourceId, true,
    );
    assert.equal(restoredNormal.getAttribute("viewBox"), normalArt.getAttribute("viewBox"));
    assert.equal(restoredReduced.getAttribute("viewBox"), reducedArt.getAttribute("viewBox"));
  }

  const secondHopEvents = session.step();
  assert.ok(secondHopEvents.some((event) => event.type === "chain-hop-settled" &&
    event.status === "complete" && event.tick === 464 &&
    event.lineage?.primaryProjectileIdentity?.sourceId === sourceId));
  const secondHopProjection = projectSession(session);
  const secondImpact = assertStormkiteHopImpact(
    secondHopProjection.snapshot, secondHopProjection.effects, sourceId, 2, 464,
  );
  assert.notEqual(secondImpact.key, firstImpact.key,
    "a later hop receives a new contact cue at its own committed boundary");
  assert.equal(secondHopProjection.effects.impacts.some(({ key }) => key === firstImpact.key), false,
    "the first hop flash is not retained on the next simulation boundary");
  assert.equal(secondHopProjection.motion.poses.find(({ id }) => id === sourceId)?.spriteAction,
    "contact", "the later authentic hop can select another contact pose");

  const hopEvents = [...firstHopEvents, ...secondHopEvents];
  const hops = hopEvents.filter((event) => event.type === "chain-hop-settled" &&
    event.lineage?.primaryProjectileIdentity?.sourceId === sourceId);
  assert.deepEqual(hops.map(({ status }) => status), ["pending", "complete"],
    "the AI contact proceeds through the authentic delayed chain to completion");
  const damage = hopEvents.filter((event) => event.type === "external-structure-contact" &&
    event.sourceId?.startsWith(`chain:${sourceId}:`));
  assert.ok(damage.length > 0, "the unforced AI chain reaches canonical damage owners");
  assert.ok(damage.every((event) => event.damage === 192 && event.delivery === "building"));
  for (const event of damage) {
    const before = towersBeforeHops.find(({ id }) => id === event.structureId);
    const after = session.state.battle.towers.find(({ id }) => id === event.structureId);
    assert.equal(before.hitpoints - after.hitpoints, event.damage,
      `${event.structureId} loses the exact contact damage through the canonical owner`);
  }
});

test("canonical Stormkite death renders retained team art without a live hit identity", () => {
  const deck = ["stormkite", ...PLAYABLE_CARD_IDS.slice(1)];
  const session = new GameSession(createEditableGameSessionSetup(deck, 9));
  session.stepMany(300);
  submitStormkiteJourneyCard(session, 1, "reedsting", { x: 3_500, y: 5_500 });
  session.stepMany(300);
  submitStormkiteJourneyCard(session, 2, "cinderlings", { x: 3_500, y: 5_500 });
  session.stepMany(15);
  submitStormkiteJourneyCard(session, 3, "stormkite", { x: 3_500, y: 14_500 });
  assert.ok(session.step().some((event) => event.type === "session-deployed" &&
    event.side === "south" && event.deployment.cardId === "stormkite"),
  "the accepted player command materializes Stormkite in the canonical battle");

  const stormkiteDeployments = session.replay.filter((event) =>
    event.type === "session-deployed" && event.deployment.cardId === "stormkite")
  const stormkiteIds = new Set(stormkiteDeployments.flatMap((event) => event.deployment.entityIds));
  assert.ok(stormkiteDeployments.some(({ side }) => side === "north"),
    "the canonical opponent AI deploys its own Stormkite without player commands");
  assert.ok(stormkiteDeployments.some(({ side }) => side === "south"),
    "the canonical player command deploys the player Stormkite");
  let death = null;
  for (let elapsed = 0; elapsed < 3_000 && !session.state.terminal; elapsed += 1) {
    death = session.step().find((event) =>
      event.type === "death" && stormkiteIds.has(event.targetId)) ?? null;
    if (death !== null) break;
  }
  assert.ok(death, "a real canonical combat boundary kills one of the deployed Stormkites");
  const dead = session.state.battle.units.find(({ id }) => id === death.targetId);
  assert.equal(dead?.cardId, "stormkite");
  assert.equal(dead?.alive, false);
  assert.equal(dead?.hitpoints, 0);

  const checkpoint = session.serialize();
  const original = projectSession(session);
  const restoredSession = GameSession.restore(checkpoint);
  const restored = projectSession(restoredSession);
  assert.deepEqual(restored.motion, original.motion,
    "the authentic death remnant is rederived from the restored canonical replay");
  assert.deepEqual(restored.effects, original.effects,
    "the death presentation uses the exact restored canonical effect feed");

  for (const [projection, reducedMotion] of [
    [original, false], [original, true], [restored, false], [restored, true],
  ]) {
    const remnant = renderCombatDeath(
      projection.snapshot, projection.motion, reducedMotion,
    );
    assert.ok(remnant, "the real Stormkite death binds an atlas-backed remnant");
    assert.equal(remnant.dataset.deathId, String(death.targetId));
    assert.equal(remnant.dataset.deathTick, String(death.tick));
    assert.equal(remnant.dataset.kind, "stormkite");
    assert.equal(remnant.dataset.side, dead.side);
    assert.equal(remnant.dataset.combatId, undefined,
      "a visual corpse does not preserve a live combat identity");
    assert.equal(remnant.dataset.targetId, undefined,
      "a visual corpse cannot remain a target identity");
    const art = remnant.childNodes[0];
    assert.equal(art.dataset.artId, "stormkite",
      "normal and reduced motion both retain the original Stormkite atlas art");
    assert.equal(art.dataset.spriteTeam, dead.side === "north" ? "ember" : "river");
    assert.equal(art.dataset.combatId, undefined);
    assert.equal(art.dataset.targetId, undefined);
    assert.match(art.childNodes[0].getAttribute("href"),
      /stormkite-battle-sprite\.png$/u);
  }
});
