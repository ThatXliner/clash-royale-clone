import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "game-player-remount") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

if (selectors.length === 0 || selectors.includes("game-player-remount")) {
  const result = spawnSync(process.execPath, [
    "--test",
    new URL("./game-player-remount.test.js", import.meta.url).pathname,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}
