import { writeFileSync } from "node:fs";
import { acquireTarget } from "../../src/sim/targeting.js";
import { evaluateDeployment } from "../../src/sim/deployment.js";
import { layoutFormation } from "../../src/sim/formations.js";
import { isGroundNavigationNode } from "../../src/sim/pathfinding.js";

const mossguard = { id: 146, kind: "troop", alive: true, targetable: true,
  layer: "ground", position: { x: 14101, y: 14500 }, radius: 500 };
const reedsting = { id: 159, kind: "troop", alive: true, targetable: true,
  layer: "ground", position: { x: 14500, y: 16700 }, radius: 300 };
const candidates = [mossguard, reedsting];
const nodes = [];
for (let x = 500; x <= 17500; x += 1000) {
  for (let y = 500; y <= 31500; y += 1000) {
    const point = { x, y };
    if (isGroundNavigationNode(point)) nodes.push(point);
  }
}
function nearestNode(point) {
  let best = null;
  let bestDistance = Infinity;
  for (const candidate of nodes) {
    const distance = (candidate.x - point.x) ** 2 + (candidate.y - point.y) ** 2;
    if (distance < bestDistance || (distance === bestDistance &&
        (candidate.y < best.y || (candidate.y === best.y && candidate.x < best.x)))) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}
function acquireFrom(origin) {
  const result = acquireTarget({ position: origin, radius: 300 }, candidates,
    { mode: "air_and_ground", sightRange: 7500 });
  return result?.id ?? null;
}
let legalGridPoints = 0;
const gridAcquisitions = { unit146: 0, unit159: 0, none: 0 };
let closestThreatMargin = Infinity;
let actualPlacement = null;
for (let x = 500; x <= 17500; x += 250) {
  for (let y = 500; y < 15000; y += 250) {
    const point = { x, y };
    const decision = evaluateDeployment({ side: "south", placementClass: "ground_entity",
      point, destroyedOpposingLaneTowers: [] });
    if (!decision.legal) continue;
    legalGridPoints += 1;
    const [member] = layoutFormation(point, [{ id: 1, radius: 300, role: "primary" }]);
    const spawn = nearestNode(member.position);
    const target = acquireFrom(spawn);
    if (target === 146) gridAcquisitions.unit146 += 1;
    else if (target === 159) gridAcquisitions.unit159 += 1;
    else gridAcquisitions.none += 1;
    const d146 = Math.hypot(spawn.x - mossguard.position.x, spawn.y - mossguard.position.y);
    const d159 = Math.hypot(spawn.x - reedsting.position.x, spawn.y - reedsting.position.y);
    closestThreatMargin = Math.min(closestThreatMargin, d159 - d146);
    if (x === 14500 && y === 14750) actualPlacement = { point, spawn, target, d146, d159 };
  }
}
let southGroundNodes = 0;
const allSouthNodeAcquisitions = { unit146: 0, unit159: 0, none: 0 };
for (const node of nodes.filter(({ y }) => y < 15000)) {
  southGroundNodes += 1;
  const target = acquireFrom(node);
  if (target === 146) allSouthNodeAcquisitions.unit146 += 1;
  else if (target === 159) allSouthNodeAcquisitions.unit159 += 1;
  else allSouthNodeAcquisitions.none += 1;
}
// Difference in squared center distance is linear in x and y. Its minimum
// over the legal own-half rectangle is at maximum x and y.
const maxLegalPoint = { x: 17500, y: 14999 };
const squaredDistanceDifferenceAtMaximum =
  (maxLegalPoint.x - reedsting.position.x) ** 2 + (maxLegalPoint.y - reedsting.position.y) ** 2 -
  (maxLegalPoint.x - mossguard.position.x) ** 2 - (maxLegalPoint.y - mossguard.position.y) ** 2;
const result = {
  basis: "Frozen tick-13200 units146/159 from the saved actual trace; exported deployment, formation, navigation and target-acquisition APIs; ground snapping ties match the battle continuation kernel.",
  threatSnapshot: { tick: 13200, mossguard, reedsting },
  reedstingCounter: {
    cardLayer: "ground", targetMode: "air_and_ground", sightRange: 7500, bodyRadiusQuestionValue: 300,
    legal250GridCommandPoints: legalGridPoints,
    targetAcquisitionCounts: gridAcquisitions,
    minimumCenterDistanceMarginReedstingMinusMossguard: closestThreatMargin,
    actual13200CommandMaterialization: actualPlacement,
    allSouthHalfGroundNavigationNodes: southGroundNodes,
    allSouthHalfNodeAcquisitions: allSouthNodeAcquisitions,
  },
  continuousCommandPointBound: {
    legalIntegerOwnHalfBounds: { x: [500, 17500], y: [500, 14999] },
    minSquaredCenterDistanceDifferenceReedstingMinusMossguard: squaredDistanceDifferenceAtMaximum,
    conclusion: "Positive minimum means Mossguard146 is closer at every legal integer command point; with radius500 versus300 and equal ground eligibility, any point seeing159 also sees146. This applies to unsnapped singleton air placements and is consistent with the ground-node sweep for Reedsting.",
  },
};
writeFileSync(new URL("./counter-target-competition.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
