import { spawnSync } from "node:child_process";

const selector = process.argv[2];
if (selector !== "game-roster-troops-ordinary") {
  throw new TypeError(
    `game roster ordinary troop runner requires its exact selector, received ${String(selector)}`
  );
}
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-roster-troops-ordinary.test.js", import.meta.url).pathname], {
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
