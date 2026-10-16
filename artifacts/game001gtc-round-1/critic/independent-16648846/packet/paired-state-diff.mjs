import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const roots = process.argv.slice(2).map((path) => resolve(path));
if (roots.length !== 2) throw new TypeError('expected historical and current roots');
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const hash = (value) => createHash('sha256').update(value).digest('hex');
const SOUTH = { x: 3500, y: 14500 }, NORTH = { x: 3500, y: 17500 };
const specs = [
  ['bloom-wisp', 'heal', 'source'], ['dawnmender', 'heal', 'source'], ['pulse-sentry', 'stun', 'enemy'],
  ['rime-adept', 'slow', 'enemy'], ['tether-rider', 'snare', 'enemy'], ['veil-prowler', 'hide', null],
];
async function makeSession(root, id, actionId, targetKind) {
  const mod = async (path) => import(pathToFileURL(resolve(root, path)).href);
  const [{ createSessionTroopWitness }, { createSessionTroopStatusRuntimeProfiles }, { DeckCycle }, { GameSession }] = await Promise.all([
    mod('src/content/session-troop-roster.js'), mod('src/content/session-troop-status-runtime-profiles.js'), mod('src/sim/deck.js'), mod('src/sim/game-session.js'),
  ]);
  const witness = createSessionTroopWitness(id);
  const deck = witness.roster.map(({ id: cardId }) => cardId);
  const cards = new Map(witness.roster.map((card) => [card.id, card]));
  let seed; let targetCard;
  for (let candidate = 0; candidate < 10000; candidate += 1) {
    const southHand = new DeckCycle({ deck, seed: `${candidate}:south` }).state.hand;
    const northHand = new DeckCycle({ deck, seed: `${candidate}:north` }).state.hand;
    if (!southHand.includes(id)) continue;
    targetCard = northHand.find((cardId) => cardId !== id && cards.get(cardId)?.kind === 'unit');
    if (targetCard !== undefined) { seed = candidate; break; }
  }
  if (seed === undefined) throw new Error(`no deterministic seed for ${id}`);
  const setup = {
    battleSetup: canonical(witness), deck,
    legalNorthDeployments: [{ cardId: targetCard, point: NORTH }],
    rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
    seed, startingElixir: { north: 10, south: 10 },
    statusRuntimeProfiles: createSessionTroopStatusRuntimeProfiles(),
    thinkIntervalTicks: 1000, thinkOffsetTicks: 0,
  };
  const session = new GameSession(canonical(setup));
  const slot = session.state.decks.south.hand.indexOf(id);
  session.submitPlayerCommand(canonical({ cardId: id, commandId: 0, point: SOUTH, slot, tick: session.state.tick, type: 'deploy' }));
  session.step();
  const source = session.state.battle.units.find((unit) => unit.side === 'south' && unit.cardId === id);
  const target = session.state.battle.units.find((unit) => unit.side === 'north' && unit.alive);
  if (!source || !target) throw new Error(`missing units for ${id}`);
  const targetId = targetKind === null ? null : targetKind === 'source' ? source.id : target.id;
  session.submitPlayerCommand(canonical({ actionId, commandId: 1, point: null, side: 'south', sourceId: source.id, targetId, tick: session.state.tick, type: 'status' }));
  session.stepMany(10);
  const snapshot = session.serialize();
  const replay = session.replayBytes();
  const state = canonical(session.state);
  return {
    targetCard, runtimeStateBytes: Buffer.byteLength(state), runtimeStateSha256: hash(state),
    replaySha256: hash(replay), snapshotBytes: Buffer.byteLength(snapshot), snapshotSha256: hash(snapshot),
    units: session.state.battle.units.map((unit) => ({
      id: unit.id, cardId: unit.cardId, archetypeId: unit.archetypeId ?? null, side: unit.side,
      memberIndex: unit.memberIndex ?? null, spawnTick: unit.spawnTick ?? unit.deploymentTick ?? null,
      position: unit.position, hitpoints: unit.hitpoints ?? unit.health ?? null,
      maxHealth: unit.maxHealth ?? null, alive: unit.alive ?? null,
      keys: Object.keys(unit).sort(),
    })),
    state: session.state,
  };
}
function diff(a, b, path = '$', output = []) {
  if (output.length >= 200) return output;
  if (Object.is(a, b)) return output;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) output.push({ path: `${path}.length`, historical: a.length, current: b.length });
    for (let i = 0; i < Math.max(a.length, b.length) && output.length < 200; i += 1) {
      if (i >= a.length) output.push({ path: `${path}[${i}]`, historical: '<missing>', current: b[i] });
      else if (i >= b.length) output.push({ path: `${path}[${i}]`, historical: a[i], current: '<missing>' });
      else diff(a[i], b[i], `${path}[${i}]`, output);
    }
    return output;
  }
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) && !Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])].sort();
    for (const key of keys) {
      if (output.length >= 200) break;
      if (!Object.hasOwn(a, key)) output.push({ path: `${path}.${key}`, historical: '<missing>', current: b[key] });
      else if (!Object.hasOwn(b, key)) output.push({ path: `${path}.${key}`, historical: a[key], current: '<missing>' });
      else diff(a[key], b[key], `${path}.${key}`, output);
    }
    return output;
  }
  output.push({ path, historical: a, current: b });
  return output;
}
const results = [];
for (const [id, actionId, targetKind] of specs) {
  const historical = await makeSession(roots[0], id, actionId, targetKind);
  const current = await makeSession(roots[1], id, actionId, targetKind);
  const differences = diff(historical.state, current.state);
  const { state: _oldState, ...oldSummary } = historical;
  const { state: _currentState, ...currentSummary } = current;
  results.push({ id, historical: oldSummary, current: currentSummary, stateDiffCount: differences.length, stateDiffTruncatedAt200: differences.length >= 200, stateDiffs: differences });
}
process.stdout.write(JSON.stringify({ historicalRoot: roots[0], currentRoot: roots[1], results }, null, 2) + '\n');
