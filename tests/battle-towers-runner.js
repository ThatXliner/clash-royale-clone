import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const allowed = new Set(["battle-combat", "battle-towers", "towers"]);
for (const selector of selectors) {
  if (!allowed.has(selector)) throw new TypeError(`unknown test selector: ${selector}`);
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const all = selectors.length === 0;
if (all || selectors.includes("battle-combat")) {
  run([new URL("./battle-combat-runner.js", import.meta.url).pathname, "battle-combat"]);
}
if (all || selectors.includes("towers")) {
  run([new URL("./towers-runner.js", import.meta.url).pathname, "towers"]);
}
if (all || selectors.includes("battle-towers")) {
  run(["--test", new URL("./battle-towers.test.js", import.meta.url).pathname]);
}
