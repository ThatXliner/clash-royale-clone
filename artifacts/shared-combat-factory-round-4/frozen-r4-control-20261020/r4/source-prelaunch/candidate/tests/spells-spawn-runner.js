import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const upstream = new Set([
  "deployment",
  "periodic-spawns",
  "rng",
  "spawn-placement",
  "spells-instant",
]);
for (const selector of selectors) {
  if (selector !== "spells-spawn" && !upstream.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(file) {
  const result = spawnSync(process.execPath, [
    "--test",
    new URL(file, import.meta.url).pathname,
  ], { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

if (selectors.length === 0 || selectors.includes("spells-spawn")) {
  run("./spells-spawn.test.js");
}
for (const selector of selectors) {
  if (upstream.has(selector)) run(`./${selector}.test.js`);
}
