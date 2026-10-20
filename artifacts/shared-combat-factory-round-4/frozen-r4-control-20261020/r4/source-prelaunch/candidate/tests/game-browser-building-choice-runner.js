import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "game-browser-building-choice";
if (selector !== "game-browser-building-choice") process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-browser-building-choice.test.js", import.meta.url).pathname],
{ stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
