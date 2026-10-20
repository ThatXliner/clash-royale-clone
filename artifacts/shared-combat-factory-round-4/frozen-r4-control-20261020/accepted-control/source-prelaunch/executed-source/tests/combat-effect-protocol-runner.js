import { spawnSync } from "node:child_process";
const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "combat-effect-protocol") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}
const result = spawnSync(
  process.execPath,
  ["--test", new URL("./combat-effect-protocol.test.js", import.meta.url).pathname],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
process.exit(result.status ?? 1);
