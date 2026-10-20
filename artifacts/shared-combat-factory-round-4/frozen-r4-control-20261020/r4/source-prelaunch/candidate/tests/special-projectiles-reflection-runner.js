import { spawnSync } from "node:child_process";

const selector = process.argv[2];
if (selector !== "special-projectiles-reflection") {
  console.error(`unknown reflection selector: ${selector ?? "(missing)"}`);
  process.exit(1);
}
const result = spawnSync(process.execPath, [
  "--test",
  new URL("./special-projectiles-reflection.test.js", import.meta.url).pathname,
], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
