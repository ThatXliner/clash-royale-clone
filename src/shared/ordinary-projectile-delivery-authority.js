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
]);
const POLICY_KEYS = Object.freeze([
  "archetypeId", "cardId", "catalogId", "delivery", "kind",
]);

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
