import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "release-build") throw new TypeError(`unknown test selector: ${selector}`);
}

const result = spawnSync(process.execPath, [
  "--test",
  new URL("./release-build.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
