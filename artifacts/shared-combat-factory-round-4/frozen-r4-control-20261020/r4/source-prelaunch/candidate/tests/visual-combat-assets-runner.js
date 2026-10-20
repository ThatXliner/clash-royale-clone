import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "visual-combat-assets") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

const result = spawnSync(process.execPath, [
  "--test",
  new URL("./visual-combat-assets.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
