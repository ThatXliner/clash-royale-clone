import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const legacy = new Set([
  "entities",
  "fixed-step",
  "fixed-step-kernel",
  "rng",
]);
for (const selector of selectors) {
  if (selector !== "damage" && !legacy.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const runAll = selectors.length === 0;
const legacySelectors = runAll
  ? []
  : selectors.filter((selector) => legacy.has(selector));
if (runAll || legacySelectors.length > 0) {
  run([
    new URL("./entities-runner.js", import.meta.url).pathname,
    ...legacySelectors,
  ]);
}
if (runAll || selectors.includes("damage")) {
  run([
    "--test",
    new URL("./damage.test.js", import.meta.url).pathname,
  ]);
}
