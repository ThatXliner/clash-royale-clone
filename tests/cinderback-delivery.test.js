import assert from "node:assert/strict";
import test from "node:test";

import { createRecoilSpecialCatalog } from "../src/content/cards/special-movement-recoil.js";
import {
  createSessionTroopWitness,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import { DeckCycle } from "../src/sim/deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { LiveBattle } from "../src/sim/live-battle.js";

const SOUTH = { x: 3_500, y: 14_500 };
const NORTH = { x: 3_500, y: 17_500 };

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function questionsFor(witness, id) {
  return new Map(witness.questions.filter(({ key }) => key.startsWith(`${id}.`))
    .map((record) => [record.key, record]));
}

test("Cinderback ordinary delivery uses projectile QUESTION policies and preserves unknown damage", () => {
  const source = createRecoilSpecialCatalog().find(({ id }) => id === "cinderback");
  const card = projectSessionTroopBattleCard("cinderback");
  const entity = card.entities[0];
  const questions = questionsFor(createSessionTroopWitness("cinderback"), "cinderback");
  assert.equal(source.damage, null);
  assert.equal(card.damage, null);
  assert.equal(entity.damage, null);
  assert.equal(entity.delivery, "projectile");
  assert.deepEqual(entity.deliveryPolicy, { kind: "question", questionKey: "cinderback.delivery" });
  assert.deepEqual(entity.projectileSpeedPolicy, {
    kind: "question", questionKey: "cinderback.projectile-speed-millitiles-per-tick",
  });
  for (const key of ["cinderback.delivery", "cinderback.projectile-speed-millitiles-per-tick",
    "cinderback.damage"]) {
    const record = questions.get(key);
    assert.ok(record, `the ordinary runtime explicitly receipts ${key}`);
    assert.equal(record.authoritative, false);
    assert.equal(record.disposition, "question");
    assert.equal(record.confidence, "unverified");
    assert.equal(record.source, "runtime-playability-estimate-not-comparison-corpus");
  }
  assert.equal(questions.get("cinderback.delivery").value, 2);
});

test("Cinderback live attacks travel before damage and resume identically in flight", () => {
  const witness = structuredClone(createSessionTroopWitness("cinderback"));
  witness.initialWindupTicks = { central: 9_999, lane: 9_999 };
  const battle = new LiveBattle(canonical(witness));
  for (const [side, point, sequence] of [["south", SOUTH, 0], ["north", NORTH, 1]]) {
    battle.scheduleDeploy(canonical({ cardId: "cinderback", point, sequence, side, tick: 0 }));
  }
  let launch = null;
  for (let tick = 0; tick < 400 && launch === null; tick += 1) {
    launch = battle.step().find((event) => event.type === "projectile-launch" &&
      event.projectile.attackerId === 1) ?? null;
  }
  assert.ok(launch, "the ordinary live host must launch the south attack as a projectile");
  const shot = launch.projectile;
  assert.ok(shot.impactTick > shot.launchTick, "distance produces nonzero travel time");
  assert.equal(battle.state.units.find(({ id }) => id === shot.targetId).hitpoints, 304,
    "launch alone does not apply the previous melee contact");
  assert.ok(!battle.replay.some((event) => event.type === "damage" &&
    event.projectileId === shot.id));
  const restored = LiveBattle.restore(battle.serialize());
  let impact = null;
  for (let tick = 0; tick < 60 && impact === null; tick += 1) {
    const events = battle.step();
    assert.deepEqual(restored.step(), events);
    assert.deepEqual(restored.state, battle.state);
    impact = events.find((event) => event.type === "damage" &&
      event.projectileId === shot.id) ?? null;
  }
  assert.ok(impact, "the launched projectile must eventually damage its live enemy");
  assert.equal(impact.targetId, shot.targetId);
  assert.equal(impact.amount, shot.damage, "runtime damage comes from the explicit QUESTION");
  assert.equal(battle.state.units.find(({ id }) => id === shot.targetId).hitpoints,
    304 - shot.damage);
  assert.equal(restored.serialize(), battle.serialize());
});

test("admitted session witness player and AI deployments reach corrected live delivery", () => {
  const witness = createSessionTroopWitness("cinderback");
  const deck = witness.roster.map(({ id }) => id);
  let seed = 0;
  while (seed < 256 && !["north", "south"].every((side) =>
    new DeckCycle({ deck, seed: `${seed}:${side}` }).state.hand.includes("cinderback"))) {
    seed += 1;
  }
  assert.ok(seed < 256, "a deterministic two-sided opening exists");
  const setup = {
    battleSetup: canonical(witness),
    deck,
    legalNorthDeployments: [{ cardId: "cinderback", point: NORTH }],
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 1,
    thinkOffsetTicks: 0,
  };
  const session = new GameSession(canonical(setup));
  const slot = session.state.decks.south.hand.indexOf("cinderback");
  session.submitPlayerCommand(canonical({ cardId: "cinderback", commandId: 0,
    point: SOUTH, slot, tick: 0, type: "deploy" }));
  const commits = session.stepMany(1).filter(({ type }) => type === "session-deployed");
  const cost = witness.roster.find(({ id }) => id === "cinderback").cost;
  assert.deepEqual(commits.map(({ side }) => side).sort(), ["north", "south"]);
  assert.equal(new Set(commits.map(({ spend }) => spend.sequence)).size, 2);
  for (const commit of commits) {
    assert.equal(commit.deployment.cardId, "cinderback");
    assert.equal(commit.spend.accepted, true);
    assert.equal(commit.spend.cost, cost);
    assert.equal(commit.spend.amountAfter, 10 - cost);
    assert.equal(session.state.elixir.sides[commit.side].amount, 10 - cost);
  }
  const launchSides = new Set();
  for (let tick = 0; tick < 400 && launchSides.size < 2; tick += 1) {
    for (const event of session.stepMany(1)) {
      if (event.type !== "projectile-launch") continue;
      const source = session.state.battle.units.find(({ id }) => id === event.projectile.attackerId);
      if (source?.cardId === "cinderback") launchSides.add(source.side);
    }
  }
  assert.deepEqual([...launchSides].sort(), ["north", "south"],
    "accepted player and opponent commands create real projectile attacks");
});
