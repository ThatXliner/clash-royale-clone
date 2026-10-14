import assert from 'node:assert/strict';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { serializeCombatEffectFeed, restoreCombatEffectFeed, COMBAT_EFFECT_FEED_MAX_BYTES } from '../../../src/sim/combat-effect-feed.js';
const dir = new URL('./', import.meta.url);
const wire = fs.readFileSync(new URL('./recorded-default-transition-v2-wire.json', import.meta.url), 'utf8');
const snapshot = restoreCombatEffectFeed(wire);
const baseline = await import(pathToFileURL(new URL('./baseline-7550-combat-effect-feed.js', import.meta.url).pathname).href);
const baseEvidence = JSON.parse(fs.readFileSync(new URL('./recorded-default-v1-crossing-evidence.json', import.meta.url), 'utf8'));
const result = [];
for (const endId of [3_898, 3_899, 3_900]) {
  const prefix = { records: snapshot.records.slice(0, endId), version: 1 };
  const candidateWire = serializeCombatEffectFeed(prefix);
  const parsed = JSON.parse(candidateWire);
  const restored = restoreCombatEffectFeed(candidateWire);
  assert.equal(restored.records.length, endId);
  assert.deepEqual(restored.records.at(-1), snapshot.records[endId - 1]);
  assert.equal(serializeCombatEffectFeed(restored), candidateWire);
  const evidence = baseEvidence.allActualV1PrefixesThroughSameTick.find(({ endEventId }) => endEventId === endId);
  result.push({
    endEventId: endId,
    event: snapshot.records[endId - 1],
    candidateWireVersion: parsed.version,
    candidateWireBytes: new TextEncoder().encode(candidateWire).byteLength,
    oldV1Bytes: evidence.v1Bytes,
    candidateWireExactlyMatchesAccepted7550: endId === 3_898
      ? candidateWire === baseline.serializeCombatEffectFeed(prefix)
      : null,
    accepted7550V1SerializerMatches: evidence.baselineAcceptedBytes === evidence.v1Bytes,
    withinUnchangedByteCap: new TextEncoder().encode(candidateWire).byteLength <= COMBAT_EFFECT_FEED_MAX_BYTES,
    restoredGraphExact: true,
  });
}
assert.equal(result[0].candidateWireVersion, 1);
assert.equal(result[0].candidateWireBytes, 1_048_484);
assert.equal(result[0].candidateWireBytes, baseEvidence.actualV1Crossing.recordBefore.bytes);
assert.equal(result[0].candidateWireExactlyMatchesAccepted7550, true);
assert.equal(result[1].candidateWireVersion, 2);
assert.equal(result[1].event.eventId, 3_899);
assert.equal(result[1].event.tick, 17_789);
assert.equal(result[1].event.phase, 'close');
assert.ok(result[1].candidateWireBytes <= COMBAT_EFFECT_FEED_MAX_BYTES);
const out = { candidateActualPrefixChecks: result };
fs.writeFileSync(new URL('./recorded-default-crossing-candidate-check-evidence.json', dir), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify(out, null, 2));
