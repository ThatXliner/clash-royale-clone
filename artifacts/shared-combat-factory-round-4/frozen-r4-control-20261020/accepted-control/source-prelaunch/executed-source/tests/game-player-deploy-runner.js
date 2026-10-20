import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const dependencies = new Set(["deck", "deployment", "elixir", "game-battle", "ui-input"]);
for (const selector of selectors) {
  if (selector !== "game-player-deploy" && !dependencies.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const runAll = selectors.length === 0;
for (const selector of runAll ? [] : selectors.filter((value) => dependencies.has(value))) {
  run([new URL(`./${selector}-runner.js`, import.meta.url).pathname, selector]);
}
if (runAll || selectors.includes("game-player-deploy")) {
  run(["--test", new URL("./game-player-deploy.test.js", import.meta.url).pathname]);
}
