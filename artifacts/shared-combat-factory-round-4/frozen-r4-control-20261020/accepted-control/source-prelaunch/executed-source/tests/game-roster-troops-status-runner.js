import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== "game-roster-troops-status") {
  throw new TypeError(
    `game roster troop status runner requires its exact selector, received ${args.join(" ")}`,
  );
}
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-roster-troops-status.test.js", import.meta.url).pathname], {
  stdio: "inherit",
});
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
