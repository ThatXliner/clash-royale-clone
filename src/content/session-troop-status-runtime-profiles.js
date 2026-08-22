import {
  createHealQuestionRecords,
} from "./cards/combat-status-heal.js";
import {
  createInvisibilityQuestionRecords,
} from "./cards/combat-status-invisibility.js";
import {
  createReflectionQuestionFixture,
} from "./cards/special-projectiles-reflection.js";
import {
  createSlowQuestionRecords,
} from "./cards/special-combat-slow.js";
import {
  createSnareQuestionRecords,
} from "./cards/special-combat-snare.js";
import {
  createStunQuestionRecords,
} from "./cards/combat-status-stun.js";
import { createSessionTroopStatusProfileManifest,
  serializeSessionTroopStatusProfileManifest,
} from "./session-troop-status-profiles.js";

const VERSION = 1;
const PROFILE_IDS = Object.freeze([
  "aegis-sage",
  "bloom-wisp",
  "dawnmender",
  "pulse-sentry",
  "railward",
  "rime-adept",
  "tether-rider",
  "veil-prowler",
]);
const QUESTION_FACTORIES = Object.freeze({
  createHealQuestionRecords,
  createInvisibilityQuestionRecords,
  createReflectionQuestionFixture,
  createSlowQuestionRecords,
  createSnareQuestionRecords,
  createStunQuestionRecords,
});

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

function questionRecords(factoryName) {
  if (factoryName === null) return null;
  const factory = QUESTION_FACTORIES[factoryName];
  if (factory === undefined) throw new Error(`unknown status QUESTION factory ${factoryName}`);
  return clone(factory());
}

function fingerprint(serialized) {
  const bytes = new TextEncoder().encode(serialized);
  let left = 2_166_136_261;
  let right = 2_166_136_261;
  for (let index = 0; index < bytes.length; index += 1) {
    const byte = bytes[index];
    left = Math.imul(left ^ byte, 16_777_619) >>> 0;
    right = Math.imul(right ^ (byte + ((index * 31) & 255)), 16_777_619) >>> 0;
  }
  return `${left.toString(16).padStart(8, "0")}${right.toString(16).padStart(8, "0")}`;
}

function buildReceipt() {
  const manifest = createSessionTroopStatusProfileManifest();
  const profiles = manifest.profiles.map((profile) => ({
    claimFamily: profile.claimFamily,
    composition: profile.composition,
    id: profile.id,
    questionReceipt: profile.questionReceipt,
    questions: questionRecords(profile.questionReceipt),
    resolution: profile.resolution,
    sourceExport: profile.sourceExport,
    sourceRecord: profile.sourceRecord,
    sourceWitness: profile.sourceWitness,
    unresolved: profile.unresolved,
  }));
  if (canonical(profiles.map(({ id }) => id)) !== canonical(PROFILE_IDS)) {
    throw new Error("status runtime profile identity order diverges from the passed manifest");
  }
  return freeze({
    manifest: serializeSessionTroopStatusProfileManifest(),
    profiles,
    version: VERSION,
  });
}

const RECEIPT = buildReceipt();
const RECEIPT_BYTES = canonical(RECEIPT);

export const SESSION_TROOP_STATUS_RUNTIME_RECEIPT_FINGERPRINT = fingerprint(RECEIPT_BYTES);

export function createSessionTroopStatusRuntimeProfiles(...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop status runtime profiles take no arguments");
  }
  return clone(RECEIPT);
}

export function serializeSessionTroopStatusRuntimeProfiles(...args) {
  if (args.length !== 0) {
    throw new TypeError("session troop status runtime profile serialization takes no arguments");
  }
  return RECEIPT_BYTES;
}
