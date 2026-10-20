import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "game-spell-runtime";
if (selector !== "game-spell-runtime") process.exit(0);

const result = spawnSync(process.execPath, ["--test",
  new URL("./game-spell-runtime.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
