import {
  admitSessionTroopProjectileRuntimeProfiles as requestProjectilePlan,
  registerSessionTroopProjectileRuntimeAuthority,
} from "../sim/session-troop-projectile-runtime.js";

const PROFILE_IDS = [
  "aegis-sage", "prism-warden", "rune-reaver", "scatterguard", "stormkite",
];

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function clone(value) {
  return structuredClone(value);
}

function freeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}

function exact(value, keys, label) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object`);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  return value;
}

function createAdmitter({ serializeManifest }) {
  const receipt = serializeManifest();
  return function admittedPlan(serialized) {
  if (typeof serialized !== "string") {
    throw new TypeError("session troop projectile profile receipt must be canonical JSON text");
  }
  if (serialized !== receipt) {
    throw new TypeError("session troop projectile profile receipt is not the closed HTJP snapshot");
  }
  let manifest;
  try { manifest = JSON.parse(serialized); }
  catch { throw new TypeError("session troop projectile profile receipt must be valid JSON"); }
  if (canonical(manifest) !== serialized || manifest.version !== 1) {
    throw new TypeError("session troop projectile profile receipt is noncanonical");
  }
  const profiles = manifest.profiles.map((profile, index) => {
    const checked = exact(profile,
      ["claims", "composition", "id", "identityRequirements", "occurrenceExports",
        "sharedHostIntegration", "sourceCard", "sourceIdentity"],
      `projectile profile[${index}]`);
    if (!Array.isArray(checked.claims) || checked.claims.length !== 1) {
      throw new TypeError(`projectile profile[${index}].claims is not singular`);
    }
    const claim = exact(checked.claims[0],
      ["archetype", "claimFamily", "component", "delivery", "questions", "source"],
      `projectile profile[${index}].claim`);
    if (claim.archetype !== checked.id || claim.component !== null ||
        claim.delivery.classification !== "sourced" || claim.delivery.delivery !== "projectile" ||
        checked.sharedHostIntegration.status !== "pending-shared-host-integration" ||
        canonical(checked.sourceCard) !== canonical(claim.source.record) ||
        checked.sourceIdentity.id !== checked.id) {
      throw new TypeError(`projectile profile[${index}] is not an admitted host receipt`);
    }
    return {
      claimFamily: claim.claimFamily,
      id: checked.id,
      questions: clone(claim.questions),
      sourceCard: clone(checked.sourceCard),
    };
  }).sort((left, right) => left.id.localeCompare(right.id));
  if (canonical(profiles.map(({ id }) => id)) !== canonical(PROFILE_IDS)) {
    throw new TypeError("projectile profile receipt IDs are not the closed set");
  }
  const questions = manifest.unresolvedDeliveryDependencies.flatMap((dependency) => {
    const dependencyQuestions = Object.fromEntries(Object.entries(dependency.questions).map(
      ([key, record]) => {
        const { key: _questionKey, ...withoutKey } = record;
        return [key, withoutKey];
      }));
    const base = {
      claimFamily: dependency.claimFamily,
      questions: dependencyQuestions,
    };
    return [
      { cardId: dependency.id, ...base },
      ...(dependency.component === null || dependency.component === undefined ? [] : [
        { cardId: dependency.component.id, ...base },
      ]),
    ];
  }).sort((left, right) => left.cardId.localeCompare(right.cardId));
  return freeze({ configuration: serialized, profiles, questions });
  };
}

let admitProfiles = null;

export function registerSessionTroopProjectileRuntimeProfileAdmission(manifestApi) {
  if (manifestApi === null || typeof manifestApi !== "object" ||
      typeof manifestApi.serializeManifest !== "function") {
    throw new TypeError("projectile profile admission API is invalid");
  }
  if (admitProfiles !== null) {
    throw new TypeError("projectile profile admission is already registered");
  }
  const admittedPlan = createAdmitter(manifestApi);
  registerSessionTroopProjectileRuntimeAuthority(admittedPlan);
  admitProfiles = (serialized) => requestProjectilePlan(serialized);
}

export function admitSessionTroopProjectileRuntimeProfiles(serialized) {
  if (admitProfiles === null) {
    throw new TypeError("projectile profile admission is not registered");
  }
  return admitProfiles(serialized);
}

export function admitSessionTroopProjectileRuntimeFromSetup(serializedSetup) {
  if (typeof serializedSetup !== "string") return undefined;
  let setup;
  try { setup = JSON.parse(serializedSetup); }
  catch { return undefined; }
  return Object.hasOwn(setup, "projectileRuntimeProfiles")
    ? admitSessionTroopProjectileRuntimeProfiles(setup.projectileRuntimeProfiles)
    : undefined;
}

export function admitSessionTroopProjectileRuntimeFromGameSnapshot(serializedSnapshot) {
  if (typeof serializedSnapshot !== "string") return undefined;
  let snapshot;
  try { snapshot = JSON.parse(serializedSnapshot); }
  catch { return undefined; }
  if (!Object.hasOwn(snapshot, "setup")) return undefined;
  return admitSessionTroopProjectileRuntimeFromSetup(canonical(snapshot.setup));
}

export function admitSessionTroopProjectileRuntimeFromBattleSnapshot(serializedSnapshot) {
  if (typeof serializedSnapshot !== "string") return undefined;
  let snapshot;
  try { snapshot = JSON.parse(serializedSnapshot); }
  catch { return undefined; }
  return Object.hasOwn(snapshot, "projectileRuntime")
    ? (() => {
      let runtime;
      try { runtime = JSON.parse(snapshot.projectileRuntime); }
      catch { throw new TypeError("live battle projectile runtime witness is invalid"); }
      return admitSessionTroopProjectileRuntimeProfiles(runtime.configuration);
    })()
    : undefined;
}
