import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const [rootArg, outputArg, label] = process.argv.slice(2);
if (!rootArg || !outputArg || !label) throw new Error("usage: snapshot-probe.mjs root output-dir label");
const root = resolve(rootArg);
const output = resolve(outputArg);
await mkdir(output, { recursive: true });
const { GameSession } = await import(pathToFileURL(join(root, "src/sim/game-session.js")));
const { createShippedGameSessionSetup } = await import(pathToFileURL(join(root, "src/ui/game-browser-entry.js")));
const captures = [];
for (const seed of [0, 23]) {
  const session = new GameSession(createShippedGameSessionSetup(seed));
  for (const tick of [0, 120, 900]) {
    session.stepMany(tick - session.state.tick);
    const bytes = session.serialize();
    const snapshot = JSON.parse(bytes);
    if (snapshot.setup.deck.length !== 8) throw new Error(`seed ${seed} at ${tick} did not use the default eight-card deck`);
    if (session.state.tick !== tick) throw new Error(`expected tick ${tick}, got ${session.state.tick}`);
    const name = `${label}-seed-${seed}-tick-${tick}.json`;
    await writeFile(join(output, name), bytes);
    captures.push({
      file: name,
      seed,
      tick,
      utf8Bytes: Buffer.byteLength(bytes),
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
}
const receipt = { candidate: label, commit: await import("node:child_process").then(({ execFileSync }) =>
  execFileSync("git", ["-C", root, "rev-parse", "HEAD"], { encoding: "utf8" }).trim()), captures };
await writeFile(join(output, `${label}-snapshot-receipt.json`), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(JSON.stringify(receipt, null, 2) + "\n");
