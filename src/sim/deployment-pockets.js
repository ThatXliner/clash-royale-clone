// Destroyed-tower pockets: which forward pockets are open for a side, read
// from authoritative tower state, and the points an opponent policy may try
// there. The pocket rule itself lives in evaluateDeployment (deployment.js).

const SIDES = new Set(["south", "north"]);
const LANES = new Set(["west", "east"]);

/**
 * Lanes whose rival crown tower has fallen, from tower records
 * ({ side, role, lane, hitpoints }). Returns a fresh sorted array: the exact
 * `destroyedOpposingLaneTowers` value for deployments by `side`.
 */
export function destroyedOpposingLaneTowers(towers, side) {
  if (!SIDES.has(side)) throw new TypeError("destroyed lane side must be south or north");
  if (!Array.isArray(towers)) throw new TypeError("destroyed lane towers must be an array");
  const lanes = [];
  for (const tower of towers) {
    if (tower?.side !== side && tower?.role === "lane" && tower.hitpoints === 0 &&
        LANES.has(tower.lane) && !lanes.includes(tower.lane)) {
      lanes.push(tower.lane);
    }
  }
  return lanes.sort();
}

// One representative point per side and lane: a tile past the river, in the
// lane's bridge column, inside that side's forward pocket.
const POCKET_ANCHORS = Object.freeze({
  south: Object.freeze({
    east: Object.freeze({ x: 14_500, y: 18_000 }),
    west: Object.freeze({ x: 3_500, y: 18_000 }),
  }),
  north: Object.freeze({
    east: Object.freeze({ x: 14_500, y: 14_000 }),
    west: Object.freeze({ x: 3_500, y: 14_000 }),
  }),
});

export function pocketDeploymentAnchor(side, lane) {
  if (!SIDES.has(side) || !LANES.has(lane)) {
    throw new TypeError("pocket anchor requires a side and a lane");
  }
  return { ...POCKET_ANCHORS[side][lane] };
}

/**
 * Pocket offers for an opponent policy: for each ground card among
 * `candidates` (first-appearance order), the anchor of every open lane that
 * is not already a candidate. Empty when no lane is open, so the policy keeps
 * its exact original options until a tower falls.
 */
export function pocketDeploymentCandidates(candidates, lanes, side, isGroundCard) {
  if (lanes.length === 0) return [];
  const key = ({ cardId, point }) => `${cardId}@${point.x},${point.y}`;
  const existing = new Set(candidates.map(key));
  const offers = [];
  const seen = new Set();
  for (const { cardId } of candidates) {
    if (seen.has(cardId)) continue;
    seen.add(cardId);
    if (!isGroundCard(cardId)) continue;
    for (const lane of lanes) {
      const offer = { cardId, point: pocketDeploymentAnchor(side, lane) };
      if (!existing.has(key(offer))) offers.push(offer);
    }
  }
  return offers;
}
