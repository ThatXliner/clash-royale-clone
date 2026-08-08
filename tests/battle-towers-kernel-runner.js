import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "battle-towers-kernel";
if (selector !== "battle-towers-kernel") process.exit(0);
const result = spawnSync(process.execPath, [
  "--test",
  new URL("./battle-towers-kernel.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
