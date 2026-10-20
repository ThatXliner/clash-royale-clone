import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "./candidate-files/src/content/playable-roster.js";
import { projectSessionNonUnitBattleCard } from "./candidate-files/src/content/session-card-catalog.js";
import { createSessionSpellProfileReceipts } from "./candidate-files/src/content/session-spell-profile-receipts.js";
import {
  createStormkiteChainQuestionHostPolicy,
  LiveBattle,
} from "./candidate-files/src/sim/live-battle.js";
import { createSessionTroopWitness } from "./candidate-files/src/content/session-troop-roster.js";
import {
  createSessionTroopProjectileProfileManifest,
  serializeSessionTroopProjectileProfileManifest,
} from "./candidate-files/src/content/session-troop-projectile-profiles.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function questionInventory(roster, supplemental = []) {
  const referenced = new Set();
  const visit = (value) => {
    if (Array.isArray(value)) value.forEach(visit);
    else if (value !== null && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (key === "questionKey" && typeof child === "string") referenced.add(child);
        else visit(child);
      }
    }
  };
  roster.filter(({ kind }) => kind === "unit").forEach(({ entities }) => visit(entities));
  const available = new Map([...createPlayableRosterQuestionRecords(), ...supplemental]
    .map((record) => [record.key, record]));
  return [...referenced].sort().map((key) => {
    const record = available.get(key);
    if (!record) throw new Error(`missing question receipt ${key}`);
    return record;
  });
}

const witness = createSessionTroopWitness("stormkite");
const roster = clone(witness.roster);
roster[1] = clone(projectSessionNonUnitBattleCard("bulwark-needle"));
roster[7] = clone(projectSessionNonUnitBattleCard("squall-orb"));
const setup = {
  initialWindupTicks: { central: 10_000, lane: 10_000 },
  questions: questionInventory(roster, [...witness.questions]),
  roster,
  spellProfileReceipts: createSessionSpellProfileReceipts(),
};
const battle = new LiveBattle(canonical(setup), undefined, undefined,
  serializeSessionTroopProjectileProfileManifest(),
  createStormkiteChainQuestionHostPolicy());

// This fixture keeps the primary attacker/target hostile. A friendly unit and
// friendly structure are staged on the north side; a farther south structure
// remains hostile. Positions are deliberately observable at the actual hop
// boundary because troop movement may shift the centers after staging.
battle.scheduleDeploy(canonical({ cardId: "stormkite", point: { x: 3_500, y: 17_500 },
  sequence: 0, side: "north", tick: 0 }));
battle.scheduleDeploy(canonical({ cardId: "mossguard", point: { x: 3_500, y: 14_700 },
  sequence: 1, side: "south", tick: 0 }));
battle.scheduleDeploy(canonical({ cardId: "mossguard", point: { x: 3_500, y: 17_300 },
  sequence: 2, side: "north", tick: 0 }));
battle.scheduleStructure({ cardId: "bulwark-needle", destination: null,
  point: { x: 3_500, y: 12_500 }, sequence: 3, side: "south", tick: 0 });
battle.scheduleStructure({ cardId: "bulwark-needle", destination: null,
  point: { x: 3_500, y: 17_001 }, sequence: 4, side: "north", tick: 0 });
battle.step();

let primary = null;
for (let elapsed = 0; elapsed < 1_200 && primary === null; elapsed += 1) {
  const events = battle.step();
  primary = events.find(({ type }) => type === "chain-primary-contact") ?? null;
}
if (!primary) throw new Error("bounded fixture produced no actual Stormkite primary contact");

const entityDetails = () => ({
  units: battle.state.units.map(({ alive, cardId, hitpoints, id, position, side, targetable }) =>
    ({ alive, cardId, hitpoints, id, position, side, targetable, kind: "unit" })),
  structures: battle.state.structures.map(({ alive, cardId, hitpoints, id, position, side, targetable }) =>
    ({ alive, cardId, hitpoints, id, position, side, targetable, kind: "building" })),
  towers: battle.state.towers.map(({ hitpoints, id, position, role, side }) =>
    ({ alive: hitpoints > 0, hitpoints, id, position, role, side, kind: "crown-tower" })),
});
const before = entityDetails();
const stateBeforeHop = battle.state;
const pendingBefore = JSON.parse(JSON.parse(battle.serialize()).chainRuntime).state.pending
  .find(({ identity }) => canonical(identity) === canonical(primary.identity));
const events = battle.step();
const hop = events.find(({ hop: index, type }) => index === 2 && type === "chain-hop-contact");
const after = entityDetails();
const allBefore = [...before.units, ...before.structures, ...before.towers];
const allAfter = [...after.units, ...after.structures, ...after.towers];
const selectedBefore = hop ? allBefore.find(({ id, kind }) => id === hop.target.id && kind === hop.target.type) : null;
const selectedAfter = hop ? allAfter.find(({ id, kind }) => id === hop.target.id && kind === hop.target.type) : null;
const primaryTarget = [...before.units, ...before.structures, ...before.towers]
  .find(({ id, kind }) => id === primary.target.id && kind === primary.target.type);
const origin = pendingBefore?.origin ?? null;
const distance = (entity) => origin === null ? null : Math.round(Math.hypot(
  entity.position.x - origin.position.x, entity.position.y - origin.position.y));
const nearby = allBefore.map((entity) => ({
  ...entity,
  distanceFromPrimaryOrigin: distance(entity),
})).sort((left, right) => left.distanceFromPrimaryOrigin - right.distanceFromPrimaryOrigin ||
  String(left.side).localeCompare(String(right.side)));
const eligibleCompetitors = nearby.filter(({ alive, id, kind, targetable }) => alive && targetable !== false &&
  !(kind === primary.target.type && id === primary.target.id));
const nearestEligibleFriendly = eligibleCompetitors.find(({ side }) => side === "north") ?? null;
const nearestEligibleHostile = eligibleCompetitors.find(({ side }) => side === "south") ?? null;
const result = {
  classification: !hop ? "NO_HOP_CONTACT" : selectedBefore?.side === "north"
    ? "FRIENDLY_CONTACT" : selectedBefore?.side === "south" ? "HOSTILE_CONTACT" : "UNKNOWN_TARGET_SIDE",
  primary: { identity: primary.identity, target: primary.target, targetSide: primaryTarget?.side ?? null,
    targetHitpointsBeforeHop: primaryTarget?.hitpoints ?? null, tick: primary.tick },
  hop: hop ? { target: hop.target, outcome: hop.outcome, tick: hop.tick,
    targetSide: selectedBefore?.side ?? null,
    hitpointsBefore: selectedBefore?.hitpoints ?? null,
    hitpointsAfter: selectedAfter?.hitpoints ?? null,
    hpDelta: selectedBefore && selectedAfter ? selectedBefore.hitpoints - selectedAfter.hitpoints : null } : null,
  nearbyCandidatesAtHopStart: nearby,
  nearestEligibleFriendly,
  nearestEligibleHostile,
  crownsNearPrimaryOrigin: nearby.filter(({ kind }) => kind === "crown-tower"),
  beforeTick: stateBeforeHop.tick,
  afterTick: battle.state.tick,
  hostEvents: events.filter(({ type }) => ["chain-hop-contact", "damage", "structure-damaged",
    "external-unit-contact", "external-structure-contact"].includes(type)),
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
