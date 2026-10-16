import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = resolve(process.argv[2]);
const kind = process.argv[3];
const mod = async (path) => import(pathToFileURL(resolve(root, path)).href);
const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const clone = (value) => structuredClone(value);
const hash = (value) => createHash('sha256').update(value).digest('hex');
const BRIAR_QUESTION_KEYS = new Set([
  'briar-darter.count', 'briar-darter.damage', 'briar-darter.deploy-time-ticks',
  'briar-darter.first-hit-ticks', 'briar-darter.hit-speed-ticks', 'briar-darter.hitpoints',
  'briar-darter.movement-millitiles-per-second', 'briar-darter.range-millitiles',
  'briar-darter.sight-range-millitiles', 'briar-darter.target-mode',
  'briar-runner.count', 'briar-runner.damage', 'briar-runner.deploy-time-ticks',
  'briar-runner.first-hit-ticks', 'briar-runner.hit-speed-ticks', 'briar-runner.hitpoints',
  'briar-runner.movement-millitiles-per-second', 'briar-runner.range-millitiles',
  'briar-runner.sight-range-millitiles', 'briar-runner.target-mode',
]);
function ablateBriarSourceWitness(serialized) {
  const removed = { policies: 0, questions: 0 };
  function walk(value) {
    if (typeof value === 'string' && /^[\\[{]/u.test(value)) {
      try {
        const parsed = JSON.parse(value);
        const before = removed.policies + removed.questions;
        const cleaned = walk(parsed);
        if (removed.policies + removed.questions !== before) return canonical(cleaned);
        return value;
      } catch { return value; }
    }
    if (Array.isArray(value)) {
      const kept = [];
      for (const item of value) {
        if (item && typeof item === 'object' && !Array.isArray(item) &&
            BRIAR_QUESTION_KEYS.has(item.key)) {
          removed.questions += 1;
          continue;
        }
        kept.push(walk(item));
      }
      return kept;
    }
    if (value !== null && typeof value === 'object') {
      const cleaned = { ...value };
      if ((cleaned.archetypeId === 'briar-runner' || cleaned.archetypeId === 'briar-darter') &&
          Object.hasOwn(cleaned, 'sourceConfidencePolicy')) {
        delete cleaned.sourceConfidencePolicy;
        removed.policies += 1;
      }
      for (const [key, child] of Object.entries(cleaned)) cleaned[key] = walk(child);
      return cleaned;
    }
    return value;
  }
  const bytes = canonical(walk(JSON.parse(serialized)));
  return { bytes: Buffer.byteLength(bytes), sha256: hash(bytes), removed, residualComparedToHistorical: null };
}
if (kind === 'empty') {
  const { createPlayableRoster, createPlayableRosterQuestionRecords } = await mod('src/content/playable-roster.js');
  const { LiveBattle, parseLiveBattleSetup } = await mod('src/sim/live-battle.js');
  const setup = { initialWindupTicks: { central: 0, lane: 0 }, questions: clone(createPlayableRosterQuestionRecords()), roster: clone(createPlayableRoster()) };
  const bytes = new LiveBattle(parseLiveBattleSetup(canonical(setup))).serialize();
  const policies = setup.roster.flatMap(({ id, entities }) => entities.filter(({ sourceConfidencePolicy }) => sourceConfidencePolicy !== undefined).map(({ archetypeId, sourceConfidencePolicy }) => ({ cardId: id, archetypeId, fields: sourceConfidencePolicy.fields?.length ?? 0, deploymentInterval: sourceConfidencePolicy.deploymentInterval ?? null })));
  const briarQuestions = setup.questions.filter(({ key }) => key.startsWith('briar-runner.') || key.startsWith('briar-darter.'));
  process.stdout.write(JSON.stringify({ kind, root, bytes: Buffer.byteLength(bytes), sha256: hash(bytes), version: JSON.parse(bytes).version, ablation: ablateBriarSourceWitness(bytes), rosterCards: setup.roster.length, totalQuestions: setup.questions.length, sourcePolicyEntities: policies.length, sourceQuestionCountForBriar: briarQuestions.length, policies }, null, 2) + '\n');
} else if (kind === 'status') {
  const [{ createSessionTroopWitness }, { createSessionTroopStatusRuntimeProfiles }, { DeckCycle }, { GameSession }] = await Promise.all([
    mod('src/content/session-troop-roster.js'), mod('src/content/session-troop-status-runtime-profiles.js'), mod('src/sim/deck.js'), mod('src/sim/game-session.js'),
  ]);
  const ids = [
    ['bloom-wisp', 'heal', 'source'], ['dawnmender', 'heal', 'source'], ['pulse-sentry', 'stun', 'enemy'],
    ['rime-adept', 'slow', 'enemy'], ['tether-rider', 'snare', 'enemy'], ['veil-prowler', 'hide', null],
  ];
  const south = { x: 3500, y: 14500 }, north = { x: 3500, y: 17500 };
  const results = [];
  for (const [id, actionId, targetKind] of ids) {
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
      legalNorthDeployments: [{ cardId: targetCard, point: north }],
      rosterWitness: canonical({ questions: witness.questions, roster: witness.roster }),
      seed, startingElixir: { north: 10, south: 10 },
      statusRuntimeProfiles: createSessionTroopStatusRuntimeProfiles(),
      thinkIntervalTicks: 1000, thinkOffsetTicks: 0,
    };
    const session = new GameSession(canonical(setup));
    const slot = session.state.decks.south.hand.indexOf(id);
    session.submitPlayerCommand(canonical({ cardId: id, commandId: 0, point: south, slot, tick: session.state.tick, type: 'deploy' }));
    session.step();
    const source = session.state.battle.units.find((unit) => unit.side === 'south' && unit.cardId === id);
    const target = session.state.battle.units.find((unit) => unit.side === 'north' && unit.alive);
    if (!source || !target) throw new Error(`missing units for ${id}`);
    const targetId = targetKind === null ? null : targetKind === 'source' ? source.id : target.id;
    session.submitPlayerCommand(canonical({ actionId, commandId: 1, point: null, side: 'south', sourceId: source.id, targetId, tick: session.state.tick, type: 'status' }));
    session.stepMany(10);
    const replay = session.replayBytes();
    const snapshot = session.serialize();
    const runtimeState = canonical(session.state);
    const briar = witness.roster.find(({ id: cardId }) => cardId === 'briar-band');
    const briarQuestionKeys = witness.questions.filter(({ key }) => key.startsWith('briar-runner.') || key.startsWith('briar-darter.')).map(({ key }) => key);
    const policyEntities = witness.roster.flatMap(({ id: cardId, entities }) => entities.filter(({ sourceConfidencePolicy }) => sourceConfidencePolicy !== undefined).map(({ archetypeId }) => `${cardId}/${archetypeId}`));
    results.push({ id, seed, targetCard, runtimeStateBytes: Buffer.byteLength(runtimeState), runtimeStateSha256: hash(runtimeState), replayBytes: Buffer.byteLength(replay), replaySha256: hash(replay), snapshotBytes: Buffer.byteLength(snapshot), snapshotSha256: hash(snapshot), ablation: ablateBriarSourceWitness(snapshot), rosterCards: witness.roster.length, totalQuestions: witness.questions.length, briarEntities: briar?.entities?.map(({ archetypeId, sourceConfidencePolicy }) => ({ archetypeId, deploymentInterval: sourceConfidencePolicy?.deploymentInterval ?? null })) ?? null, briarQuestionCount: briarQuestionKeys.length, briarQuestionKeys, sourcePolicyEntities: policyEntities.length, sessionSetupSha256: hash(canonical(JSON.parse(snapshot).setup)) });
  }
  process.stdout.write(JSON.stringify({ kind, root, results }, null, 2) + '\n');
} else throw new TypeError('expected empty or status');
