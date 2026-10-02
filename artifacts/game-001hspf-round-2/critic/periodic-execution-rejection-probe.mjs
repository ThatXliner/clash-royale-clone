import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createPlayableRoster, createPlayableRosterQuestionRecords } from './src/content/playable-roster.js';
import { createSessionSpellProfileReceipts } from './src/content/session-spell-profile-receipts.js';
import { projectSessionNonUnitBattleCard } from './src/content/session-card-catalog.js';
import { DeckCycle } from './src/sim/deck.js';
import { GameSession } from './src/sim/game-session.js';
import { LiveBattle } from './src/sim/live-battle.js';
const ids = ['blight-ring', 'fault-pulse', 'gravity-well'];
const SOUTH = { x: 3500, y: 14500 }, NORTH = { x: 3500, y: 17500 };
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const sha = (value) => createHash('sha256').update(value).digest('hex');
function battleFor(id) {
  const roster = structuredClone(createPlayableRoster());
  roster[0] = structuredClone(projectSessionNonUnitBattleCard('squall-orb'));
  roster[roster.length - 1] = structuredClone(projectSessionNonUnitBattleCard(id));
  const referenced = new Set(roster.flatMap(({ entities }) => entities.flatMap((entity) =>
    [entity.bodyRadiusPolicy, entity.projectileSpeedPolicy].filter((policy) => policy.kind === 'question').map(({ questionKey }) => questionKey))));
  const questions = createPlayableRosterQuestionRecords().filter(({ key }) => referenced.has(key));
  return { initialWindupTicks: { central: 0, lane: 0 }, questions, roster,
    spellProfileReceipts: createSessionSpellProfileReceipts() };
}
function seedWithWitness(deck, id) {
  for (let seed = 0; seed < 10000; seed += 1) {
    const south = new DeckCycle({ deck, seed: `${seed}:south` }).state.hand;
    const north = new DeckCycle({ deck, seed: `${seed}:north` }).state.hand;
    if (south.includes('squall-orb') && south.includes(id) && north.includes('mossguard')) return seed;
  }
  throw new Error(`no deterministic hand witness for ${id}`);
}
for (const id of ids) {
  const battleSetup = battleFor(id), deck = battleSetup.roster.map(({ id: cardId }) => cardId);
  const seed = seedWithWitness(deck, id);
  const setup = canonical({ battleSetup: canonical(battleSetup), deck,
    legalNorthDeployments: [{ cardId: 'mossguard', point: NORTH }],
    rosterWitness: canonical({ questions: battleSetup.questions, roster: battleSetup.roster }),
    seed, startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 3600, thinkOffsetTicks: 0 });
  const session = new GameSession(setup);
  session.step();
  const unit = session.state.battle.units.find(({ cardId, side, alive }) => cardId === 'mossguard' && side === 'north' && alive);
  assert.ok(unit, `${id}: shared target materialized`);
  const slot = session.state.decks.south.hand.indexOf(id);
  assert.notEqual(slot, -1, `${id}: target card in hand`);
  const command = canonical({ cardId: id, commandId: 90, point: SOUTH, side: 'south', slot,
    target: { id: unit.id, kind: 'unit' }, tick: session.state.tick, type: 'spell' });
  const sessionBefore = session.serialize(), sessionStateBefore = session.state;
  let sessionError;
  try { session.submitPlayerCommand(command); } catch (error) { sessionError = error; }
  assert.ok(sessionError instanceof Error, `${id}: GameSession rejected incomplete profile`);
  assert.match(sessionError.message, /explicit QUESTION/u);
  const sessionAfterBytes = session.serialize(), sessionStateAfter = session.state;
  assert.equal(sessionAfterBytes, sessionBefore, `${id}: GameSession rejection is byte-atomic`);
  assert.equal(canonical(sessionStateAfter.cardRuntime.history), canonical(sessionStateBefore.cardRuntime.history));
  assert.equal(sessionStateAfter.decks.south.sequence, sessionStateBefore.decks.south.sequence);
  assert.equal(sessionStateAfter.decks.south.hand.join(','), sessionStateBefore.decks.south.hand.join(','));
  assert.equal(sessionStateAfter.elixir.sides.south.amount, sessionStateBefore.elixir.sides.south.amount);

  const live = new LiveBattle(canonical(battleSetup));
  live.scheduleDeploy(canonical({ cardId: 'mossguard', point: NORTH, sequence: 0, side: 'north', tick: 0 }));
  live.step();
  const liveUnit = live.state.units.find(({ cardId, side, alive }) => cardId === 'mossguard' && side === 'north' && alive);
  assert.ok(liveUnit, `${id}: LiveBattle shared target materialized`);
  const liveBefore = live.serialize(), liveEventsBefore = canonical(live.events), liveHistoryBefore = canonical(live.history);
  let liveError;
  try { live.scheduleSpell({ cardId: id, point: SOUTH, sequence: 1, side: 'south',
    target: { id: liveUnit.id, kind: 'unit' }, tick: live.state.tick }); }
  catch (error) { liveError = error; }
  assert.ok(liveError instanceof Error, `${id}: LiveBattle rejected incomplete profile`);
  assert.match(liveError.message, /explicit QUESTION/u);
  const liveAfter = live.serialize();
  assert.equal(liveAfter, liveBefore, `${id}: LiveBattle rejection is byte-atomic`);
  assert.equal(canonical(live.events), liveEventsBefore);
  assert.equal(canonical(live.history), liveHistoryBefore);
  console.log(JSON.stringify({ id, seed, session: { accepted: false, error: sessionError.message,
    serializedBeforeSha256: sha(sessionBefore), serializedAfterSha256: sha(sessionAfterBytes),
    unchanged: true, priorRouteCount: sessionStateBefore.cardRuntime.history.length,
    routeCountAfter: sessionStateAfter.cardRuntime.history.length,
    deckSequenceBefore: sessionStateBefore.decks.south.sequence,
    deckSequenceAfter: sessionStateAfter.decks.south.sequence,
    southElixirBefore: sessionStateBefore.elixir.sides.south.amount,
    southElixirAfter: sessionStateAfter.elixir.sides.south.amount },
    liveBattle: { accepted: false, error: liveError.message,
      serializedBeforeSha256: sha(liveBefore), serializedAfterSha256: sha(liveAfter),
      unchanged: true, pendingSpellIntentsAfter: live.state.pendingSpellIntents.length } }));
}
console.log('ALL_PERIODIC_EXECUTION_REJECTION_PROBES_PASSED');
