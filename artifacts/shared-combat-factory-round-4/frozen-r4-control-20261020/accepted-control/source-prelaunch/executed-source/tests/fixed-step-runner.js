import { spawnSync } from "node:child_process";

const selectors = new Set(process.argv.slice(2));
const testFile = selectors.has("fixed-step-kernel")
  ? "./fixed-step-kernel.test.js"
  : "./fixed-step.test.js";

const result = spawnSync(
  process.execPath,
  ["--test", new URL(testFile, import.meta.url).pathname],
  { stdio: "inherit" },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
