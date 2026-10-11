import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const [baselineRoot, candidateRoot, evidenceRoot] = process.argv.slice(2);
if (!baselineRoot || !candidateRoot || !evidenceRoot) {
  throw new TypeError("usage: compare-legacy-default-snapshots.mjs BASELINE CANDIDATE EVIDENCE");
}

async function loadSession(root) {
  const baseUrl = pathToFileURL(`${root.replace(/\/$/u, "")}/`).href;
  const [browser, kernel] = await Promise.all([
    import(new URL("src/ui/game-browser-entry.js", baseUrl).href),
    import(new URL("src/sim/game-session.js", baseUrl).href),
  ]);
  return { createSetup: browser.createShippedGameSessionSetup, GameSession: kernel.GameSession };
}

const baseline = await loadSession(baselineRoot);
const candidate = await loadSession(candidateRoot);
const receipt = { baselineRoot, candidateRoot, seeds: [0, 23], ticks: [0, 120, 900], cases: [] };
await mkdir(`${evidenceRoot}/snapshots`, { recursive: true });

for (const seed of receipt.seeds) {
  const sessions = [
    ["baseline", baseline, new baseline.GameSession(baseline.createSetup(seed))],
    ["candidate", candidate, new candidate.GameSession(candidate.createSetup(seed))],
  ];
  for (const tick of receipt.ticks) {
    for (const [label, , session] of sessions) {
      if (session.state.tick < tick) session.stepMany(tick - session.state.tick);
      const bytes = session.serialize();
      await writeFile(`${evidenceRoot}/snapshots/${label}-seed-${seed}-tick-${tick}.json`, bytes);
    }
    const baselineBytes = await (await import("node:fs/promises")).readFile(
      `${evidenceRoot}/snapshots/baseline-seed-${seed}-tick-${tick}.json`, "utf8");
    const candidateBytes = await (await import("node:fs/promises")).readFile(
      `${evidenceRoot}/snapshots/candidate-seed-${seed}-tick-${tick}.json`, "utf8");
    receipt.cases.push({
      seed,
      tick,
      equal: baselineBytes === candidateBytes,
      bytes: Buffer.byteLength(candidateBytes),
      sha256: createHash("sha256").update(candidateBytes).digest("hex"),
      baselineSha256: createHash("sha256").update(baselineBytes).digest("hex"),
    });
  }
}
await writeFile(`${evidenceRoot}/legacy-default-snapshot-comparison.json`,
  `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify(receipt, null, 2));
if (receipt.cases.some(({ equal }) => !equal)) process.exitCode = 1;
