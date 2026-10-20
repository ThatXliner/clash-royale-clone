import {
  createSessionTroopMovementProfileManifest,
  serializeSessionTroopMovementProfileManifest,
} from "./session-troop-movement-profiles.js";

const VERSION = 4;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function buildReceipt() {
  const manifest = createSessionTroopMovementProfileManifest();
  const profiles = manifest.profiles.map(({ claims, id }) => ({
    claims: claims.map(({ claimFamily, exportName }) => ({ claimFamily, exportName })),
    id,
  }));
  return freeze({
    manifest: serializeSessionTroopMovementProfileManifest(),
    profiles,
    version: VERSION,
  });
}

const RECEIPT = buildReceipt();
const RECEIPT_BYTES = canonical(RECEIPT);

export function createSessionTroopMovementRuntimeProfiles(...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop movement runtime profiles take no arguments");
  }
  return clone(RECEIPT);
}

export function serializeSessionTroopMovementRuntimeProfiles(...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop movement runtime profile serialization takes no arguments");
  }
  return RECEIPT_BYTES;
}
