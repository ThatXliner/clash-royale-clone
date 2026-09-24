import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "browser-frame-restore";
if (selector !== "browser-frame-restore") process.exit(0);
const result = spawnSync(process.execPath, ["--test",
  new URL("./browser-frame-restore.test.js", import.meta.url).pathname],
{ stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
