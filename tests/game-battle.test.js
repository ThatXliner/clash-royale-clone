import assert from "node:assert/strict";
import test from "node:test";

import {
  LiveBattle,
  MAX_LIVE_BATTLE_STEP_TICKS,
  getLiveBattlePlayableCardIds,
  parseLiveBattleSetup,
} from "../src/sim/live-battle.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../src/content/playable-roster.js";

const south = { x: 3_500, y: 14_500 };
const north = { x: 3_500, y: 17_500 };

function rawSetup(initialWindupTicks = { central: 0, lane: 0 }) {
  return {
    initialWindupTicks,
    questions: structuredClone(createPlayableRosterQuestionRecords()),
    roster: structuredClone(createPlayableRoster()),
  };
}

function setup(initialWindupTicks = { central: 0, lane: 0 }) {
  return parseLiveBattleSetup(canonicalJson(rawSetup(initialWindupTicks)));
}

function deploy(battle, cardId, side, sequence, tick = 0, point = side === "south" ? south : north) {
  return battle.scheduleDeploy(canonicalJson({ cardId, point, sequence, side, tick }));
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

test("game battle: all eight starter cards materialize stable singles and squad counts", () => {
  const configured = setup();
  const battle = new LiveBattle(configured);
  const ids = getLiveBattlePlayableCardIds(configured);
  ids.forEach((id, index) => {
    deploy(battle, id, "south", index * 2);
    deploy(battle, id, "north", index * 2 + 1);
  });
  const events = battle.step(0);
  const expected = new Map([
    ["coilblade", 1], ["mossguard", 1], ["copperskiff", 1], ["skymaul", 1],
    ["brassbolt", 1], ["reedsting", 1], ["briar-band", 6], ["cinderlings", 3],
  ]);
  assert.equal(battle.state.units.length, 30);
  for (const id of ids) {
    assert.equal(battle.state.units.filter(({ cardId }) => cardId === id).length,
      expected.get(id) * 2);
    assert.deepEqual(new Set(battle.state.units.filter(({ cardId }) => cardId === id)
      .map(({ side }) => side)), new Set(["north", "south"]));
  }
  assert.deepEqual(battle.state.units.map(({ id }) => id),
    Array.from({ length: 30 }, (_, index) => index + 1));
  assert.equal(events.filter(({ type }) => type === "deployed").length, 16);
  assert.equal(battle.state.tick, 1);
});

test("game battle: public forks preserve causal state and transcripts", () => {
  const source = new LiveBattle(setup({ central: 999, lane: 999 }));
  deploy(source, "brassbolt", "south", 0, 0);
  deploy(source, "brassbolt", "north", 1, 0);
  source.stepMany(2);
  const sourceBytes = source.serialize();
  const publicFork = source.fork();
  const continuation = source.fork();

  assert.equal(source.serialize(), sourceBytes);
  assert.deepEqual(continuation.state, publicFork.state);
  assert.equal(continuation.serialize(), publicFork.serialize());
  assert.deepEqual(continuation.events, publicFork.events);
  assert.deepEqual(continuation.replay, publicFork.replay);
  assert.equal(source.serialize(), sourceBytes);

  assert.deepEqual(continuation.stepMany(12), publicFork.stepMany(12));
  assert.deepEqual(continuation.state, publicFork.state);
  const restored = LiveBattle.restore(publicFork.serialize());
  assert.equal(restored.serialize(), publicFork.serialize());
  assert.deepEqual(restored.replay, publicFork.replay);
  assert.equal(source.serialize(), sourceBytes);
});

test("game battle: mirrored 600-tick journeys include deaths, tower destruction, chunks, and restore cuts", () => {
  const configure = (side = "north") => {
    const battle = new LiveBattle(setup());
    const point = side === "north" ? { x: 3_500, y: 17_500 } : { x: 14_500, y: 14_500 };
    deploy(battle, "cinderlings", side, 0, 0, point);
    for (let sequence = 0; sequence < 8; sequence += 1) {
      deploy(battle, "coilblade", side, sequence + 1, 0, point);
    }
    return battle;
  };
  const direct = configure();
  const snapshots = [direct.serialize()];
  for (let tick = 100; tick <= 600; tick += 100) {
    direct.stepMany(100);
    snapshots.push(direct.serialize());
  }
  const launches = direct.replay.filter(({ type }) => type === "tower-projectile-launch");
  assert.ok(launches.length >= 10);
  assert.ok(direct.replay.some(({ sourceId, targetId, type }) =>
    type === "damage" && typeof sourceId === "string" && Number.isSafeInteger(targetId)));
  assert.ok(direct.replay.some(({ towerId, type }) =>
    type === "tower-destroyed" && towerId === "south:lane:west"));
  assert.ok(direct.replay.some(({ type }) => type === "death"));
  assert.equal(direct.state.towers.find(({ id }) => id === "south:lane:west").hitpoints, 0);
  assert.equal(direct.state.activationHistory.south.cause, "friendly-lane-destroyed");

  const chunked = configure();
  for (const count of [73, 127, 41, 159, 200]) chunked.stepMany(count);
  assert.equal(chunked.serialize(), direct.serialize());
  assert.deepEqual(chunked.state, direct.state);
  assert.deepEqual(chunked.replay, direct.replay);

  for (let cut = 0; cut < snapshots.length; cut += 1) {
    const restored = LiveBattle.restore(snapshots[cut]);
    restored.stepMany(600 - cut * 100);
    assert.equal(restored.serialize(), direct.serialize(), `journey bytes cut ${cut * 100}`);
    assert.deepEqual(restored.state, direct.state, `journey state cut ${cut * 100}`);
    assert.deepEqual(restored.replay, direct.replay, `journey replay cut ${cut * 100}`);
  }

  const mirrored = configure("south");
  mirrored.stepMany(600);
  assert.ok(mirrored.replay.some(({ type }) => type === "tower-projectile-launch"));
  assert.ok(mirrored.replay.some(({ sourceId, type }) =>
    type === "damage" && typeof sourceId === "string"));
  assert.ok(mirrored.replay.some(({ structureId, type }) =>
    type === "external-structure-contact" && structureId === "north:lane:east"));
  assert.ok(mirrored.replay.some(({ towerId, type }) =>
    type === "tower-destroyed" && towerId === "north:lane:east"));
  assert.ok(mirrored.replay.some(({ type }) => type === "death"));
  assert.equal(mirrored.state.towers.find(({ id }) => id === "north:lane:east").hitpoints, 0);
  assert.equal(mirrored.state.activationHistory.north.cause, "friendly-lane-destroyed");
});

test("game battle: symmetric opposing troops die in one simultaneous trade window", () => {
  const battle = new LiveBattle(setup({ central: 999, lane: 999 }));
  deploy(battle, "coilblade", "south", 0, 0, { x: 9_000, y: 14_500 });
  deploy(battle, "coilblade", "north", 1, 0, { x: 9_000, y: 17_500 });
  const events = battle.stepMany(390);
  assert.deepEqual(events.filter(({ type }) => type === "death"), [
    { targetId: 1, tick: 389, type: "death" },
    { targetId: 2, tick: 389, type: "death" },
  ]);
  assert.equal(battle.state.units.filter(({ alive }) => alive).length, 0);
});

test("game battle: two-sided ranged deployments move, interact, damage, and retain direct/bridge policies", () => {
  const battle = new LiveBattle(setup());
  deploy(battle, "brassbolt", "south", 0);
  deploy(battle, "brassbolt", "north", 1);
  const events = battle.stepMany(82);
  assert.ok(events.some(({ type }) => type === "damage"));
  assert.ok(battle.state.units.every(({ movement }) => movement === null || movement.mode === "ground"));
  assert.ok(battle.state.units.every(({ position }) => Number.isInteger(position.x) && Number.isInteger(position.y)));
  assert.equal(battle.state.tick, 82);

  const flying = new LiveBattle(setup());
  deploy(flying, "copperskiff", "south", 0);
  flying.step(0);
  const mover = flying.state.units[0].movement;
  assert.equal(mover.mode, "air");
  assert.equal(mover.route.length, 1, "flying movement is one direct segment");
});

test("game battle: post-zero deployments, chunks, replay, and live restore cuts are exact", () => {
  const configure = () => {
    const battle = new LiveBattle(setup({ central: 3, lane: 2 }));
    deploy(battle, "copperskiff", "south", 0, 0);
    deploy(battle, "skymaul", "north", 0, 4);
    return battle;
  };
  const ticks = 16;
  const direct = configure();
  const snapshots = [direct.serialize()];
  const perTick = [];
  for (let tick = 0; tick < ticks; tick += 1) {
    perTick.push(direct.step(tick));
    snapshots.push(direct.serialize());
  }
  const chunked = configure();
  assert.deepEqual(chunked.stepMany(ticks), perTick.flat());
  assert.equal(chunked.serialize(), direct.serialize());
  assert.deepEqual(chunked.state, direct.state);
  assert.deepEqual(chunked.replay, direct.replay);
  for (let cut = 0; cut <= ticks; cut += 2) {
    const restored = LiveBattle.restore(snapshots[cut]);
    assert.deepEqual(restored.stepMany(ticks - cut), perTick.slice(cut).flat());
    assert.equal(restored.serialize(), direct.serialize(), `bytes cut ${cut}`);
    assert.deepEqual(restored.state, direct.state, `state cut ${cut}`);
    assert.deepEqual(restored.replay, direct.replay, `replay cut ${cut}`);
  }
});

test("game battle: hostile deploys, duplicate order, bounds, and forged witnesses reject atomically", () => {
  const battle = new LiveBattle(setup());
  deploy(battle, "coilblade", "south", 1, 2);
  const bytes = battle.serialize();
  for (const operation of [
    () => deploy(battle, "coilblade", "north", 1, 2),
    () => deploy(battle, "not-playable", "south", 2, 2),
    () => deploy(battle, "coilblade", "south", 2, -1),
    () => battle.step(1),
    () => battle.stepMany(MAX_LIVE_BATTLE_STEP_TICKS + 1),
  ]) {
    assert.throws(operation);
    assert.equal(battle.serialize(), bytes);
  }
  const forged = JSON.parse(bytes);
  forged.history.push({ tick: 7, type: "step" });
  assert.throws(() => LiveBattle.restore(JSON.stringify(forged)));
  assert.throws(() => LiveBattle.restore(` ${bytes}`), /canonical/u);
  assert.equal(LiveBattle.restore(bytes).serialize(), bytes);

  const invalidSetup = rawSetup();
  invalidSetup.roster[1].id = invalidSetup.roster[0].id;
  assert.throws(() => parseLiveBattleSetup(canonicalJson(invalidSetup)), /identity|unique/u);
  const unresolved = rawSetup();
  unresolved.roster[0].entities[0].bodyRadiusPolicy.questionKey = "missing.question";
  assert.throws(() => parseLiveBattleSetup(canonicalJson(unresolved)), /unresolved/u);
  assert.throws(() => new LiveBattle(), /canonical JSON text|admitted snapshot|parseLiveBattleSetup/u);
});

test("game battle: injected identity graph and QUESTION inventory are canonically closed", () => {
  const reject = (mutate,
    pattern = /identity|archetype|formation|component|question|provenance|unique/u) => {
    const hostile = rawSetup();
    mutate(hostile);
    assert.throws(() => parseLiveBattleSetup(canonicalJson(hostile)), pattern);
  };
  const card = (value, id) => value.roster.find((entry) => entry.id === id);

  const identityMutations = [
    (value) => { card(value, "mossguard").id = "coilblade"; },
    (value) => { card(value, "mossguard").displayName = "Coilblade"; },
    (value) => { card(value, "mossguard").entities[0].archetypeId = "coilblade"; },
    (value) => { card(value, "mossguard").entities[0].displayName = "Coilblade"; },
    (value) => { card(value, "mossguard").formation.componentOrder[0] = "coilblade"; },
    (value) => { card(value, "mossguard").entities[0].role = "secondary"; },
    (value) => {
      const target = card(value, "mossguard");
      target.entities[0].archetypeId = "coilblade";
      target.formation.componentOrder[0] = "coilblade";
    },
    (value) => {
      const target = card(value, "mossguard");
      target.entities[0].archetypeId = "coilblade";
      target.entities[0].displayName = "Coilblade";
      target.entities[0].bodyRadiusPolicy.questionKey = "coilblade.body-radius-millitiles";
      target.formation.componentOrder[0] = "coilblade";
    },
    (value) => {
      const target = card(value, "mossguard");
      target.id = "coilblade";
      target.displayName = "Coilblade";
      target.entities[0].archetypeId = "coilblade";
      target.entities[0].displayName = "Coilblade";
      target.entities[0].bodyRadiusPolicy.questionKey = "coilblade.body-radius-millitiles";
      target.formation.componentOrder[0] = "coilblade";
    },
  ];
  for (const mutate of identityMutations) reject(mutate);

  reject((value) => {
    value.questions.push({ ...value.questions[0], key: "unused.body-radius-millitiles" });
  }, /inventory/u);
  reject((value) => { value.questions.pop(); }, /unresolved|inventory/u);
  reject((value) => { value.questions.push(structuredClone(value.questions[0])); }, /unique/u);
  reject((value) => { value.questions[0].key = "stale.body-radius-millitiles"; },
    /unresolved|inventory/u);
  reject((value) => { value.questions[0].confidence = "stale"; }, /provenance/u);
  reject((value) => { value.questions[0].source = "different-source"; }, /provenance/u);
  for (const hostileValue of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    reject((value) => { value.questions[0].value = hostileValue; }, /safe integer/u);
  }

  const baseline = new LiveBattle(setup()).serialize();
  for (const permuted of [
    [...rawSetup().questions].reverse(),
    [...rawSetup().questions.slice(3), ...rawSetup().questions.slice(0, 3)],
  ]) {
    const reordered = rawSetup();
    reordered.questions = permuted;
    assert.equal(new LiveBattle(parseLiveBattleSetup(canonicalJson(reordered))).serialize(), baseline,
      "QUESTION permutations normalize to one canonical self-contained snapshot");
  }

  for (const target of ["card", "question"]) {
    const hostile = rawSetup();
    let reads = 0;
    const object = target === "card" ? hostile.roster[0] : hostile.questions[0];
    const key = target === "card" ? "id" : "key";
    const original = object[key];
    Object.defineProperty(object, key, { enumerable: true, get() { reads += 1; return original; } });
    assert.throws(() => new LiveBattle(hostile), /parseLiveBattleSetup/u);
    assert.equal(reads, 0, `${target} accessor must not execute`);
  }
  const proxied = rawSetup();
  let proxyReads = 0;
  proxied.questions[0] = new Proxy(proxied.questions[0], {
    get(target, key, receiver) { proxyReads += 1; return Reflect.get(target, key, receiver); },
  });
  assert.throws(() => new LiveBattle(proxied), /parseLiveBattleSetup/u);
  assert.equal(proxyReads, 0, "descriptor validation must not execute proxy get traps");

  const validBytes = baseline;
  for (const mutate of [
    (snapshot) => snapshot.setup.questions.push({
      ...snapshot.setup.questions[0], key: "unused.body-radius-millitiles",
    }),
    (snapshot) => {
      const target = snapshot.setup.roster[1];
      target.entities[0].archetypeId = snapshot.setup.roster[0].entities[0].archetypeId;
      target.formation.componentOrder[0] = target.entities[0].archetypeId;
    },
  ]) {
    const forged = JSON.parse(validBytes);
    mutate(forged);
    assert.throws(() => LiveBattle.restore(canonicalJson(forged)));
  }
  assert.equal(LiveBattle.restore(validBytes).serialize(), validBytes);
});

test("game battle: untrusted executable setup graphs reject without running traps", () => {
  const trapNames = [
    "getPrototypeOf", "ownKeys", "getOwnPropertyDescriptor", "get", "set", "has",
    "defineProperty",
  ];
  const layers = [
    ["root", (value, proxy) => proxy],
    ["roster array", (value, proxy) => { value.roster = proxy; return value; }],
    ["card", (value, proxy) => { value.roster[0] = proxy; return value; }],
    ["entities array", (value, proxy) => { value.roster[0].entities = proxy; return value; }],
    ["entity", (value, proxy) => { value.roster[0].entities[0] = proxy; return value; }],
    ["formation", (value, proxy) => { value.roster[0].formation = proxy; return value; }],
    ["formation components", (value, proxy) => {
      value.roster[0].formation.componentOrder = proxy; return value;
    }],
    ["questions array", (value, proxy) => { value.questions = proxy; return value; }],
    ["question", (value, proxy) => { value.questions[0] = proxy; return value; }],
  ];
  for (const [layer, install] of layers) {
    const value = rawSetup();
    const target = layer === "root" ? value
      : layer === "roster array" ? value.roster
      : layer === "card" ? value.roster[0]
      : layer === "entities array" ? value.roster[0].entities
      : layer === "entity" ? value.roster[0].entities[0]
      : layer === "formation" ? value.roster[0].formation
      : layer === "formation components" ? value.roster[0].formation.componentOrder
      : layer === "questions array" ? value.questions
      : value.questions[0];
    const counters = Object.fromEntries(trapNames.map((name) => [name, 0]));
    const handler = Object.fromEntries(trapNames.map((name) => [name, (...args) => {
      counters[name] += 1;
      return Reflect[name](...args);
    }]));
    const hostile = install(value, new Proxy(target, handler));
    assert.throws(() => new LiveBattle(hostile), /parseLiveBattleSetup/u, layer);
    assert.deepEqual(counters, Object.fromEntries(trapNames.map((name) => [name, 0])), layer);
  }

  const restoreCounters = Object.fromEntries(trapNames.map((name) => [name, 0]));
  const restoreHandler = Object.fromEntries(trapNames.map((name) => [name, (...args) => {
    restoreCounters[name] += 1;
    return Reflect[name](...args);
  }]));
  assert.throws(() => LiveBattle.restore(new Proxy({}, restoreHandler)), /serialized live battle/u);
  assert.deepEqual(restoreCounters, Object.fromEntries(trapNames.map((name) => [name, 0])));

  let getterReads = 0;
  const accessor = rawSetup();
  Object.defineProperty(accessor, "then", {
    enumerable: true,
    get() { getterReads += 1; return () => {}; },
  });
  const cyclic = rawSetup();
  cyclic.self = cyclic;
  const custom = Object.create({ inherited: true });
  Object.assign(custom, rawSetup());
  const symbolic = rawSetup();
  symbolic[Symbol("hostile")] = true;
  for (const hostile of [() => {}, accessor, cyclic, custom, symbolic]) {
    assert.throws(() => new LiveBattle(hostile), /canonical JSON text|parseLiveBattleSetup/u);
  }
  assert.equal(getterReads, 0);

  let deep = null;
  for (let index = 0; index < 34; index += 1) deep = { child: deep };
  assert.throws(() => parseLiveBattleSetup(canonicalJson({ ...rawSetup(), extra: deep })),
    /depth bound/u);
  assert.throws(() => parseLiveBattleSetup(canonicalJson({
    ...rawSetup(), extra: Array.from({ length: 10_001 }, () => null),
  })), /node bound|array length bound/u);
  assert.throws(() => parseLiveBattleSetup("x".repeat(1_048_577)), /byte bound/u);

  const admitted = setup();
  assert.ok(Object.isFrozen(admitted));
  assert.ok(Object.isFrozen(admitted.roster));
  assert.ok(Object.isFrozen(admitted.questions[0]));
  assert.doesNotThrow(() => new LiveBattle(admitted));
});

test("game battle: restore preflights hostile parsed graphs before recursive canonicalization", () => {
  const controlled = (operation, pattern) => {
    let thrown;
    try { operation(); }
    catch (error) { thrown = error; }
    assert.ok(thrown instanceof TypeError || thrown instanceof RangeError);
    assert.match(thrown.message, pattern);
    assert.doesNotMatch(thrown.message, /call stack|recursion/iu);
  };

  const deeplyNested = `${"[".repeat(20_000)}null${"]".repeat(20_000)}`;
  controlled(() => LiveBattle.restore(deeplyNested), /depth bound/u);

  const twoHundredThousandChildren = `[${Array.from(
    { length: 200_000 }, () => "null").join(",")}]`;
  controlled(() => LiveBattle.restore(twoHundredThousandChildren), /node bound/u);
  const tooWide = `[${Array.from({ length: 200_001 }, () => "null").join(",")}]`;
  controlled(() => LiveBattle.restore(tooWide), /array length bound/u);
  const tooManyContainers = `[${Array.from({ length: 100_001 }, () => "[]").join(",")}]`;
  controlled(() => LiveBattle.restore(tooManyContainers), /container bound/u);
  const tooManyKeys = Object.fromEntries(Array.from(
    { length: 1_025 }, (_, index) => [`k${index}`, null]));
  controlled(() => LiveBattle.restore(canonicalJson(tooManyKeys)), /object key bound/u);
  controlled(() => LiveBattle.restore(JSON.stringify("x".repeat(4_194_305))),
    /string length bound/u);
  controlled(() => LiveBattle.restore("9007199254740992"), /safe integers/u);

  const valid = new LiveBattle(setup()).serialize();
  const parsed = JSON.parse(valid);
  let nested = null;
  for (let index = 0; index < 140; index += 1) nested = [nested];
  const deepSetup = structuredClone(parsed);
  deepSetup.setup.questions[0].value = nested;
  controlled(() => LiveBattle.restore(canonicalJson(deepSetup)), /depth bound/u);
  const wideSetup = structuredClone(parsed);
  wideSetup.setup.questions = Array.from({ length: 200_001 }, () => null);
  controlled(() => LiveBattle.restore(canonicalJson(wideSetup)), /array length bound/u);

  for (const lone of ["\uD800", "\uDC00"]) {
    const valueAttack = structuredClone(parsed);
    valueAttack.setup.questions[0].source = lone;
    controlled(() => LiveBattle.restore(canonicalJson(valueAttack)), /Unicode scalar/u);
    const keyAttack = structuredClone(parsed);
    keyAttack.setup[lone] = null;
    controlled(() => LiveBattle.restore(canonicalJson(keyAttack)), /Unicode scalar/u);
  }
  const paired = structuredClone(parsed);
  paired.setup.questions[0].source = "paired-\uD83D\uDE00";
  let pairedError;
  try { LiveBattle.restore(canonicalJson(paired)); }
  catch (error) { pairedError = error; }
  assert.ok(pairedError instanceof TypeError);
  assert.doesNotMatch(pairedError.message, /Unicode scalar/u,
    "a valid surrogate pair is one Unicode scalar and reaches semantic validation");
});

test("game battle: an over-capacity due boundary rejects before any mutation", () => {
  const battle = new LiveBattle(setup());
  for (let sequence = 0; sequence < 171; sequence += 1) {
    deploy(battle, "briar-band", "south", sequence, 0, { x: 3_500, y: 14_500 });
  }
  const before = battle.serialize();
  assert.throws(() => battle.step(0), /unit capacity/u);
  assert.equal(battle.serialize(), before);
  assert.throws(() => battle.stepMany(1), /unit capacity/u);
  assert.equal(battle.serialize(), before);
  assert.equal(battle.state.tick, 0);
  assert.equal(battle.state.units.length, 0);
  assert.equal(battle.state.pendingDeployments.length, 171);

  const downstreamSetup = rawSetup();
  downstreamSetup.roster[0].entities[0].damage = Number.MAX_SAFE_INTEGER;
  const downstream = new LiveBattle(parseLiveBattleSetup(canonicalJson(downstreamSetup)));
  deploy(downstream, "cinderlings", "south", 0, 0);
  deploy(downstream, "coilblade", "north", 1, 0);
  const downstreamBefore = downstream.serialize();
  assert.throws(() => downstream.step(0), /battle combat spawn.*damage/u);
  assert.equal(downstream.serialize(), downstreamBefore,
    "a downstream combat rejection after an earlier due squad stays atomic");
  assert.equal(downstream.state.units.length, 0);
  assert.equal(downstream.state.pendingDeployments.length, 2);
});
