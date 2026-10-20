import {
  assertSessionTroopProjectileAuthorityReceipt,
} from "../shared/session-troop-projectile-authority.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function parseEnvelope(serialized) {
  if (typeof serialized !== "string") return undefined;
  try { return JSON.parse(serialized); }
  catch { return undefined; }
}

export function admitSessionTroopProjectileRuntimeProfiles(serialized) {
  assertSessionTroopProjectileAuthorityReceipt(serialized);
  return serialized;
}

export function admitSessionTroopProjectileRuntimeFromSetup(serializedSetup) {
  const setup = parseEnvelope(serializedSetup);
  if (setup === null || typeof setup !== "object" || Array.isArray(setup) ||
      !Object.hasOwn(setup, "projectileRuntimeProfiles")) return undefined;
  return admitSessionTroopProjectileRuntimeProfiles(setup.projectileRuntimeProfiles);
}

export function admitSessionTroopProjectileRuntimeFromGameSnapshot(serializedSnapshot) {
  const snapshot = parseEnvelope(serializedSnapshot);
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      !Object.hasOwn(snapshot, "setup")) return undefined;
  return admitSessionTroopProjectileRuntimeFromSetup(canonical(snapshot.setup));
}

export function admitSessionTroopProjectileRuntimeFromBattleSnapshot(serializedSnapshot) {
  const snapshot = parseEnvelope(serializedSnapshot);
  if (snapshot === null || typeof snapshot !== "object" || Array.isArray(snapshot) ||
      !Object.hasOwn(snapshot, "projectileRuntime")) return undefined;
  let runtime;
  try { runtime = JSON.parse(snapshot.projectileRuntime); }
  catch { throw new TypeError("live battle projectile runtime witness is invalid"); }
  if (runtime === null || typeof runtime !== "object" || Array.isArray(runtime)) {
    throw new TypeError("live battle projectile runtime witness is invalid");
  }
  return admitSessionTroopProjectileRuntimeProfiles(runtime.configuration);
}
