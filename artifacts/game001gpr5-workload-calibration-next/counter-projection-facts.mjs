import { writeFileSync } from "node:fs";
import { createPlayableRoster } from "../../src/content/playable-roster.js";
const roster = createPlayableRoster();
const cards = new Map(roster.map((card) => [card.id, card]));
const startTick = 13200;
const lethalDeadline = 13352;
const targetHitpoints = 1112;
const available = ["reedsting", "copperskiff", "cinderlings", "mossguard"];
const projections = available.map((cardId) => {
  const card = cards.get(cardId);
  const memberDamage = card.entities.reduce((sum, e) => sum + e.count * e.damage, 0);
  const firstHit = startTick + card.deployTimeTicks + card.firstHitTicks;
  let optimisticKillTick;
  let basis;
  if (cardId === "cinderlings") {
    const volleyDamage = memberDamage;
    const volleys = Math.ceil(targetHitpoints / volleyDamage);
    optimisticKillTick = firstHit + (volleys - 1) * card.hitSpeedTicks;
    basis = "three-member ideal synchronized volleys; no approach, spacing, retaliation, or deaths";
  } else {
    const hits = Math.ceil(targetHitpoints / card.damage);
    optimisticKillTick = firstHit + (hits - 1) * card.hitSpeedTicks;
    basis = "single-member attacks; no approach, projectile travel, retaliation, or deaths";
  }
  return { cardId, cost: card.cost, memberCount: card.count,
    damagePerMember: card.damage, hitSpeedTicks: card.hitSpeedTicks,
    deployTicks: card.deployTimeTicks, firstHitTicks: card.firstHitTicks,
    damagePerIdealCycle: memberDamage, target146Hitpoints: targetHitpoints,
    optimisticKillTick, ticksAfterTowerLethalDeadline: optimisticKillTick - lethalDeadline,
    basis };
});
const result = {
  sourceSetupSha256: "306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c",
  snapshot: { tick: startTick, southEastLaneHitpoints: 289, lethalDeadline,
    remainingTicks: lethalDeadline - startTick,
    intendedLethalAttacker: { id: 159, cardId: "reedsting", hitpoints: 260, damage: 131 },
    actualNearestEligibleThreatAtCounterPoint: { id: 146, cardId: "mossguard", hitpoints: targetHitpoints,
      damage: 202, position: { x: 14101, y: 14500 }, radius: 500 } },
  availableAffordableCardsFromSavedCounterChecks: available,
  estimatesAgainstActualAcquiredMossguard: projections,
  decision: "No legal placement can direct a current ground-and-air counter to Reedsting159 while Mossguard146 is alive and both are eligible. These optimistic estimates also show no affordable card can clear146 before the 13352 tower deadline; a 13200 latest-save policy cannot solve this state. Clear or divert the competing body earlier, before the lane reaches this crowded state.",
};
writeFileSync(new URL("./counter-projection-facts.json", import.meta.url), `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify(result, null, 2));
