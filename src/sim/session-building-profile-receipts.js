/**
 * Canonical HBA profile receipts shared by content projection and the live
 * host. This data-only module remains inside the audited simulation graph:
 * content proves that it produces these receipts from source records, while
 * sim uses the same immutable bytes to reject caller-forged fresh metadata.
 *
 * The table itself is not exported. Consumers get only an assertion; no
 * caller-provided digest, brand, or opt-out can make a divergent profile pass.
 */
const RECEIPTS = Object.freeze({
  "aether-well": "{\"class\":\"resource\",\"deployTicks\":60,\"generationAmount\":1,\"generationCadenceTicks\":510,\"hitpoints\":1070,\"lifetimeTicks\":4200}",
  "bulwark-needle": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":212,\"deployTicks\":60,\"firstHitTicks\":0,\"hitSpeedTicks\":54,\"hitpoints\":824,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":5500,\"minRangeMillitiles\":0,\"rampStages\":[212],\"rampThresholds\":[0],\"targetMode\":\"ground\",\"variant\":\"plain\"}",
  "buried-coil": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":230,\"deployTicks\":60,\"firstHitTicks\":42,\"hitSpeedTicks\":72,\"hitpoints\":1152,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":5500,\"minRangeMillitiles\":0,\"rampStages\":[230],\"rampThresholds\":[0],\"targetMode\":\"air_and_ground\",\"variant\":\"hidden\"}",
  "burrow-rig": "{\"class\":\"travel\",\"deployTicks\":60,\"emergenceSpawnDelayTicks\":12,\"hitpoints\":1440,\"lifetimeTicks\":1800,\"travelSpeedMillitilesPerSecond\":1500}",
  "cinder-reliquary": "{\"class\":\"death-effect\",\"damage\":160,\"deployTicks\":60,\"firstHitTicks\":60,\"hitSpeedTicks\":120,\"hitpoints\":1200,\"radius\":2000,\"rangeMillitiles\":4500,\"targetMode\":\"ground\",\"towerModifier\":{\"denominator\":100,\"numerator\":35}}",
  "ember-basin": "{\"areaDamageRadiusMillitiles\":1000,\"class\":\"defensive\",\"damage\":222,\"deployTicks\":60,\"firstHitTicks\":66,\"hitSpeedTicks\":96,\"hitpoints\":1356,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":6000,\"minRangeMillitiles\":0,\"rampStages\":[222],\"rampThresholds\":[0],\"targetMode\":\"ground\",\"variant\":\"splash\"}",
  "horizon-caster": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":266,\"deployTicks\":210,\"firstHitTicks\":240,\"hitSpeedTicks\":300,\"hitpoints\":1369,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":11500,\"minRangeMillitiles\":3000,\"rampStages\":[266],\"rampThresholds\":[0],\"targetMode\":\"ground\",\"variant\":\"siege\"}",
  "prism-furnace": "{\"areaDamageRadiusMillitiles\":null,\"class\":\"defensive\",\"damage\":42,\"deployTicks\":60,\"firstHitTicks\":72,\"hitSpeedTicks\":24,\"hitpoints\":1749,\"lifetimeTicks\":1800,\"maxRangeMillitiles\":6000,\"minRangeMillitiles\":0,\"rampStages\":[42,84,168],\"rampThresholds\":[0,2,4],\"targetMode\":\"air_and_ground\",\"variant\":\"ramp\"}",
});

/**
 * Accepts only the exact canonical JSON receipt associated with `cardId`.
 * The receipt is always derived by a safe local serializer after the caller's
 * outer boundary has accepted canonical JSON text.  Taking text rather than a
 * caller object makes this assertion itself non-observing for hostile object
 * values: it never reflects, enumerates, or reads a profile supplied here.
 */
export function assertSessionBuildingProfileReceipt(cardId, receipt, label = "building runtime profile") {
  if (typeof cardId !== "string" || typeof receipt !== "string" ||
      !Object.hasOwn(RECEIPTS, cardId) || receipt !== RECEIPTS[cardId]) {
    throw new TypeError(`${label} diverges from its canonical session-card receipt`);
  }
}
