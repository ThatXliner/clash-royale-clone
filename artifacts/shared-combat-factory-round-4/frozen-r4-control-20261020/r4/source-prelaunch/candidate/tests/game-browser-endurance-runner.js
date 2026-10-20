import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "game-browser-endurance";
if (selector !== "game-browser-endurance") process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-browser-endurance.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
