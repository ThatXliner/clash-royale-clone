import { spawnSync } from "node:child_process";

for (const selector of process.argv.slice(2)) {
  if (selector !== "battle-hand-polish") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

const result = spawnSync(process.execPath, [
  "--test", new URL("./battle-hand-polish.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
