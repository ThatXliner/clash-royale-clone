import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "game-input-bridge") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}
if (selectors.length === 0 || selectors.includes("game-input-bridge")) {
  const result = spawnSync(process.execPath, [
    "--test",
    new URL("./game-input-bridge.test.js", import.meta.url).pathname,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
