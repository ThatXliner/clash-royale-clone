import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
if (selectors.length > 0 && !selectors.includes("game-ui-projection")) process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-ui-projection.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
