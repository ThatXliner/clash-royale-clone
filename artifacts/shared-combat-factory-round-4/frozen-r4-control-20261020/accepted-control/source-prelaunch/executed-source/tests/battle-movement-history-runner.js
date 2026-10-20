import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
if (selectors.some((selector) => selector !== "battle-movement-history")) {
  throw new TypeError("unknown test selector");
}

const result = spawnSync(process.execPath, [
  "--test",
  new URL("./battle-movement-history.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
