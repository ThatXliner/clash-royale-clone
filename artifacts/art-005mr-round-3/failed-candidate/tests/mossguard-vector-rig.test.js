import assert from "node:assert/strict";
import test from "node:test";
import {
  getMossguardVectorPose,
  MOSS_GUARD_DIRECTIONS,
  MOSS_GUARD_POSES,
  MOSS_GUARD_VECTOR_GEOMETRY,
  renderMossguardVectorPose,
} from "../demo/mossguard-vector-rig.js";

function pathBounds(pathData) {
  const points = [...pathData.matchAll(/-?\d+(?:\.\d+)?/g)].map(([value]) => Number(value));
  const xs = points.filter((_, index) => index % 2 === 0);
  const ys = points.filter((_, index) => index % 2 === 1);
  return {
    x: Math.min(...xs), y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function poseMarkup(direction, pose) {
  return renderMossguardVectorPose({ direction, pose, team: "jade", tick: 19 }, `pose-${direction}-${pose}`);
}

function actionDetails(svg) {
  const match = svg.match(/<g data-mossguard-action="([^"]+)" transform="([^"]+)">([\s\S]*?)<\/g>/);
  assert.ok(match, "pose includes its explicit transformed action layer");
  return {
    pose: match[1],
    transform: match[2],
    paths: [...match[3].matchAll(/<path d="([^"]+)"/g)].map(([, path]) => path),
  };
}

function translatedAmount(transform) {
  const match = transform.match(/^translate\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/);
  assert.ok(match, `expected one explicit translation, got ${transform}`);
  return { x: Number(match[1]), y: Number(match[2]) };
}

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

test("Mossguard walk alternates a planted sole and action moves the fist across the torso", () => {
  for (const direction of MOSS_GUARD_DIRECTIONS) {
    const walkA = poseMarkup(direction, "walkA");
    const walkB = poseMarkup(direction, "walkB");
    const walkALegs = [...walkA.matchAll(/<path d="([^"]+)"/g)].slice(0, 2).map(([, path]) => pathBounds(path));
    const walkBLegs = [...walkB.matchAll(/<path d="([^"]+)"/g)].slice(0, 2).map(([, path]) => pathBounds(path));
    assert.equal(Math.max(walkALegs[0].y, walkALegs[0].y + walkALegs[0].height), 58,
      `${direction} walkA keeps its first sole on the shared baseline`);
    assert.ok(58 - (walkALegs[1].y + walkALegs[1].height) >= 11,
      `${direction} walkA lifts the alternate sole by at least 2.75 CSS px`);
    assert.equal(walkBLegs[1].y + walkBLegs[1].height, 58,
      `${direction} walkB plants the opposite sole on the shared baseline`);
    assert.ok(58 - (walkBLegs[0].y + walkBLegs[0].height) >= 11,
      `${direction} walkB lifts the alternate sole by at least 2.75 CSS px`);

    const windup = actionDetails(poseMarkup(direction, "meleeWindup"));
    const contact = actionDetails(poseMarkup(direction, "contact"));
    const windupOffset = translatedAmount(windup.transform);
    const contactOffset = translatedAmount(contact.transform);
    const windupFist = pathBounds(windup.paths[6]);
    const contactFist = pathBounds(contact.paths[6]);
    const mirrorX = (value) => direction === "west" ? 64 - value : value;
    const windupX = mirrorX(windupFist.x + windupFist.width / 2 + windupOffset.x);
    const contactX = mirrorX(contactFist.x + contactFist.width / 2 + contactOffset.x);
    const windupY = windupFist.y + windupFist.height / 2 + windupOffset.y;
    const contactY = contactFist.y + contactFist.height / 2 + contactOffset.y;
    const forwardReach = direction === "north" ? windupY - contactY
      : direction === "south" ? contactY - windupY
        : direction === "east" ? contactX - windupX
          : windupX - contactX;
    assert.ok(forwardReach >= 16,
      `${direction} wooden fist advances at least 4 CSS px from windup to contact (measured ${forwardReach} viewBox units)`);
    assert.equal(windup.pose, "meleeWindup");
    assert.equal(contact.pose, "contact");
  }
});
