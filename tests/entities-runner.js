import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
const known = new Set([
  "entities",
  "fixed-step",
  "fixed-step-kernel",
  "rng",
]);

for (const selector of selectors) {
  if (!known.has(selector)) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

const requested = selectors.length === 0
  ? ["rng", "fixed-step", "fixed-step-kernel", "entities"]
  : selectors;

const files = {
  entities: "./entities.test.js",
  "fixed-step": "./fixed-step.test.js",
  "fixed-step-kernel": "./fixed-step-kernel.test.js",
  rng: "./rng.test.js",
};

const testPaths = [...new Set(requested.map((name) =>
  new URL(files[name], import.meta.url).pathname
))];
const result = spawnSync(process.execPath, ["--test", ...testPaths], {
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
