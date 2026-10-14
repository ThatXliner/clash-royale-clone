import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const load = (path) => import(pathToFileURL(`${root}/${path}`).href);
const [{ createShippedGameSessionSetup }, { GameSession }, editable, playable] = await Promise.all([
  load('src/ui/game-browser-entry.js'),
  load('src/sim/game-session.js'),
  load('src/content/editable-deck.js'),
  load('src/content/playable-roster.js'),
]);
const digest = (value) => createHash('sha256').update(value).digest('hex');
for (const seed of [0, 23]) {
  const setup = createShippedGameSessionSetup(seed);
  const setupDigest = digest(JSON.stringify(setup));
  const session = new GameSession(setup);
  const initial = session.serialize();
  const editableSetup = editable.createEditableGameSessionSetup(playable.PLAYABLE_CARD_IDS, seed);
  const editableMatches = new GameSession(editableSetup).serialize() === initial;
  session.stepMany(120);
  const checkpoint = session.serialize();
  const replay = session.replayBytes();
  const restored = GameSession.restore(checkpoint);
  session.stepMany(120);
  restored.stepMany(120);
  const finalMatches = restored.serialize() === session.serialize();
  const replayMatches = restored.replayBytes() === session.replayBytes();
  console.log(JSON.stringify({ seed, setupSha256: setupDigest, initialSha256: digest(initial), tick120Sha256: digest(checkpoint), replay120Sha256: digest(replay), tick240Sha256: digest(session.serialize()), replay240Sha256: digest(session.replayBytes()), editableMatches, finalMatches, replayMatches }));
}
