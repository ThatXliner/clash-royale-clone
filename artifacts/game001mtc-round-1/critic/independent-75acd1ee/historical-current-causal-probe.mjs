import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const [historicalRootArg, currentRootArg, outputArg] = process.argv.slice(2);
if (!historicalRootArg || !currentRootArg || !outputArg) {
  throw new TypeError('usage: historical-current-causal-probe.mjs HISTORICAL_ROOT CURRENT_ROOT OUTPUT_JSON');
}
const historicalRoot = resolve(historicalRootArg);
const currentRoot = resolve(currentRootArg);
const outputPath = resolve(outputArg);
const checkpoints = [120, 200, 320];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
function jsonClone(value) { return JSON.parse(JSON.stringify(value)); }
function sha256(text) { return createHash('sha256').update(text).digest('hex'); }
function byteLength(text) { return Buffer.byteLength(text, 'utf8'); }
function deepDiff(left, right, path = '$', found = []) {
  if (Object.is(left, right)) return found;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    found.push({ path, left, right });
    return found;
  }
  if (Array.isArray(left) !== Array.isArray(right)) {
    found.push({ path, leftType: Array.isArray(left) ? 'array' : typeof left,
      rightType: Array.isArray(right) ? 'array' : typeof right });
    return found;
  }
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  for (const key of [...new Set([...leftKeys, ...rightKeys])].sort()) {
    if (!Object.hasOwn(left, key)) found.push({ path: `${path}.${key}`, right: right[key], missing: 'left' });
    else if (!Object.hasOwn(right, key)) found.push({ path: `${path}.${key}`, left: left[key], missing: 'right' });
    else deepDiff(left[key], right[key], Array.isArray(left) ? `${path}[${key}]` : `${path}.${key}`, found);
  }
  return found;
}
function byteDelta(left, right) {
  const a = Buffer.from(left, 'utf8');
  const b = Buffer.from(right, 'utf8');
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < Math.min(a.length, b.length) - prefix &&
      a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix += 1;
  return {
    leftBytes: a.length,
    rightBytes: b.length,
    deltaBytes: b.length - a.length,
    commonPrefixBytes: prefix,
    commonSuffixBytes: suffix,
    leftChangedWindowBytes: a.length - prefix - suffix,
    rightChangedWindowBytes: b.length - prefix - suffix,
  };
}
async function loadVersion(label, root) {
  const importSource = async (relativePath) => import(pathToFileURL(resolve(root, relativePath)).href);
  const roster = await importSource('src/content/session-troop-roster.js');
  const movement = await importSource('src/content/session-troop-movement-runtime-profiles.js');
  const live = await importSource('src/sim/live-battle.js');
  const witnessBytes = roster.serializeSessionTroopWitness('mossguard');
  const witness = JSON.parse(witnessBytes);
  const movementBytes = movement.serializeSessionTroopMovementRuntimeProfiles();

  function makeBattle(kind) {
    const setup = live.parseLiveBattleSetup(witnessBytes);
    return kind === 'ordinary' ? new live.LiveBattle(setup) :
      new live.LiveBattle(setup, movementBytes);
  }
  function deploy(battle, command) {
    return battle.scheduleDeploy(canonical(command));
  }
  const battles = Object.fromEntries(['ordinary', 'profiled'].map((kind) => [kind, makeBattle(kind)]));
  for (const battle of Object.values(battles)) {
    deploy(battle, {
      cardId: 'cinderlings', point: { x: 12_500, y: 17_500 },
      sequence: 5, side: 'north', tick: 0,
    });
  }
  let secondScheduled = false;
  const captures = Object.fromEntries(['ordinary', 'profiled'].map((kind) => [kind, {}]));
  for (let stepped = 0; stepped < 320; stepped += 1) {
    const tickBeforeStep = battles.ordinary.state.tick;
    if (!secondScheduled && tickBeforeStep === 96) {
      secondScheduled = true;
      for (const battle of Object.values(battles)) {
        deploy(battle, {
          cardId: 'cinderlings', point: { x: 15_500, y: 14_500 },
          sequence: 6, side: 'south', tick: 96,
        });
      }
    }
    for (const [kind, battle] of Object.entries(battles)) {
      battle.step();
      if (checkpoints.includes(battle.state.tick)) {
        const snapshotText = battle.serialize();
        const snapshot = JSON.parse(snapshotText);
        const snapshotWithoutSetup = jsonClone(snapshot);
        const setupPresent = Object.hasOwn(snapshotWithoutSetup, 'setup');
        delete snapshotWithoutSetup.setup;
        captures[kind][battle.state.tick] = {
          state: jsonClone(battle.state),
          events: jsonClone(battle.events),
          replay: jsonClone(battle.replay),
          snapshotText,
          snapshot,
          snapshotWithoutSetupText: JSON.stringify(snapshotWithoutSetup),
          snapshotTopLevelKeys: Object.keys(snapshot),
          setupPresent,
        };
      }
    }
  }
  return {
    label,
    sourceRoot: root,
    witness: {
      bytes: witnessBytes,
      byteLength: byteLength(witnessBytes),
      sha256: sha256(witnessBytes),
      parsed: witness,
      rosterBytes: byteLength(JSON.stringify(witness.roster)),
      questionBytes: byteLength(JSON.stringify(witness.questions)),
      rosterCardIds: witness.roster?.map(({ id }) => id),
      questionCount: witness.questions?.length,
    },
    movementReceipt: {
      bytes: movementBytes,
      byteLength: byteLength(movementBytes),
      sha256: sha256(movementBytes),
    },
    deploymentSchedule: [
      { cardId: 'cinderlings', point: { x: 12_500, y: 17_500 }, sequence: 5, side: 'north', tick: 0 },
      { cardId: 'cinderlings', point: { x: 15_500, y: 14_500 }, sequence: 6, side: 'south', tick: 96 },
    ],
    finalTick: battles.ordinary.state.tick,
    captures,
  };
}
function compareVersions(historical, current) {
  const witnessDiff = deepDiff(historical.witness.parsed, current.witness.parsed);
  const comparisons = {};
  for (const kind of ['ordinary', 'profiled']) {
    comparisons[kind] = {};
    for (const tick of checkpoints) {
      const oldCapture = historical.captures[kind][tick];
      const newCapture = current.captures[kind][tick];
      comparisons[kind][tick] = {
        stateEqual: deepDiff(oldCapture.state, newCapture.state).length === 0,
        stateDiff: deepDiff(oldCapture.state, newCapture.state),
        fullEventsEqual: deepDiff(oldCapture.events, newCapture.events).length === 0,
        fullEventsDiff: deepDiff(oldCapture.events, newCapture.events),
        replayEqual: deepDiff(oldCapture.replay, newCapture.replay).length === 0,
        replayDiff: deepDiff(oldCapture.replay, newCapture.replay),
        snapshotEqualAfterRemovingOnlySetup:
          oldCapture.snapshotWithoutSetupText === newCapture.snapshotWithoutSetupText,
        snapshotWithoutSetupDiff: deepDiff(
          JSON.parse(oldCapture.snapshotWithoutSetupText),
          JSON.parse(newCapture.snapshotWithoutSetupText),
        ),
        snapshotTopLevelKeys: {
          historical: oldCapture.snapshotTopLevelKeys,
          current: newCapture.snapshotTopLevelKeys,
          setupRemoved: { historical: oldCapture.setupPresent, current: newCapture.setupPresent },
        },
        snapshotBytes: byteDelta(oldCapture.snapshotText, newCapture.snapshotText),
        snapshotSha256: {
          historical: sha256(oldCapture.snapshotText),
          current: sha256(newCapture.snapshotText),
        },
        eventCounts: {
          historical: oldCapture.events.length,
          current: newCapture.events.length,
        },
        selectedUnitState: {
          historical: oldCapture.state.units?.map(({ id, cardId, side, alive, hitpoints, position, target }) =>
            ({ id, cardId, side, alive, hitpoints, position, target })),
          current: newCapture.state.units?.map(({ id, cardId, side, alive, hitpoints, position, target }) =>
            ({ id, cardId, side, alive, hitpoints, position, target })),
        },
        eventTypes: {
          historical: Object.fromEntries([...new Set(oldCapture.events.map(({ type }) => type))].sort().map((type) =>
            [type, oldCapture.events.filter(({ type: value }) => value === type).length])),
          current: Object.fromEntries([...new Set(newCapture.events.map(({ type }) => type))].sort().map((type) =>
            [type, newCapture.events.filter(({ type: value }) => value === type).length])),
        },
      };
    }
  }
  const sectionBytes = (version) => ({
    roster: version.witness.rosterBytes,
    questions: version.witness.questionBytes,
    serializedWitness: version.witness.byteLength,
  });
  return {
    witness: {
      byteDelta: byteDelta(historical.witness.bytes, current.witness.bytes),
      oldAndCurrentSectionBytes: { historical: sectionBytes(historical), current: sectionBytes(current) },
      rosterCardIds: { historical: historical.witness.rosterCardIds, current: current.witness.rosterCardIds },
      questionCount: { historical: historical.witness.questionCount, current: current.witness.questionCount },
      fieldDiffCount: witnessDiff.length,
      fieldDiff: witnessDiff,
    },
    oldGoldenReproduction: {
      tick120: {
        expectedBytes: 417386,
        expectedSha256: '0263778593d12c500721bb3914123269940e3e702ae5fc841f93613d2c2d0cb5',
        historicalBytes: historical.captures.ordinary[120].snapshotText,
        historicalSha256: sha256(historical.captures.ordinary[120].snapshotText),
        currentBytes: current.captures.ordinary[120].snapshotText,
        currentSha256: sha256(current.captures.ordinary[120].snapshotText),
      },
      tick200: {
        expectedSha256: '07525d6e712c40fe9c9bb473f173ae7604f224a04f67eef12c0a0d3fc319d02d',
        historicalSha256: sha256(historical.captures.ordinary[200].snapshotText),
        currentSha256: sha256(current.captures.ordinary[200].snapshotText),
      },
    },
    comparisons,
  };
}
const historical = await loadVersion('historical', historicalRoot);
const current = await loadVersion('current', currentRoot);
const comparison = compareVersions(historical, current);
const data = {
  method: {
    scenario: 'ordinary and movement-profiled Cinderlings battles, witness mossguard, deploy schedule copied from cinderlingsPair and scheduleCinderlingsRedeploy; one step at a time; capture after ticks 120, 200, 320',
    snapshotComparison: 'JSON.parse(serialize()), delete only the top-level setup property, then compare JSON.stringify output and all remaining fields',
    eventComparison: 'full battle.events array copied at each capture; no filtering',
    stateComparison: 'full battle.state copied at each capture; no filtering',
  },
  historical,
  current,
  comparison,
};
await writeFile(outputPath, `${JSON.stringify(data, null, 2)}\n`);
const summary = {
  historical: { sourceRoot: historical.sourceRoot, witnessBytes: historical.witness.byteLength,
    witnessSha256: historical.witness.sha256, questionCount: historical.witness.questionCount,
    finalTick: historical.finalTick },
  current: { sourceRoot: current.sourceRoot, witnessBytes: current.witness.byteLength,
    witnessSha256: current.witness.sha256, questionCount: current.witness.questionCount,
    finalTick: current.finalTick },
  witness: comparison.witness,
  oldGoldenReproduction: {
    tick120: {
      expectedBytes: comparison.oldGoldenReproduction.tick120.expectedBytes,
      historicalBytes: byteLength(comparison.oldGoldenReproduction.tick120.historicalBytes),
      expectedSha256: comparison.oldGoldenReproduction.tick120.expectedSha256,
      historicalSha256: comparison.oldGoldenReproduction.tick120.historicalSha256,
      currentBytes: byteLength(comparison.oldGoldenReproduction.tick120.currentBytes),
      currentSha256: comparison.oldGoldenReproduction.tick120.currentSha256,
    },
    tick200: comparison.oldGoldenReproduction.tick200,
  },
  comparisons: Object.fromEntries(Object.entries(comparison.comparisons).map(([kind, ticks]) => [kind,
    Object.fromEntries(Object.entries(ticks).map(([tick, result]) => [tick, {
      stateEqual: result.stateEqual,
      stateDiffCount: result.stateDiff.length,
      fullEventsEqual: result.fullEventsEqual,
      fullEventsDiffCount: result.fullEventsDiff.length,
      eventCount: result.eventCounts,
      replayEqual: result.replayEqual,
      snapshotEqualAfterRemovingOnlySetup: result.snapshotEqualAfterRemovingOnlySetup,
      snapshotWithoutSetupDiffCount: result.snapshotWithoutSetupDiff.length,
      snapshotBytes: result.snapshotBytes,
      snapshotSha256: result.snapshotSha256,
      setupPresent: result.snapshotTopLevelKeys.setupRemoved,
      eventTypes: result.eventTypes,
      selectedUnitState: result.selectedUnitState,
    }]))
  ])),
  outputJson: outputPath,
};
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
