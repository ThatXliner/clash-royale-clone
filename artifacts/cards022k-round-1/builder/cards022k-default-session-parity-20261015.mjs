import { createHash } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const url = (relative) => pathToFileURL(path.join(root, relative)).href;
const [{ createEditableGameSessionSetup }, { PLAYABLE_CARD_IDS }, { GameSession }] =
  await Promise.all([
    import(url("src/content/editable-deck.js")),
    import(url("src/content/playable-roster.js")),
    import(url("src/sim/game-session.js")),
  ]);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}
const rows = [];
for (const seed of [2, 28, 58, 444]) {
  const setup = createEditableGameSessionSetup([...PLAYABLE_CARD_IDS], seed);
  const session = new GameSession(setup);
  const stages = [];
  const take = (label) => {
    const serialized = session.serialize();
    const replay = session.replayBytes();
    const state = canonical(session.state);
    stages.push({
      label,
      tick: session.state.tick,
      serializeBytes: serialized.length,
      serializeSha256: digest(serialized),
      replayBytes: replay.length,
      replaySha256: digest(replay),
      stateSha256: digest(state),
    });
  };
  take("initial");
  const cardId = session.state.decks.south.hand[0];
  session.submitPlayerCommand(canonical({
    cardId,
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot: 0,
    tick: 0,
    type: "deploy",
  }));
  session.stepMany(1);
  take("tick-1-player-deployment");
  session.stepMany(59);
  take("tick-60-first-ai-boundary");
  session.stepMany(60);
  take("tick-120-second-ai-boundary");
  rows.push({ seed, cardId, stages });
}
process.stdout.write(`${canonical(rows)}\n`);
