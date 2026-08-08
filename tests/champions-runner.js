import { spawnSync } from "node:child_process";

if (process.argv[2] !== "champions") {
  throw new TypeError("champions runner requires the champions selector");
}

const result = spawnSync(
  process.execPath,
  ["--test", new URL("./champions.test.js", import.meta.url).pathname],
  { stdio: "inherit" },
);
if (result.error) throw result.error;
if (result.status !== 0) process.exitCode = result.status ?? 1;
