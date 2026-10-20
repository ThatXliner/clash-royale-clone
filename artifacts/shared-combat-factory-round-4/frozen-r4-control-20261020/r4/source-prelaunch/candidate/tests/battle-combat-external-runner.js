import { spawnSync } from "node:child_process";

const selector = process.argv[2] ?? "battle-combat-external";
if (selector !== "battle-combat-external") process.exit(0);
const result = spawnSync(process.execPath, ["--test", new URL(
  "./battle-combat-external.test.js", import.meta.url,
).pathname], { encoding: "utf8", stdio: "inherit" });
process.exit(result.status ?? 1);
