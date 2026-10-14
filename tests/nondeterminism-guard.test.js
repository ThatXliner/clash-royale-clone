import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  GUARD_LIMITS,
  NondeterminismGuardError,
  analyzeModuleSource,
  assertDeterministicSources,
  guardSimulationDirectory,
  probeModuleGraph,
  simulationSourceFiles,
} from "../scripts/nondeterminism-guard.js";

const rejected = [
  ["date call", "Date.now()"],
  ["date construction", "new Date()"],
  ["performance alias", "const a = performance; const b = a; b.now()"],
  ["Temporal optional chain", "Temporal?.Now?.instant()"],
  ["process computed clock", "process['hr' + 'time']()"],
  ["process destructuring", "const { hrtime: clock } = process; clock.bigint()"],
  ["timer alias", "const later = setTimeout; later(run, 0)"],
  ["timer globalThis", "globalThis?.['setInterval']?.(run, 1)"],
  ["animation timer", "requestAnimationFrame(run)"],
  ["random direct", "Math.random()"],
  ["random computed", "Math?.[`random`]?.()"],
  ["random destructured", "const { random: roll } = Math; roll()"],
  ["random multi-hop", "const one = Math; const two = one; two.random()"],
  ["random globalThis", "globalThis['Math']['random']()"],
  ["random dynamic computed", "export function roll(key) { return Math[key](); }"],
  ["random Reflect", "Reflect.get(Math, 'random')()"],
  ["random Reflect aliases", "const R = Reflect; const g = R.get; g(Math, 'random')()"],
  ["random Reflect dynamic", "const get = Reflect.get; export function roll(key) { return get(Math, key)(); }"],
  ["crypto global", "crypto?.['randomUUID']?.()"],
  ["crypto import alias", "import { randomBytes as bytes } from 'node:crypto'; bytes(2)"],
  ["crypto namespace import", "import * as entropy from 'crypto'; entropy.randomBytes(2)"],
  ["timer import alias", "import { setTimeout as delay } from 'node:timers/promises'; delay(1)"],
  ["clock import alias", "import { performance as clock } from 'perf_hooks'; clock.now()"],
  ["require direct", "require('crypto')"],
  ["require alias multi-hop", "const load = require; const again = load; const c = again('node:crypto'); c.randomUUID()"],
  ["require destructured", "const { randomBytes: bytes } = require('crypto'); bytes(1)"],
  ["dynamic import", "const entropy = await import('node:crypto'); entropy.randomBytes(1)"],
];

const permitted = [
  ["comment", "// Math.random() and Date.now() are forbidden examples\nexport const x = 1;"],
  ["string", "export const warning = 'setTimeout(() => Math.random())';"],
  ["template text", "export const warning = `performance.now()`;"],
  ["shadowed Math", "function seeded(Math) { return Math.random(); } export { seeded };"],
  ["local Math", "const Math = { random: () => 4 }; export const value = Math.random();"],
  ["seeded API", "const seeded = { random: () => 7 }; const alias = seeded; export const value = alias.random();"],
  ["explicit tick", "export function update(tick) { return tick + 1; }"],
  ["safe math", "export const value = Math.trunc(Math.hypot(3, 4));"],
  ["safe reflect", "const local = { value: 3 }; export const value = Reflect.get(local, 'value');"],
  ["date property data", "const record = { Date: 3 }; export const value = record.Date;"],
  ["unrelated crypto name", "const crypto = { randomUUID: () => 'seeded' }; export default crypto.randomUUID();"],
];

const EXPECTED_SIMULATION_MODULES = Object.freeze([
  "area-damage.js",
  "arena-geometry.js",
  "attack-cycle.js",
  "battle-combat.js",
  "battle-continuation-kernel.js",
  "battle-movement.js",
    "battle-towers.js",
    "combat-effect-feed.js",
  "damage.js",
  "deck.js",
  "deployment.js",
  "elixir.js",
  "entities.js",
  "fixed-step.js",
  "flying.js",
  "formations.js",
  "game-opponent.js",
  "game-player-deploy.js",
  "game-session.js",
  "game-side-deploy-core.js",
  "game-side-deploy.js",
  "live-battle.js",
  "match.js",
  "melee.js",
  "movement.js",
  "opponent-controller.js",
  "ordinary-projectile-homing.js",
  "ordinary-projectile-splash.js",
  "pathfinding.js",
  "projectile.js",
  "rng.js",
  "session-building-profile-receipts.js",
  "session-building-runtime.js",
  "session-card-runtime.js",
  "session-troop-projectile-runtime.js",
  "session-troop-runtime.js",
  "session-troop-status-runtime.js",
  "spatial.js",
  "spell-area-impact.js",
  "spell-intent-runtime.js",
  "targeting.js",
  "tower-evidence-map.js",
  "tower-evidence.js",
  "towers.js",
]);

test("nondeterminism-guard: rejects direct and adversarial syntax-aware fixtures", () => {
  for (const [name, source] of rejected) {
    const violations = analyzeModuleSource(source, { file: `${name}.js` });
    assert.ok(violations.length > 0, `expected rejection: ${name}`);
    assert.match(
      violations.map((entry) => entry.capability).join(","),
      /wall-clock time|timers|ambient randomness/,
      name,
    );
  }
});

test("nondeterminism-guard: permits deterministic locals and ignores comments and strings", () => {
  for (const [name, source] of permitted) {
    assert.deepEqual(
      analyzeModuleSource(source, { file: `${name}.js` }),
      [],
      name,
    );
  }
});

test("nondeterminism-guard: binds function, catch, class, and nested lexical shadows exactly", () => {
  const lexicalPermits = [
    [
      "arrow parameter",
      "export const seeded = (Math) => Math.random();",
    ],
    [
      "arrow default parameter",
      "export const seeded = (Math = { random: () => 4 }) => Math.random();",
    ],
    [
      "function destructured and rest parameters",
      "export const seeded = function ({ Math }, ...values) { return Math.random() + values.length; };",
    ],
    [
      "function declaration destructured default",
      "export function seeded({ random } = { random: () => 4 }) { return random(); }",
    ],
    [
      "nested closure parameter",
      "export const seeded = (Math) => function inner() { return () => Math.random(); };",
    ],
    [
      "identifier catch parameter",
      "try { throw 1; } catch (error) { const value = error; } export const ok = true;",
    ],
    [
      "shadowing catch parameter",
      "try { throw { random: () => 4 }; } catch (Math) { Math.random(); } export const ok = true;",
    ],
    [
      "destructured catch parameter",
      "try { throw { Math: { random: () => 4 }, extra: 1 }; } catch ({ Math, ...rest }) { Math.random(); rest.extra; }",
    ],
    [
      "class method parameter",
      "export class Seeded { roll(Math) { return Math.random(); } }",
    ],
    [
      "class static block and nested closure",
      "export class Seeded { static { const Math = { random: () => 4 }; this.value = (() => Math.random())(); } }",
    ],
    [
      "class static block var scope",
      "export class Seeded { static { var Math = { random: () => 4 }; this.value = Math.random(); } }",
    ],
    [
      "named class expression",
      "export const Seeded = class Math { static random() { return 4; } static value = Math.random(); };",
    ],
  ];
  for (const [name, source] of lexicalPermits) {
    assert.deepEqual(
      analyzeModuleSource(source, { file: `${name}.js` }),
      [],
      name,
    );
  }

  const ambientDefault = analyzeModuleSource(
    "export function unsafe(value = Math.random()) { return value; }",
    { file: "ambient-default.js" },
  );
  assert.equal(ambientDefault.length, 1);
  assert.equal(ambientDefault[0].capability, "ambient randomness");

  const catchBoundary = analyzeModuleSource(
    "try { throw { random: () => 4 }; } catch (Math) { Math.random(); } Math.random();",
    { file: "catch-boundary.js" },
  );
  assert.equal(catchBoundary.length, 1);
  assert.equal(catchBoundary[0].expression, "Math.random");
});

test("nondeterminism-guard: scans every simulation module and probes its runtime boundary", async () => {
  const directory = new URL("../src/sim/", import.meta.url);
  const files = await simulationSourceFiles(directory);
  assert.deepEqual(
    files.map((file) => basename(file)),
    EXPECTED_SIMULATION_MODULES,
  );
  assert.ok(
    files.some((file) => basename(file) === "battle-combat.js"),
    "the live battle combat adapter must be in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "battle-movement.js"),
    "the live battle movement adapter must be in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "battle-towers.js"),
    "the live battle tower adapter must be in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "game-player-deploy.js"),
    "the canonical player command bridge must be in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "live-battle.js"),
    "the live battle orchestrator must be in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "session-building-runtime.js"),
    "the host-driven building reducer must remain in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "opponent-controller.js"),
    "the live opponent controller must be in the audited simulation inventory",
  );
  assert.ok(
    files.some((file) => basename(file) === "tower-evidence.js"),
    "the tower evidence adapter must be in the audited simulation inventory",
  );
  const result = await guardSimulationDirectory(directory);
  assert.deepEqual(result, {
    files: EXPECTED_SIMULATION_MODULES.length + 3,
    runtimeProbed: EXPECTED_SIMULATION_MODULES.length + 3,
    violations: [],
  });
});

test("nondeterminism-guard: simulation closure admits only the exact neutral authority", () => {
  const simulationRoot = fileURLToPath(new URL("../src/sim/", import.meta.url));
  const authority = join(
    simulationRoot,
    "../shared/session-troop-projectile-authority.js",
  );
  const deliveryAuthority = join(
    simulationRoot,
    "../shared/ordinary-projectile-delivery-authority.js",
  );
  const sourceConfidenceAuthority = join(
    simulationRoot,
    "../shared/session-troop-source-confidence-authority.js",
  );
  const hostileSibling = join(
    simulationRoot,
    "../shared/.nondeterminism-hostile-sibling.js",
  );
  const forgedAuthority = join(
    simulationRoot,
    "../shared/.nondeterminism-forged-confidence-authority.js",
  );
  const hostileImporter = join(simulationRoot, ".nondeterminism-hostile-import.js");
  const transitiveHostileImporter = join(
    simulationRoot,
    ".nondeterminism-transitive-hostile-import.js",
  );
  const nondeterministicImporter = join(
    simulationRoot,
    ".nondeterminism-confidence-random-import.js",
  );
  const forgedAuthorityImporter = join(
    simulationRoot,
    ".nondeterminism-forged-confidence-import.js",
  );
  writeFileSync(hostileSibling, "export const value = 1;\n");
  writeFileSync(forgedAuthority,
    "export function getSessionTroopSourceConfidencePolicy() { return { fields: [] }; }\n");
  writeFileSync(
    hostileImporter,
    "export { value } from '../shared/.nondeterminism-hostile-sibling.js';\n",
  );
  writeFileSync(
    transitiveHostileImporter,
    "import { getSessionTroopSourceConfidencePolicy } from " +
      "'../shared/session-troop-source-confidence-authority.js';\n" +
      "export { value } from '../shared/.nondeterminism-hostile-sibling.js';\n",
  );
  writeFileSync(
    nondeterministicImporter,
    "import { getSessionTroopSourceConfidencePolicy } from " +
      "'../shared/session-troop-source-confidence-authority.js';\n" +
      "export const policy = getSessionTroopSourceConfidencePolicy(" +
      "'gloamwing-cluster', 'gloamwing');\n" +
      "export const roll = Math.random();\n",
  );
  writeFileSync(
    forgedAuthorityImporter,
    "export { getSessionTroopSourceConfidencePolicy } from " +
      "'../shared/.nondeterminism-forged-confidence-authority.js';\n",
  );
  try {
    assert.deepEqual(probeModuleGraph([authority], { root: simulationRoot }), {
      modules: 1,
      status: "ok",
    });
    assert.deepEqual(probeModuleGraph([deliveryAuthority], { root: simulationRoot }), {
      modules: 1,
      status: "ok",
    });
    assert.deepEqual(probeModuleGraph([sourceConfidenceAuthority], { root: simulationRoot }), {
      modules: 1,
      status: "ok",
    });
    assert.throws(
      () => probeModuleGraph([hostileImporter], { root: simulationRoot }),
      (error) => error instanceof NondeterminismGuardError &&
        error.code === "RUNTIME_CAPABILITY_VIOLATION" &&
        /outside module graph root/.test(error.message),
      "a simulation import must not widen to a shared sibling",
    );
    assert.throws(
      () => probeModuleGraph([transitiveHostileImporter], { root: simulationRoot }),
      (error) => error instanceof NondeterminismGuardError &&
        error.code === "RUNTIME_CAPABILITY_VIOLATION" &&
        /outside module graph root/.test(error.message),
      "the admitted confidence authority cannot widen through a transitive shared import",
    );
    assert.throws(
      () => probeModuleGraph([nondeterministicImporter], { root: simulationRoot }),
      (error) => error instanceof NondeterminismGuardError &&
        error.code === "RUNTIME_CAPABILITY_VIOLATION" && /Math\.random/.test(error.message),
      "confidence authority importers remain subject to randomness analysis",
    );
    assert.throws(
      () => probeModuleGraph([forgedAuthorityImporter], { root: simulationRoot }),
      (error) => error instanceof NondeterminismGuardError &&
        error.code === "RUNTIME_CAPABILITY_VIOLATION" &&
        /outside module graph root/.test(error.message),
      "a forged confidence authority in a shared sibling is not admitted",
    );
    assert.throws(
      () => probeModuleGraph(
        [join(simulationRoot, "../content/session-troop-projectile-profiles.js")],
        { root: simulationRoot },
      ),
      (error) => error instanceof NondeterminismGuardError &&
        error.code === "RUNTIME_CAPABILITY_VIOLATION" &&
        /outside module graph root/.test(error.message),
      "content remains outside the simulation graph closure",
    );
  } finally {
    rmSync(forgedAuthorityImporter, { force: true });
    rmSync(nondeterministicImporter, { force: true });
    rmSync(transitiveHostileImporter, { force: true });
    rmSync(hostileImporter, { force: true });
    rmSync(forgedAuthority, { force: true });
    rmSync(hostileSibling, { force: true });
  }
});

test("nondeterminism-guard: runtime probe denies computed capabilities the analyzer cannot resolve", async (context) => {
  const directory = mkdtempSync(join(tmpdir(), "nondeterminism-probe-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const hostile = join(directory, "hostile.js");
  writeFileSync(
    hostile,
    "const key = ['ran', 'dom'].join(''); Math[key](); export const ok = false;\n",
  );
  assert.throws(
    () => probeModuleGraph([hostile]),
    (error) =>
      error instanceof NondeterminismGuardError &&
      error.code === "RUNTIME_CAPABILITY_VIOLATION" &&
      /Math\.random/.test(error.message),
  );
});

test("nondeterminism-guard: closes all five dormant-function critic bypasses without invoking exports", async (context) => {
  const directBypasses = [
    [
      "native source acquisition",
      "export function late() { return process.binding('natives')['internal/deps/acorn/acorn/dist/acorn']; }",
    ],
    [
      "function-scoped var retained from a block",
      "export function late() { { var roll = Math.random; } return roll(); }",
    ],
    [
      "Reflect.apply around Reflect.get",
      "export function late() { return Reflect.apply(Reflect.get, null, [Math, 'random'])(); }",
    ],
    [
      "computed dynamic import",
      "const prefix = 'node:'; export async function late() { return import(prefix + 'crypto'); }",
    ],
  ];
  for (const [name, source] of directBypasses) {
    assert.ok(
      analyzeModuleSource(source, { file: `${name}.js` }).length > 0,
      name,
    );
  }
  for (const source of [
    "export const late = () => process._linkedBinding('natives');",
    "export const late = () => process.getBuiltinModule('crypto');",
    "import { createRequire } from 'node:module'; export const late = () => createRequire(import.meta.url);",
    "export const late = () => Reflect.get.call(null, Math, 'random')();",
    "export const late = () => Reflect.get.apply(null, [Math, 'random'])();",
    "export const late = () => Reflect.apply.call(null, Reflect.get, null, [Math, 'random'])();",
  ]) {
    assert.ok(analyzeModuleSource(source, { file: "native-reflect-variant.js" }).length > 0);
  }

  assert.deepEqual(
    analyzeModuleSource(
      "export function seeded() { { var Math = { random: () => 4 }; } return Math.random(); }",
      { file: "function-var-shadow.js" },
    ),
    [],
    "var declarations are function scoped rather than block scoped",
  );

  const directory = mkdtempSync(join(tmpdir(), "nondeterminism-graph-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const entry = join(directory, "entry.js");
  const escaped = join(directory, "escaped.js");
  writeFileSync(entry, "export { late } from './escaped.js';\n");
  writeFileSync(
    escaped,
    "export function late() { return Math.random(); }\n",
  );
  assert.throws(
    () => probeModuleGraph([entry]),
    (error) =>
      error instanceof NondeterminismGuardError &&
      error.code === "RUNTIME_CAPABILITY_VIOLATION" &&
      /nondeterministic capability/.test(error.message),
    "re-exported dormant dependency is included in the static graph closure",
  );

  const clean = join(directory, "clean.js");
  writeFileSync(clean, "export function later(tick) { return tick + 1; }\n");
  assert.equal(probeModuleGraph([clean]).status, "ok");
  const module = await import(`${pathToFileURL(clean).href}?post-audit`);
  assert.equal(module.later(41), 42, "normal exported invocation remains usable after audit");
});

test("nondeterminism-guard: runtime linker accepts a bounded cyclic local module graph", (context) => {
  const directory = mkdtempSync(join(tmpdir(), "nondeterminism-cycle-"));
  context.after(() => rm(directory, { force: true, recursive: true }));
  const first = join(directory, "first.js");
  const second = join(directory, "second.js");
  writeFileSync(
    first,
    "import { second } from './second.js'; export function first(value) { return value === 0 ? 0 : second(value - 1); }\n",
  );
  writeFileSync(
    second,
    "import { first } from './first.js'; export function second(value) { return value === 0 ? 0 : first(value - 1); }\n",
  );

  assert.deepEqual(probeModuleGraph([first]), {
    modules: 2,
    status: "ok",
  });
});

test("nondeterminism-guard: reports canonical output and fails a source set atomically", () => {
  const sources = [
    { file: "z.js", source: "setTimeout(run, 0); Math.random();" },
    { file: "a.js", source: "Date.now();" },
  ];
  let captured;
  assert.throws(
    () => assertDeterministicSources(sources),
    (error) => {
      captured = error;
      return error instanceof NondeterminismGuardError &&
        error.code === "NONDETERMINISTIC_CAPABILITY";
    },
  );
  assert.deepEqual(
    captured.violations.map(({ file, line, column, capability }) => ({
      capability, column, file, line,
    })),
    [
      { capability: "wall-clock time", column: 1, file: "a.js", line: 1 },
      { capability: "timers", column: 1, file: "z.js", line: 1 },
      { capability: "ambient randomness", column: 21, file: "z.js", line: 1 },
    ],
  );
  assert.equal(Object.isFrozen(captured.violations), true);
  assert.equal(Object.isFrozen(captured.violations[0]), true);
});

test("nondeterminism-guard: enforces hostile size, depth, and file-count bounds", () => {
  assert.throws(
    () => analyzeModuleSource(
      `export const text = "${"x".repeat(GUARD_LIMITS.maxSourceBytes)}";`,
      { file: "large.js" },
    ),
    (error) => error.code === "SOURCE_SIZE_LIMIT",
  );
  assert.throws(
    () => analyzeModuleSource(
      `${"(".repeat(GUARD_LIMITS.maxSyntaxDepth + 1)}0${
        ")".repeat(GUARD_LIMITS.maxSyntaxDepth + 1)}`,
      { file: "deep.js" },
    ),
    (error) => error.code === "SYNTAX_DEPTH_LIMIT",
  );
  assert.throws(
    () => assertDeterministicSources(
      Array.from({ length: GUARD_LIMITS.maxFiles + 1 }, (_, index) => ({
        file: `${index}.js`,
        source: "",
      })),
    ),
    (error) => error.code === "FILE_COUNT_LIMIT",
  );
});
