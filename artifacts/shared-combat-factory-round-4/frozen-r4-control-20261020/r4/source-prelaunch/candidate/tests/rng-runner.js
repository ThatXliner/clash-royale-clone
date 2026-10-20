import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const isRngRun = selectors.includes("rng");
const command = isRngRun
  ? ["--test", new URL("./rng.test.js", import.meta.url).pathname]
  : [new URL("./fixed-step-runner.js", import.meta.url).pathname, ...selectors];

const result = spawnSync(process.execPath, command, { stdio: "inherit" });
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
