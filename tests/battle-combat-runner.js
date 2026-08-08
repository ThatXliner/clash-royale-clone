import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const upstream = new Set(["attack-cycle", "damage", "projectile", "targeting"]);
for (const selector of selectors) {
  if (selector !== "battle-combat" && !upstream.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const runAll = selectors.length === 0;
if (runAll || selectors.some((selector) => upstream.has(selector))) {
  run([
    new URL("./projectile-runner.js", import.meta.url).pathname,
    ...(runAll ? [] : selectors.filter((selector) => upstream.has(selector))),
  ]);
}
if (runAll || selectors.includes("battle-combat")) {
  run(["--test", new URL("./battle-combat.test.js", import.meta.url).pathname]);
}
