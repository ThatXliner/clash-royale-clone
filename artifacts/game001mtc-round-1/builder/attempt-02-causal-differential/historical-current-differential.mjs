import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const roots = {
  historical: "/private/tmp/game001mtc-historical-6a2f26dc8",
  current: "/private/tmp/game001mtc-builder-69da",
};

const canonical = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function collectChanges(before, after, prefix, changes) {
  if (canonical(before) === canonical(after)) return;
  if (Array.isArray(before) && Array.isArray(after)) {
    const limit = Math.max(before.length, after.length);
    for (let index = 0; index < limit; index += 1) {
      const path = `${prefix}[${index}]`;
      if (index >= before.length) changes.push({ path, before: "<absent>", after: after[index] });
      else if (index >= after.length) changes.push({ path, before: before[index], after: "<absent>" });
      else collectChanges(before[index], after[index], path, changes);
    }
    return;
  }
  if (before !== null && after !== null && typeof before === "object" &&
      typeof after === "object" && !Array.isArray(before) && !Array.isArray(after)) {
    for (const key of [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (!Object.hasOwn(before, key)) changes.push({ path, before: "<absent>", after: after[key] });
      else if (!Object.hasOwn(after, key)) changes.push({ path, before: before[key], after: "<absent>" });
      else collectChanges(before[key], after[key], path, changes);
    }
    return;
  }
  changes.push({ path: prefix, before, after });
}

async function load(root) {
  const at = (path) => import(pathToFileURL(`${root}/${path}`).href);
  const [roster, live] = await Promise.all([
    at("src/content/session-troop-roster.js"),
    at("src/sim/live-battle.js"),
  ]);
  return { ...roster, ...live };
}

function witnessDiff(before, after) {
  const oldQuestions = new Map(before.questions.map((record) => [record.key, record]));
  const newQuestions = new Map(after.questions.map((record) => [record.key, record]));
  const addedQuestions = [...newQuestions.keys()].filter((key) => !oldQuestions.has(key));
  const removedQuestions = [...oldQuestions.keys()].filter((key) => !newQuestions.has(key));
  const changedQuestions = [...oldQuestions.keys()].filter((key) => newQuestions.has(key) &&
    canonical(oldQuestions.get(key)) !== canonical(newQuestions.get(key)));
  const oldCards = new Map(before.roster.map((card) => [card.id, card]));
  const newCards = new Map(after.roster.map((card) => [card.id, card]));
  const changedCards = [];
  const addedCards = [...newCards.keys()].filter((id) => !oldCards.has(id));
  const removedCards = [...oldCards.keys()].filter((id) => !newCards.has(id));
  for (const id of [...newCards.keys()]) {
    if (!oldCards.has(id)) continue;
    const oldCard = oldCards.get(id);
    const newCard = newCards.get(id);
    const allChanges = [];
    collectChanges(oldCard, newCard, `roster.${id}`, allChanges);
    if (allChanges.length > 0) changedCards.push({ cardId: id, fields: allChanges });
    const oldByArchetype = new Map(oldCard.entities.map((entity) => [entity.archetypeId, entity]));
    for (const entity of newCard.entities) {
      const previous = oldByArchetype.get(entity.archetypeId);
      if (previous === undefined) continue;
      const oldFields = previous.sourceConfidencePolicy?.fields ?? [];
      const newFields = entity.sourceConfidencePolicy?.fields ?? [];
      if (canonical(oldFields) !== canonical(newFields) ||
          canonical(previous.sourceConfidencePolicy?.deploymentInterval ?? null) !==
          canonical(entity.sourceConfidencePolicy?.deploymentInterval ?? null)) {
        changedCards.push({
          cardId: id,
          archetypeId: entity.archetypeId,
          oldConfidenceFieldCount: oldFields.length,
          newConfidenceFieldCount: newFields.length,
          oldDeploymentInterval: previous.sourceConfidencePolicy?.deploymentInterval ?? null,
          newDeploymentInterval: entity.sourceConfidencePolicy?.deploymentInterval ?? null,
        });
      }
    }
  }
  return { addedQuestions, removedQuestions, changedQuestions, addedCards, removedCards, changedCards };
}

function runTimeline(api) {
  const witnessBytes = api.serializeSessionTroopWitness("mossguard");
  const battle = new api.LiveBattle(api.parseLiveBattleSetup(witnessBytes));
  battle.scheduleDeploy(canonical({
    cardId: "cinderlings", point: { x: 12_500, y: 17_500 }, sequence: 5, side: "north", tick: 0,
  }));
  const at = {};
  for (let step = 0; step < 320; step += 1) {
    if (battle.state.tick === 96) {
      battle.scheduleDeploy(canonical({
        cardId: "cinderlings", point: { x: 15_500, y: 14_500 }, sequence: 6, side: "south", tick: 96,
      }));
    }
    battle.step();
    if ([120, 200, 320].includes(battle.state.tick)) {
      const bytes = battle.serialize();
      const snapshot = JSON.parse(bytes);
      const state = battle.state;
      const withoutSetup = structuredClone(snapshot);
      delete withoutSetup.setup;
      at[battle.state.tick] = {
        byteLength: Buffer.byteLength(bytes),
        sha256: sha256(bytes),
        nonSetupSnapshotSha256: sha256(canonical(withoutSetup)),
        stateSha256: sha256(canonical(state)),
        eventCount: battle.events.length,
        eventSha256: sha256(canonical(battle.events)),
        stateTick: state.tick,
      };
    }
  }
  return { witnessBytes, at };
}

const apis = Object.fromEntries(await Promise.all(Object.entries(roots).map(async ([name, root]) =>
  [name, await load(root)])));
const witnesses = Object.fromEntries(Object.entries(apis).map(([name, api]) =>
  [name, api.createSessionTroopWitness("mossguard")]));
const witnessBytes = Object.fromEntries(Object.entries(apis).map(([name, api]) =>
  [name, api.serializeSessionTroopWitness("mossguard")]));
const timelines = Object.fromEntries(Object.entries(apis).map(([name, api]) =>
  [name, runTimeline(api)]));

const report = {
  node: process.version,
  roots,
  witness: {
    historical: {
      bytes: Buffer.byteLength(witnessBytes.historical),
      sha256: sha256(witnessBytes.historical),
      rosterBytes: Buffer.byteLength(canonical(witnesses.historical.roster)),
      questionBytes: Buffer.byteLength(canonical(witnesses.historical.questions)),
      questionCount: witnesses.historical.questions.length,
      rosterIds: witnesses.historical.roster.map(({ id }) => id),
    },
    current: {
      bytes: Buffer.byteLength(witnessBytes.current),
      sha256: sha256(witnessBytes.current),
      rosterBytes: Buffer.byteLength(canonical(witnesses.current.roster)),
      questionBytes: Buffer.byteLength(canonical(witnesses.current.questions)),
      questionCount: witnesses.current.questions.length,
      rosterIds: witnesses.current.roster.map(({ id }) => id),
    },
    byteDelta: Buffer.byteLength(witnessBytes.current) - Buffer.byteLength(witnessBytes.historical),
    diff: witnessDiff(witnesses.historical, witnesses.current),
  },
  timeline: {
    historical: timelines.historical.at,
    current: timelines.current.at,
    equalNonSetupSnapshotAt120: timelines.historical.at[120].nonSetupSnapshotSha256 ===
      timelines.current.at[120].nonSetupSnapshotSha256,
    equalNonSetupSnapshotAt200: timelines.historical.at[200].nonSetupSnapshotSha256 ===
      timelines.current.at[200].nonSetupSnapshotSha256,
    equalNonSetupSnapshotAt320: timelines.historical.at[320].nonSetupSnapshotSha256 ===
      timelines.current.at[320].nonSetupSnapshotSha256,
    equalStateAt120: timelines.historical.at[120].stateSha256 === timelines.current.at[120].stateSha256,
    equalStateAt200: timelines.historical.at[200].stateSha256 === timelines.current.at[200].stateSha256,
    equalStateAt320: timelines.historical.at[320].stateSha256 === timelines.current.at[320].stateSha256,
    equalEventsAt120: timelines.historical.at[120].eventSha256 === timelines.current.at[120].eventSha256,
    equalEventsAt200: timelines.historical.at[200].eventSha256 === timelines.current.at[200].eventSha256,
    equalEventsAt320: timelines.historical.at[320].eventSha256 === timelines.current.at[320].eventSha256,
  },
};

console.log(JSON.stringify(report, null, 2));
