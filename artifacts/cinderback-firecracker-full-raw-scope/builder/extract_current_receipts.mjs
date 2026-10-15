import { EDITABLE_MIXED_DECK_CARD_IDS } from "../../../src/content/editable-deck.js";
import { createSessionCardManifest } from "../../../src/content/session-card-catalog.js";
import {
  createSessionTroopMovementProfileManifest,
  getSessionTroopMovementProfile,
} from "../../../src/content/session-troop-movement-profiles.js";
import { createSessionTroopMovementRuntimeProfiles } from "../../../src/content/session-troop-movement-runtime-profiles.js";
import {
  createSessionTroopProjectileProfileManifest,
} from "../../../src/content/session-troop-projectile-profiles.js";
import { createRecoilSpecialCatalog } from "../../../src/content/index.js";
import { createHash } from "node:crypto";

const cardManifest = createSessionCardManifest();
const movementManifest = createSessionTroopMovementProfileManifest();
const movementRuntime = createSessionTroopMovementRuntimeProfiles();
const projectileManifest = createSessionTroopProjectileProfileManifest();
const cinderback = "cinderback";
const currentMovement = getSessionTroopMovementProfile(cinderback);
const movementRuntimeReceipt = movementRuntime.profiles.find(({ id }) => id === cinderback) ?? null;
const cardAdmission = cardManifest.cards.find(({ id }) => id === cinderback) ?? null;
const cardOccurrences = cardManifest.occurrences.filter(({ id }) => id === cinderback);
const movementOccurrences = movementManifest.occurrences.filter(({ id }) => id === cinderback);
const projectileOccurrences = projectileManifest.occurrences.filter(({ id }) => id === cinderback);
const projectileProfile = projectileManifest.profiles.find(({ id }) => id === cinderback) ?? null;
const projectileUnresolved = projectileManifest.unresolvedDeliveryDependencies
  .filter(({ id, component }) => id === cinderback || component?.id === cinderback);

const value = {
  baseline: "226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf",
  extraction: "read-only pure catalog/profile receipt extraction; no test, gameplay, or simulation run",
  sessionCardCatalog: {
    counts: cardManifest.counts,
    admission: cardAdmission,
    occurrences: cardOccurrences,
  },
  // Preserve the real source function's returned shape for the test-only
  // parity join. This is a pure catalog read, not a test or simulation run.
  recoilSpecialCatalog: createRecoilSpecialCatalog(),
  movementProfile: {
    profileCount: movementManifest.profiles.length,
    occurrenceCount: movementManifest.occurrences.length,
    profile: currentMovement,
    runtimeReceipt: movementRuntimeReceipt,
    serializedRuntimeReceiptSha256: createHash("sha256")
      .update(movementRuntime.manifest, "utf8").digest("hex"),
  },
  projectileProfile: {
    profileCount: projectileManifest.profiles.length,
    occurrenceCount: projectileManifest.occurrences.length,
    profile: projectileProfile,
    occurrences: projectileOccurrences,
    unresolvedDeliveryDependencies: projectileUnresolved,
    sourceClassification: {
      exportName: "createRecoilSpecialCatalog",
      id: cinderback,
      reason: "the recoil occurrence exports movement displacement, not a projectile claim",
      status: "admitted",
      meaning: "This is the shared-session projectile consumer boundary. It does not negate the explicit test-only Firecracker comparator or prove that the historical source has no projectile.",
    },
  },
  mixedPlayableSelection: {
    choiceCount: EDITABLE_MIXED_DECK_CARD_IDS.length,
    includesCinderback: EDITABLE_MIXED_DECK_CARD_IDS.includes(cinderback),
    ids: EDITABLE_MIXED_DECK_CARD_IDS,
  },
};

process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
