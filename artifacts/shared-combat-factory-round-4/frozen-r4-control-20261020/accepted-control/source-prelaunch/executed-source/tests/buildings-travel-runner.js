import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
if (
  selectors.length > 1 ||
  (selectors.length === 1 && selectors[0] !== "buildings-travel")
) throw new TypeError("unknown buildings-travel selector");

const result = spawnSync(
  process.execPath,
  ["--test", new URL("./buildings-travel.test.js", import.meta.url).pathname],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
