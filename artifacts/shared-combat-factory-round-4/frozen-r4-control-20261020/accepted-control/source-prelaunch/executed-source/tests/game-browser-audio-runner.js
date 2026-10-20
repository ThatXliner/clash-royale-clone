import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "game-browser-audio";
if (selector !== "game-browser-audio") process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-browser-audio.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
