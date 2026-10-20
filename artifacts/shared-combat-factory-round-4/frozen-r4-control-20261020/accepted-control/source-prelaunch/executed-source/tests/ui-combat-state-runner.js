import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
if (selectors.length > 0 && !selectors.includes("ui-combat-state")) {
  process.exit(0);
}

const result = spawnSync(
  process.execPath,
  ["--test", new URL("./ui-combat-state.test.js", import.meta.url).pathname],
  { encoding: "utf8", stdio: "inherit" },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
