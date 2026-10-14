const CATALOG_ID = "ordinary-projectile-squads-v1";
export const ORDINARY_PROJECTILE_SOURCE_CLAIMS = Object.freeze([
  Object.freeze({
    cardId: "sunthread-pair",
    archetypeId: "sunthread-warden",
    catalogId: CATALOG_ID,
    sourceExport: "createOrdinaryProjectileSquadCatalog",
  }),
  Object.freeze({
    cardId: "duskwing-trio",
    archetypeId: "duskwing",
    catalogId: CATALOG_ID,
    sourceExport: "createOrdinaryProjectileSquadCatalog",
  }),
  Object.freeze({
    cardId: "coppershade-flock",
    archetypeId: "coppershade",
    catalogId: CATALOG_ID,
    sourceExport: "createOrdinaryProjectileSquadCatalog",
  }),
  Object.freeze({
    cardId: "kilnkeeper",
    archetypeId: "kilnkeeper",
    catalogId: "ordinary-projectile-splash-v1",
    sourceExport: "createOrdinaryProjectileSplashCatalog",
  }),
]);
const SPLASH_SOURCE_PROFILE = Object.freeze({
  archetypeId: "kilnkeeper",
  cardId: "kilnkeeper",
  catalogId: "ordinary-projectile-splash-v1",
  enemiesOnly: true,
  radiusMillitiles: 1_500,
  sourceExport: "createOrdinaryProjectileSplashCatalog",
  targetLayers: Object.freeze(["air", "ground"]),
});
const POLICY_KEYS = Object.freeze([
  "archetypeId", "cardId", "catalogId", "delivery", "kind",
]);
const SPLASH_PROFILE_KEYS = Object.freeze([
  "archetypeId", "cardId", "catalogId", "enemiesOnly", "radiusMillitiles",
  "sourceExport", "targetLayers",
]);
const WIZARD_PROJECTILE_DAMAGE_RECEIPT = Object.freeze({
  damage: 281,
  index: 8,
  linkedProjectileId: "chr_wizardProjectile",
  rarity: "rare",
  sourceCommit: "54fdef52c5086393b085f57faeeab8ef86b28160",
  sourceFile: "docs/json/cards_stats_projectile.json",
  sourceFileSha256: "c883516f54f6c17ee77c15cf484b01da9ded22602214c3b0d42b1ab823bd3197",
  sourceUri: "https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_projectile.json",
  tournamentLevel: 11,
});
function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length ||
      actual.some((key, index) => key !== expected[index]) ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
}

function exactLayers(value, expected) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype ||
      value.length !== expected.length) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).length !== expected.length + 1 ||
      !Object.hasOwn(descriptors, "length") || descriptors.length.value !== expected.length ||
      descriptors.length.enumerable || Object.hasOwn(descriptors, Symbol.iterator)) return false;
  return expected.every((layer, index) => {
    const descriptor = descriptors[String(index)];
    return descriptor !== undefined && descriptor.enumerable &&
      Object.hasOwn(descriptor, "value") && descriptor.value === layer;
  });
}

function claimFor(cardId, archetypeId) {
  return ORDINARY_PROJECTILE_SOURCE_CLAIMS.find((claim) => claim.cardId === cardId &&
    claim.archetypeId === archetypeId);
}

export function getOrdinaryProjectileDeliveryPolicy(cardId, archetypeId) {
  if (typeof cardId !== "string" || typeof archetypeId !== "string") {
    throw new TypeError("ordinary projectile source identities must be strings");
  }
  const claim = claimFor(cardId, archetypeId);
  if (claim === undefined) return null;
  return {
    archetypeId: claim.archetypeId,
    cardId: claim.cardId,
    catalogId: claim.catalogId,
    delivery: "projectile",
    kind: "source-backed",
  };
}

export function getOrdinaryProjectileSplashProfile(cardId, archetypeId) {
  if (typeof cardId !== "string" || typeof archetypeId !== "string") {
    throw new TypeError("ordinary projectile splash identities must be strings");
  }
  if (cardId !== SPLASH_SOURCE_PROFILE.cardId ||
      archetypeId !== SPLASH_SOURCE_PROFILE.archetypeId) return null;
  return {
    ...SPLASH_SOURCE_PROFILE,
    targetLayers: [...SPLASH_SOURCE_PROFILE.targetLayers],
  };
}

export function getOrdinaryProjectileSplashSourceFacts(cardId, archetypeId) {
  const profile = getOrdinaryProjectileSplashProfile(cardId, archetypeId);
  if (profile === null) return null;
  return {
    aoeToAir: profile.targetLayers.includes("air"),
    aoeToGround: profile.targetLayers.includes("ground"),
    characterAreaDamageRadiusMillitiles: 0,
    homing: true,
    onlyEnemies: profile.enemiesOnly,
    projectileDamage: WIZARD_PROJECTILE_DAMAGE_RECEIPT.damage,
    projectileDamagePerLevelIndex: WIZARD_PROJECTILE_DAMAGE_RECEIPT.index,
    projectileDamageLinkedProjectileId: WIZARD_PROJECTILE_DAMAGE_RECEIPT.linkedProjectileId,
    projectileDamageRarity: WIZARD_PROJECTILE_DAMAGE_RECEIPT.rarity,
    projectileDamageSourceCommit: WIZARD_PROJECTILE_DAMAGE_RECEIPT.sourceCommit,
    projectileDamageSourceFile: WIZARD_PROJECTILE_DAMAGE_RECEIPT.sourceFile,
    projectileDamageSourceFileSha256: WIZARD_PROJECTILE_DAMAGE_RECEIPT.sourceFileSha256,
    projectileDamageSourceUri: WIZARD_PROJECTILE_DAMAGE_RECEIPT.sourceUri,
    projectileDamageTournamentLevel: WIZARD_PROJECTILE_DAMAGE_RECEIPT.tournamentLevel,
    radiusMillitiles: profile.radiusMillitiles,
    speedRaw: 600,
  };
}

export function assertOrdinaryProjectileSplashProfile(value, cardId, archetypeId) {
  const profile = exact(value, SPLASH_PROFILE_KEYS, "ordinary projectile splash profile");
  const expected = getOrdinaryProjectileSplashProfile(cardId, archetypeId);
  if (expected === null || profile.archetypeId !== expected.archetypeId ||
      profile.cardId !== expected.cardId || profile.catalogId !== expected.catalogId ||
      profile.enemiesOnly !== expected.enemiesOnly ||
      profile.radiusMillitiles !== expected.radiusMillitiles ||
      profile.sourceExport !== expected.sourceExport ||
      !exactLayers(profile.targetLayers, expected.targetLayers)) {
    throw new TypeError("ordinary projectile splash profile differs from its admitted source claim");
  }
  return expected;
}

function createAdmittedPolicy(cardId, archetypeId) {
  const policy = getOrdinaryProjectileDeliveryPolicy(cardId, archetypeId);
  if (policy === null) throw new RangeError("ordinary projectile source identity is not admitted");
  return policy;
}

export function assertOrdinaryProjectileDeliveryPolicy(
  value, cardId, archetypeId, delivery,
) {
  const policy = exact(value, POLICY_KEYS, "ordinary projectile delivery policy");
  const expected = createAdmittedPolicy(cardId, archetypeId);
  if (policy.kind !== expected.kind || policy.catalogId !== expected.catalogId ||
      policy.cardId !== expected.cardId || policy.archetypeId !== expected.archetypeId ||
      policy.delivery !== expected.delivery || delivery !== expected.delivery) {
    throw new TypeError("ordinary projectile delivery policy differs from its admitted source claim");
  }
  return expected;
}
