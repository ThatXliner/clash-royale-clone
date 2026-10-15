import assert from "node:assert/strict";
import test from "node:test";
import {
  getMossguardVectorPose,
  MOSS_GUARD_DIRECTIONS,
  MOSS_GUARD_POSES,
  MOSS_GUARD_VECTOR_GEOMETRY,
  renderMossguardVectorPose,
} from "../demo/mossguard-vector-rig.js";

test("Mossguard vector poses stay deterministic, anchored, self-contained, and bounded", () => {
  const observed = new Set();
  for (const direction of MOSS_GUARD_DIRECTIONS) {
    for (const pose of MOSS_GUARD_POSES) {
      const team = direction === "north" || direction === "west" ? "ember" : "jade";
      const input = { direction, pose, team, tick: 73 };
      const first = getMossguardVectorPose(input);
      const second = getMossguardVectorPose(input);
      const instancePrefix = `mossguard-native-${direction}-${pose}`;
      const svg = renderMossguardVectorPose(input, instancePrefix);
      assert.deepEqual(first, second, `${direction}/${pose} has stable pose metadata`);
      assert.equal(svg, renderMossguardVectorPose(input, instancePrefix), `${direction}/${pose} has stable SVG output`);
      const gradientIds = [...svg.matchAll(/<linearGradient id="([^"]+)"/g)].map(([, id]) => id);
      assert.deepEqual(gradientIds, [
        `${instancePrefix}-wood`, `${instancePrefix}-wood-light`, `${instancePrefix}-leaf`,
      ]);
      const gradientRefs = [...svg.matchAll(/url\(#([^)]+)\)/g)].map(([, id]) => id);
      assert.ok(gradientRefs.every((id) => gradientIds.includes(id)), `${direction}/${pose} uses only local gradient IDs`);
      assert.match(svg, new RegExp(`data-direction="${direction}"`));
      assert.match(svg, new RegExp(`data-pose="${pose}"`));
      assert.match(svg, /data-sole-anchor="32 58"/);
      assert.match(svg, /data-safe-bounds="4 6 56 52"/);
      assert.doesNotMatch(svg, /<(?:image|use|foreignObject)\b|\bhref=/i);
      observed.add(`${direction}/${pose}`);
    }
    const pathSignature = (pose) => [...renderMossguardVectorPose({ direction, pose, team: "ember", tick: 0 }, `signature-${direction}-${pose}`)
      .matchAll(/<path d="([^"]+)"/g)].map(([, d]) => d).join("|");
    assert.equal(new Set(MOSS_GUARD_POSES.map(pathSignature)).size, MOSS_GUARD_POSES.length,
      `${direction} presents four authored path configurations`);
  }
  assert.equal(observed.size, 16);
  assert.deepEqual(MOSS_GUARD_VECTOR_GEOMETRY.soleAnchor, { x: 32, y: 58 });
  assert.deepEqual(MOSS_GUARD_VECTOR_GEOMETRY.safeBounds, { x: 4, y: 6, width: 56, height: 52 });
  assert.equal(MOSS_GUARD_VECTOR_GEOMETRY.bodyHeightUnits, 52);
  assert.equal(MOSS_GUARD_VECTOR_GEOMETRY.nativeBodyHeight, 13);
  assert.match(renderMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: 74 }, "test-south-walkA"), /data-tick="74"/);
  assert.throws(() => renderMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: 0 }), RangeError);
  assert.throws(() => renderMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: 0 }, "bad prefix"), RangeError);
  assert.throws(() => renderMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: 0 }, 42), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "diagonal", pose: "walkA", team: "jade", tick: 0 }), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "south", pose: "idle", team: "jade", tick: 0 }), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "south", pose: "walkA", team: "blue", tick: 0 }), RangeError);
  assert.throws(() => getMossguardVectorPose({ direction: "south", pose: "walkA", team: "jade", tick: -1 }), RangeError);
});
