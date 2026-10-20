import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "game-restart";
if (selector !== "game-restart") process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-restart.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
