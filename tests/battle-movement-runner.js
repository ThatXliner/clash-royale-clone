import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const upstream = new Set(["arena-geometry", "flying", "movement", "pathfinding"]);
for (const selector of selectors) {
  if (selector !== "battle-movement" && !upstream.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const runAll = selectors.length === 0;
const dependencies = runAll ? [] : selectors.filter((item) => upstream.has(item));
if (runAll || dependencies.length > 0) {
  run([new URL("./flying-runner.js", import.meta.url).pathname, ...dependencies]);
}
if (runAll || selectors.includes("battle-movement")) {
  run(["--test", new URL("./battle-movement.test.js", import.meta.url).pathname]);
}
