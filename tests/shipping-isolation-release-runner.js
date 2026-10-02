import { spawnSync } from "node:child_process";

for (const selector of process.argv.slice(2)) {
  if (selector !== "shipping-isolation-release") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

const result = spawnSync(process.execPath, [
  "--test",
  new URL("./shipping-isolation-release.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
