import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "deck") {
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
  run([new URL("./elixir-runner.js", import.meta.url).pathname]);
}
if (runAll || selectors.includes("deck")) {
  run(["--test", new URL("./deck.test.js", import.meta.url).pathname]);
}
