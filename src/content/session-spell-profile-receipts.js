import { createInstantSpellCatalog } from "./cards/spells-instant.js";

const PROFILE_ID = "isolated-sourced-instant-v1";
const SOURCE_EXPORT = "createInstantSpellCatalog";
const SQUALL_ID = "squall-orb";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function sourcedInstantFact() {
  const card = createInstantSpellCatalog().find(({ id }) => id === SQUALL_ID);
  if (!card || card.kind !== "effect" || card.cost !== 4 || card.count !== 1 ||
      card.damage !== 689) {
    throw new Error("the isolated spell receipt no longer matches its authoritative catalog facts");
  }
  // The catalog's corresponding parity test establishes exactly these fields
  // as authoritative. Deliberately do not carry radius, target mode, or any
  // encounter-composition field over this content-to-simulation boundary.
  return {
    cardId: card.id,
    count: card.count,
    cost: card.cost,
    damage: card.damage,
    kind: card.kind,
    sourceExport: SOURCE_EXPORT,
  };
}

/**
 * The opt-in session receipt is intentionally narrower than a spell card
 * definition. It authorizes one direct, caller-selected damage fact solely
 * to prove the shared-session authority seam. It is not a roster claim and
 * explicitly names every omitted spell family/mechanic.
 */
export function createSessionSpellProfileReceipts(...args) {
  if (args.length !== 0) throw new TypeError("session spell profile receipts take no arguments");
  return freeze({
    exclusions: [
      { id: "squall-orb-radius-target-knockback-travel-return",
        reason: "all radius, target-policy, knockback, travel, return, and four-facade composition fields remain QUESTION" },
      { id: "squall-orb-crown-tower-damage-modifier",
        reason: "crown-tower damage ratio and rounding remain QUESTION, so crown-tower targets are disabled" },
      { id: "periodic", reason: "cadence, duration, damage, radius, and target composition remain QUESTION" },
      { id: "spawn", reason: "spawn identities lack sourced kind/cost/deploy admission and all spawn mechanics remain QUESTION" },
      { id: "status", reason: "status duration, multiplier, target, refresh, and expiry mechanics remain QUESTION" },
      { id: "traveling", reason: "travel timing, geometry, damage, target, and return mechanics remain QUESTION" },
    ],
    profiles: [{
      claims: ["cardId", "kind", "cost", "count", "damage"],
      fact: sourcedInstantFact(),
      mode: "isolated-direct-command-target-damage-not-card-composition",
      profileId: PROFILE_ID,
    }],
    version: 1,
  });
}

export function serializeSessionSpellProfileReceipts(...args) {
  if (args.length !== 0) throw new TypeError("session spell profile receipt serialization takes no arguments");
  return canonical(createSessionSpellProfileReceipts());
}
