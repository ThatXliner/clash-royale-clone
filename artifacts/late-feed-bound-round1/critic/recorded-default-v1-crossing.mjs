import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { restoreCombatEffectFeed, COMBAT_EFFECT_FEED_MAX_BYTES } from '../../../src/sim/combat-effect-feed.js';
const dir = new URL('./', import.meta.url);
const wire = fs.readFileSync(new URL('./recorded-default-transition-v2-wire.json', import.meta.url), 'utf8');
const snapshot = restoreCombatEffectFeed(wire);
const baseline = await import(pathToFileURL(new URL('./baseline-7550-combat-effect-feed.js', import.meta.url).pathname).href);
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
const sizeOf = (value) => new TextEncoder().encode(value).byteLength;
const event3899 = snapshot.records.find(({ eventId }) => eventId === 3_899);
assert.ok(event3899, 'recorded actual replay must retain event 3,899');
assert.equal(event3899.phase, 'close');
assert.equal(event3899.tick, 17_789);
const prefixes = [];
for (let endId = 3_886; endId <= 3_900; endId++) {
  const prefixSnapshot = { records: snapshot.records.slice(0, endId), version: 1 };
  const v1 = canonical(prefixSnapshot);
  const v1Bytes = sizeOf(v1);
  let acceptedBaselineBytes = null;
  let baselineRejected = false;
  try {
    const baselineWire = baseline.serializeCombatEffectFeed(prefixSnapshot);
    acceptedBaselineBytes = sizeOf(baselineWire);
    assert.equal(baselineWire, v1, `accepted 7550 v1 serializer must match canonical v1 prefix through ${endId}`);
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    baselineRejected = true;
  }
  prefixes.push({
    endEventId: endId,
    lastRecord: snapshot.records[endId - 1],
    v1Bytes: v1Bytes,
    overUnchangedLimit: v1Bytes > COMBAT_EFFECT_FEED_MAX_BYTES,
    baselineAcceptedBytes: acceptedBaselineBytes,
    baselineRejectedForBound: baselineRejected,
  });
}
const crossing = prefixes.find(({ overUnchangedLimit }) => overUnchangedLimit);
assert.ok(crossing, 'the actual v1 graph must cross the existing byte bound in this tick');
assert.equal(crossing.endEventId, 3_899, 'event 3,899 must be the actual first record to exceed the v1 bound');
const prior = prefixes.find(({ endEventId }) => endEventId === 3_898);
const current = prefixes.find(({ endEventId }) => endEventId === 3_899);
assert.equal(prior.v1Bytes, 1_048_484);
assert.equal(current.v1Bytes, 1_048_649);
assert.equal(current.v1Bytes - COMBAT_EFFECT_FEED_MAX_BYTES, 73);
const evidence = {
  actualEvent3899: event3899,
  actualV1Crossing: {
    recordBefore: { endEventId: prior.endEventId, bytes: prior.v1Bytes, acceptedBaseSerializerAgrees: prior.baselineAcceptedBytes === prior.v1Bytes },
    overflowRecord: { endEventId: current.endEventId, bytes: current.v1Bytes, overBy: current.v1Bytes - COMBAT_EFFECT_FEED_MAX_BYTES, record: current.lastRecord },
    firstCrossingEventId: crossing.endEventId,
    unchangedByteLimit: COMBAT_EFFECT_FEED_MAX_BYTES,
  },
  allActualV1PrefixesThroughSameTick: prefixes,
  candidateWireAtSessionCursor17790: { version: JSON.parse(wire).version, bytes: sizeOf(wire), records: snapshot.records.length },
};
fs.writeFileSync(new URL('./recorded-default-v1-crossing-evidence.json', dir), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
