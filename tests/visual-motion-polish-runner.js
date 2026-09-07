import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (selector !== "visual-motion-polish") {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

const result = spawnSync(process.execPath, [
  "--test",
  "--test-concurrency=1",
  new URL("./visual-motion-polish.test.js", import.meta.url).pathname,
  new URL("./visual-motion-polish-browser.test.js", import.meta.url).pathname,
  new URL("./visual-terminal-motion-browser.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
