import { spawnSync } from "node:child_process";

const selector = process.argv[2];
if (selector !== "game-building-policy") {
  throw new TypeError(`game building policy runner requires its exact selector, received ${String(selector)}`);
}
const result = spawnSync(process.execPath, ["--test",
  new URL("./game-building-policy.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
