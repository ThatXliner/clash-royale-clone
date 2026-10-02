import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "editable-deck";
if (selector !== "editable-deck") throw new TypeError(`unknown test selector: ${selector}`);
const result = spawnSync(process.execPath, ["--test",
  new URL("./editable-deck.test.js", import.meta.url).pathname], { stdio: "inherit" });
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
