import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const upstream = new Set([
  "area-damage",
  "arena-geometry",
  "attack-cycle",
  "damage",
  "deployment",
  "entities",
  "fixed-step",
  "fixed-step-kernel",
  "flying",
  "formations",
  "melee",
  "movement",
  "pathfinding",
  "projectile",
  "rng",
  "spatial",
  "targeting",
  "towers",
]);
for (const selector of selectors) {
  if (selector !== "elixir" && !upstream.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const runAll = selectors.length === 0;
if (runAll) {
  run([new URL("./towers-runner.js", import.meta.url).pathname]);
} else {
  for (const selector of selectors) {
    if (selector === "towers") {
      run([new URL("./towers-runner.js", import.meta.url).pathname, "towers"]);
    } else if (selector !== "elixir") {
      run([
        new URL("./deployment-runner.js", import.meta.url).pathname,
        selector,
      ]);
    }
  }
}
if (runAll || selectors.includes("elixir")) {
  run(["--test", new URL("./elixir.test.js", import.meta.url).pathname]);
}
