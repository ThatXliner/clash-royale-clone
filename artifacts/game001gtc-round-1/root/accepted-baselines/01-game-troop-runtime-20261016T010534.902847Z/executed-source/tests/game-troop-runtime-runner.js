import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "game-troop-runtime";
if (selector !== "game-troop-runtime") process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-troop-runtime.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
