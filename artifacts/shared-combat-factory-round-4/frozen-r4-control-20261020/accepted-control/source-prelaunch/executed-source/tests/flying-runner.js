import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const upstream = new Set([
  "area-damage",
  "arena-geometry",
  "attack-cycle",
  "damage",
  "entities",
  "fixed-step",
  "fixed-step-kernel",
  "formations",
  "melee",
  "movement",
  "pathfinding",
  "projectile",
  "rng",
  "spatial",
  "targeting",
]);
for (const selector of selectors) {
  if (selector !== "flying" && !upstream.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const runAll = selectors.length === 0;
const upstreamSelectors = runAll
  ? []
  : selectors.filter((selector) => upstream.has(selector));
if (runAll || upstreamSelectors.length > 0) {
  run([
    new URL("./pathfinding-runner.js", import.meta.url).pathname,
    ...upstreamSelectors,
  ]);
}
if (runAll || selectors.includes("flying")) {
  run(["--test", new URL("./flying.test.js", import.meta.url).pathname]);
}
