import { appendCombatEffectEvent, appendCombatEffectRoot, combatEffectFeedSnapshot, createCombatEffectFeed } from '../../../src/sim/combat-effect-feed.js';

const utf8 = (value) => new TextEncoder().encode(value).byteLength;
const canonical = (value) => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const feed = createCombatEffectFeed();
let identity = 1;
while (JSON.parse(feed.serialize()).version !== 2) {
  const root = appendCombatEffectRoot(feed, {
    direction: 'projectile', effectId: null, from: { x: 1000, y: 1000 },
    impactTick: identity + 1, projectileId: identity, radius: 0, segments: [],
    sequence: identity, sourceId: 1, tick: identity,
    to: { x: 3000, y: 1000 }, type: 'projectile',
  });
  appendCombatEffectEvent(feed, {
    parentId: root.eventId, payload: { reason: 'launch-cancelled' },
    phase: 'close', rootId: root.rootId, tick: identity, type: 'projectile',
  });
  identity += 1;
}
const wire = feed.serialize();
const snapshot = combatEffectFeedSnapshot(feed);
const expanded = canonical(snapshot);
const records = snapshot.records.length;
const expandedBytes = utf8(expanded);
const compactBytes = utf8(wire);
console.log(JSON.stringify({
  byteSaving: expandedBytes - compactBytes,
  compactBytes,
  expandedBytes,
  firstCompactIdentity: identity - 1,
  recordCount: records,
  reductionPercent: Number(((expandedBytes - compactBytes) * 100 / expandedBytes).toFixed(2)),
  wireVersion: JSON.parse(wire).version,
}));
