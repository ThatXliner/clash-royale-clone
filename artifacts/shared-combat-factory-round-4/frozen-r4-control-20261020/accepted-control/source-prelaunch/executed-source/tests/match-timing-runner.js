import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "match-timing") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (selectors.length === 0) {
  run([new URL("./deck-runner.js", import.meta.url).pathname]);
}
run(["--test", new URL("./match-timing.test.js", import.meta.url).pathname]);
