import { spawnSync } from "node:child_process";

const selectors = process.argv.slice(2);
for (const selector of selectors) {
  if (
    ![
      "cards-basic-melee",
      "nondeterminism-guard",
      "shipping-isolation-guard",
      "shipping-isolation-release",
      "shipping-isolation-host",
      "integration-audit",
      "cards-basic-flying",
      "cards-basic-ranged",
      "cards-swarms",
      "playable-roster",
      "opponent-controller",
      "battle-movement",
      "battle-movement-kernel",
      "battle-movement-history",
      "battle-combat",
      "battle-combat-external",
      "battle-projectile-history",
      "battle-towers",
      "battle-towers-kernel",
      "game-battle",
      "game-history-cap",
      "game-opponent",
      "game-roster-admission",
      "game-roster-spell-occurrences",
      "game-roster-troop-profiles",
      "game-roster-troops-movement-profiles",
      "game-roster-troops-movement",
      "game-roster-troops-ordinary",
      "game-roster-troops-projectile",
      "game-roster-troops-projectile-profiles",
      "game-roster-troops-status-profiles",
      "game-roster-troops-status",
      "game-building-runtime",
      "game-building-policy",
      "game-roster-buildings",
      "game-troop-runtime",
      "game-session",
      "editable-deck",
      "game-spell-runtime",
      "game-shared-runtime-integration",
      "game-session-endurance",
      "game-ui-projection",
      "game-input-bridge",
      "game-browser-loop",
      "game-browser-endurance",
      "game-browser-roster-witness",
      "game-browser-deck-choice",
      "game-browser-deck-keyboard",
      "game-browser-building-choice",
      "browser-frame-restore",
      "game-browser-journey",
      "game-presentation-journey",
      "release-runtime",
      "game-browser-audio",
      "game-restart",
      "game-audio-runtime",
      "game-player-deploy",
      "game-player-remount",
      "tower-evidence",
      "towers-live-targets",
      "spawn-placement",
      "periodic-spawns",
      "death-spawns",
      "death-conversion",
      "cards-building-targeters",
      "cards-structure-seeker",
      "shields-forms",
      "special-movement-charge",
      "special-movement-dash",
      "special-movement-jump",
      "special-movement-recoil",
      "special-movement-knockback",
      "special-movement-retarget",
      "special-movement-charge-knockback",
      "special-movement-dash-knockback",
      "special-movement-leap-knockback",
      "special-projectiles-chain",
      "special-projectiles-pierce",
      "special-projectiles-return",
      "special-projectiles-pellets",
      "special-projectiles-reflection",
      "combat-status-ramp",
      "combat-status-heal",
      "combat-status-reset",
      "combat-status-snare",
      "combat-status-slow",
      "combat-status-rage",
      "combat-status-stun",
      "combat-status-invisibility",
      "spells-instant",
      "spells-copy-card",
      "spells-clone-unit",
      "spells-spawn",
      "spells-periodic",
      "spells-travel-line",
      "spells-return",
      "spells-three-wave",
      "spells-roll",
      "champions",
      "death-effects",
      "buildings-defensive",
      "buildings-spawner",
      "buildings-resource",
      "buildings-travel",
      "ui-arena-shell",
      "app-shell",
      "battle-hand-polish",
      "ui-hud-state",
      "ui-input",
      "ui-placement-feedback",
      "ui-combat-state",
      "ui-combat-effects",
      "ui-match-feedback",
      "audio-events",
      "audio-renderer",
      "audio-production-assets",
      "visual-asset-manifest",
      "visual-arena-art",
      "visual-combat-assets",
      "visual-motion-polish",
      "visual-interface-art",
      "release-build",
      "fixed-step-kernel",
      "rng",
      "entities",
      "damage",
      "spatial",
      "targeting",
      "movement",
      "attack-cycle",
      "melee",
      "projectile",
      "area-damage",
      "formations",
      "arena-geometry",
      "pathfinding",
      "flying",
      "deployment",
      "towers",
      "elixir",
      "deck",
      "match-timing",
      "content-schema",
      "combat-effect-protocol",
    ].includes(selector)
  ) {
    throw new TypeError(`unknown test selector: ${selector}`);
  }
}

function run(args) {
  const result = spawnSync(process.execPath, args, { stdio: "inherit" });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status ?? 1;
}

const foundationRunners = [
  ["fixed-step-kernel", "fixed-step-runner.js"],
  ["rng", "rng-runner.js"],
  ["entities", "entities-runner.js"],
  ["damage", "damage-runner.js"],
  ["spatial", "spatial-runner.js"],
  ["targeting", "targeting-runner.js"],
  ["movement", "movement-runner.js"],
  ["battle-movement", "battle-movement-runner.js"],
  ["battle-movement-kernel", "battle-movement-kernel-runner.js"],
  ["battle-movement-history", "battle-movement-history-runner.js"],
  ["battle-combat", "battle-combat-runner.js"],
  ["battle-combat-external", "battle-combat-external-runner.js"],
  ["battle-projectile-history", "battle-projectile-history-runner.js"],
  ["battle-towers", "battle-towers-runner.js"],
  ["battle-towers-kernel", "battle-towers-kernel-runner.js"],
  ["game-battle", "game-battle-runner.js"],
  ["game-history-cap", "game-history-cap-runner.js"],
  ["game-opponent", "game-opponent-runner.js"],
  ["game-roster-admission", "game-roster-admission-runner.js"],
  ["game-roster-spell-occurrences", "game-roster-spell-occurrences-runner.js"],
  ["game-roster-troop-profiles", "game-roster-troop-profiles-runner.js"],
  [
    "game-roster-troops-movement-profiles",
    "game-roster-troops-movement-profiles-runner.js",
  ],
  [
    "game-roster-troops-movement",
    "game-roster-troops-movement-runner.js",
  ],
  ["game-roster-troops-ordinary", "game-roster-troops-ordinary-runner.js"],
  ["game-roster-troops-projectile", "game-roster-troops-projectile-runner.js"],
  [
    "game-roster-troops-projectile-profiles",
    "game-roster-troops-projectile-profiles-runner.js",
  ],
  [
    "game-roster-troops-status-profiles",
    "game-roster-troops-status-profiles-runner.js",
  ],
  ["game-roster-troops-status", "game-roster-troops-status-runner.js"],
  ["game-building-runtime", "game-building-runtime-runner.js"],
  ["game-building-policy", "game-building-policy-runner.js"],
  ["game-roster-buildings", "game-roster-buildings-runner.js"],
  ["game-troop-runtime", "game-troop-runtime-runner.js"],
  ["game-session", "game-session-runner.js"],
  ["editable-deck", "editable-deck-runner.js"],
  ["game-spell-runtime", "game-spell-runtime-runner.js"],
  ["game-shared-runtime-integration", "game-shared-runtime-integration-runner.js"],
  ["game-session-endurance", "game-session-endurance-runner.js"],
  ["game-ui-projection", "game-ui-projection-runner.js"],
  ["game-input-bridge", "game-input-bridge-runner.js"],
  ["game-browser-loop", "game-browser-loop-runner.js"],
  ["game-browser-endurance", "game-browser-endurance-runner.js"],
  ["game-browser-roster-witness", "game-browser-roster-witness-runner.js"],
  ["game-browser-deck-choice", "game-browser-deck-choice-runner.js"],
  ["game-browser-deck-keyboard", "game-browser-deck-keyboard-runner.js"],
  ["game-browser-building-choice", "game-browser-building-choice-runner.js"],
  ["browser-frame-restore", "browser-frame-restore-runner.js"],
  ["game-browser-journey", "game-browser-journey-runner.js"],
  ["game-presentation-journey", "game-presentation-journey-runner.js"],
  ["release-runtime", "release-runtime-runner.js"],
  ["game-browser-audio", "game-browser-audio-runner.js"],
  ["game-restart", "game-restart-runner.js"],
  ["game-audio-runtime", "game-audio-runtime-runner.js"],
  ["game-player-deploy", "game-player-deploy-runner.js"],
  ["game-player-remount", "game-player-remount-runner.js"],
  ["attack-cycle", "attack-cycle-runner.js"],
  ["melee", "melee-runner.js"],
  ["projectile", "projectile-runner.js"],
  ["area-damage", "area-damage-runner.js"],
  ["formations", "formations-runner.js"],
  ["arena-geometry", "arena-geometry-runner.js"],
  ["pathfinding", "pathfinding-runner.js"],
  ["flying", "flying-runner.js"],
  ["deployment", "deployment-runner.js"],
  ["towers", "towers-runner.js"],
  ["towers-live-targets", "towers-live-targets-runner.js"],
  ["tower-evidence", "tower-evidence-runner.js"],
  ["elixir", "elixir-runner.js"],
  ["deck", "deck-runner.js"],
  ["match-timing", "match-timing-runner.js"],
];
for (const [selector, runner] of foundationRunners) {
  if (selectors.length === 0 || selectors.includes(selector)) {
    run([new URL(`./${runner}`, import.meta.url).pathname, selector]);
  }
}
if (selectors.length === 0 || selectors.includes("playable-roster")) {
  run([
    new URL("./playable-roster-runner.js", import.meta.url).pathname,
    "playable-roster",
  ]);
}
if (selectors.length === 0 || selectors.includes("opponent-controller")) {
  run([
    new URL("./opponent-controller-runner.js", import.meta.url).pathname,
    "opponent-controller",
  ]);
}
if (selectors.length === 0 || selectors.includes("nondeterminism-guard")) {
  run([
    new URL("./nondeterminism-guard-runner.js", import.meta.url).pathname,
    "nondeterminism-guard",
  ]);
}
if (selectors.length === 0 || selectors.includes("shipping-isolation-guard")) {
  run([
    new URL("./shipping-isolation-guard-runner.js", import.meta.url).pathname,
    "shipping-isolation-guard",
  ]);
}
if (selectors.length === 0 || selectors.includes("shipping-isolation-release")) {
  run([
    new URL("./shipping-isolation-release-runner.js", import.meta.url).pathname,
    "shipping-isolation-release",
  ]);
}
if (selectors.length === 0 || selectors.includes("shipping-isolation-host")) {
  run([
    new URL("./shipping-isolation-host-runner.js", import.meta.url).pathname,
    "shipping-isolation-host",
  ]);
}
if (selectors.length === 0 || selectors.includes("integration-audit")) {
  run([
    new URL("./integration-audit-runner.js", import.meta.url).pathname,
    "integration-audit",
  ]);
}
if (selectors.length === 0 || selectors.includes("cards-basic-melee")) {
  run([
    new URL("./cards-basic-melee-runner.js", import.meta.url).pathname,
    "cards-basic-melee",
  ]);
}
if (selectors.length === 0 || selectors.includes("cards-basic-flying")) {
  run([
    new URL("./cards-basic-flying-runner.js", import.meta.url).pathname,
    "cards-basic-flying",
  ]);
}
if (selectors.length === 0 || selectors.includes("cards-basic-ranged")) {
  run([
    new URL("./cards-basic-ranged-runner.js", import.meta.url).pathname,
    "cards-basic-ranged",
  ]);
}
if (selectors.length === 0 || selectors.includes("cards-swarms")) {
  run([
    new URL("./cards-swarms-runner.js", import.meta.url).pathname,
    "cards-swarms",
  ]);
}
if (selectors.length === 0 || selectors.includes("spawn-placement")) {
  run([
    new URL("./spawn-placement-runner.js", import.meta.url).pathname,
    "spawn-placement",
  ]);
}
if (selectors.length === 0 || selectors.includes("periodic-spawns")) {
  run([
    new URL("./periodic-spawns-runner.js", import.meta.url).pathname,
    "periodic-spawns",
  ]);
}
if (selectors.length === 0 || selectors.includes("death-spawns")) {
  run([
    new URL("./death-spawns-runner.js", import.meta.url).pathname,
    "death-spawns",
  ]);
}
if (selectors.length === 0 || selectors.includes("death-conversion")) {
  run([
    new URL("./death-conversion-runner.js", import.meta.url).pathname,
    "death-conversion",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("cards-building-targeters") ||
  selectors.includes("cards-structure-seeker")
) {
  run([
    new URL("./cards-structure-seeker-runner.js", import.meta.url).pathname,
    selectors.includes("cards-building-targeters")
      ? "cards-building-targeters"
      : "cards-structure-seeker",
  ]);
}
if (selectors.length === 0 || selectors.includes("content-schema")) {
  run(["--test", new URL("./content-schema.test.js", import.meta.url).pathname]);
}
if (selectors.length === 0 || selectors.includes("champions")) {
  run([
    new URL("./champions-runner.js", import.meta.url).pathname,
    "champions",
  ]);
}
if (selectors.length === 0 || selectors.includes("shields-forms")) {
  run([
    new URL("./shields-forms-runner.js", import.meta.url).pathname,
    "shields-forms",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-charge")
) {
  run([
    new URL("./special-movement-charge-runner.js", import.meta.url).pathname,
    "special-movement-charge",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-dash")
) {
  run([
    new URL("./special-movement-dash-runner.js", import.meta.url).pathname,
    "special-movement-dash",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-jump")
) {
  run([
    new URL("./special-movement-jump-runner.js", import.meta.url).pathname,
    "special-movement-jump",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-recoil")
) {
  run([
    new URL("./special-movement-recoil-runner.js", import.meta.url).pathname,
    "special-movement-recoil",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-knockback")
) {
  run([
    new URL("./special-movement-knockback-runner.js", import.meta.url).pathname,
    "special-movement-knockback",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-retarget")
) {
  run([
    new URL("./special-movement-retarget-runner.js", import.meta.url).pathname,
    "special-movement-retarget",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-charge-knockback")
) {
  run([
    new URL(
      "./special-movement-charge-knockback-runner.js",
      import.meta.url,
    ).pathname,
    "special-movement-charge-knockback",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-dash-knockback")
) {
  run([
    new URL("./special-movement-dash-knockback-runner.js", import.meta.url).pathname,
    "special-movement-dash-knockback",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-movement-leap-knockback")
) {
  run([
    new URL(
      "./special-movement-leap-knockback-runner.js",
      import.meta.url,
    ).pathname,
    "special-movement-leap-knockback",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-projectiles-chain")
) {
  run([
    new URL("./special-projectiles-chain-runner.js", import.meta.url).pathname,
    "special-projectiles-chain",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-projectiles-pierce")
) {
  run([
    new URL("./special-projectiles-pierce-runner.js", import.meta.url).pathname,
    "special-projectiles-pierce",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-projectiles-return")
) {
  run([
    new URL("./special-projectiles-return-runner.js", import.meta.url).pathname,
    "special-projectiles-return",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-projectiles-pellets")
) {
  run([
    new URL("./special-projectiles-pellets-runner.js", import.meta.url).pathname,
    "special-projectiles-pellets",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("special-projectiles-reflection")
) {
  run([
    new URL("./special-projectiles-reflection-runner.js", import.meta.url).pathname,
    "special-projectiles-reflection",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-ramp")) {
  run([
    new URL("./combat-status-ramp-runner.js", import.meta.url).pathname,
    "combat-status-ramp",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-heal")) {
  run([
    new URL("./combat-status-heal-runner.js", import.meta.url).pathname,
    "combat-status-heal",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-reset")) {
  run([
    new URL("./combat-status-reset-runner.js", import.meta.url).pathname,
    "combat-status-reset",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-stun")) {
  run([
    new URL("./combat-status-stun-runner.js", import.meta.url).pathname,
    "combat-status-stun",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-slow")) {
  run([
    new URL("./combat-status-slow-runner.js", import.meta.url).pathname,
    "combat-status-slow",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-rage")) {
  run([
    new URL("./combat-status-rage-runner.js", import.meta.url).pathname,
    "combat-status-rage",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-status-snare")) {
  run([
    new URL("./combat-status-snare-runner.js", import.meta.url).pathname,
    "combat-status-snare",
  ]);
}
if (
  selectors.length === 0 ||
  selectors.includes("combat-status-invisibility")
) {
  run([
    new URL("./combat-status-invisibility-runner.js", import.meta.url).pathname,
    "combat-status-invisibility",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-instant")) {
  run([
    new URL("./spells-instant-runner.js", import.meta.url).pathname,
    "spells-instant",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-copy-card")) {
  run([
    new URL("./spells-copy-card-runner.js", import.meta.url).pathname,
    "spells-copy-card",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-clone-unit")) {
  run([
    new URL("./spells-clone-unit-runner.js", import.meta.url).pathname,
    "spells-clone-unit",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-spawn")) {
  run([
    new URL("./spells-spawn-runner.js", import.meta.url).pathname,
    "spells-spawn",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-periodic")) {
  run([
    new URL("./spells-periodic-runner.js", import.meta.url).pathname,
    "spells-periodic",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-travel-line")) {
  run([
    new URL("./spells-travel-line-runner.js", import.meta.url).pathname,
    "spells-travel-line",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-return")) {
  run([
    new URL("./spells-return-runner.js", import.meta.url).pathname,
    "spells-return",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-three-wave")) {
  run([
    new URL("./spells-three-wave-runner.js", import.meta.url).pathname,
    "spells-three-wave",
  ]);
}
if (selectors.length === 0 || selectors.includes("spells-roll")) {
  run([
    new URL("./spells-roll-runner.js", import.meta.url).pathname,
    "spells-roll",
  ]);
}
if (selectors.length === 0 || selectors.includes("death-effects")) {
  run([
    new URL("./death-effects-runner.js", import.meta.url).pathname,
    "death-effects",
  ]);
}
if (selectors.length === 0 || selectors.includes("buildings-defensive")) {
  run([
    new URL("./buildings-defensive-runner.js", import.meta.url).pathname,
    "buildings-defensive",
  ]);
}
if (selectors.length === 0 || selectors.includes("buildings-spawner")) {
  run([
    new URL("./buildings-spawner-runner.js", import.meta.url).pathname,
    "buildings-spawner",
  ]);
}
if (selectors.length === 0 || selectors.includes("buildings-resource")) {
  run([
    new URL("./buildings-resource-runner.js", import.meta.url).pathname,
    "buildings-resource",
  ]);
}
if (selectors.length === 0 || selectors.includes("buildings-travel")) {
  run([
    new URL("./buildings-travel-runner.js", import.meta.url).pathname,
    "buildings-travel",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-arena-shell")) {
  run([
    new URL("./ui-arena-shell-runner.js", import.meta.url).pathname,
    "ui-arena-shell",
  ]);
}
if (selectors.length === 0 || selectors.includes("app-shell")) {
  run([
    new URL("./app-shell-runner.js", import.meta.url).pathname,
    "app-shell",
  ]);
}
if (selectors.length === 0 || selectors.includes("battle-hand-polish")) {
  run([
    new URL("./battle-hand-polish-runner.js", import.meta.url).pathname,
    "battle-hand-polish",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-hud-state")) {
  run([
    new URL("./ui-hud-state-runner.js", import.meta.url).pathname,
    "ui-hud-state",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-input")) {
  run([
    new URL("./ui-input-runner.js", import.meta.url).pathname,
    "ui-input",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-placement-feedback")) {
  run([
    new URL("./ui-placement-feedback-runner.js", import.meta.url).pathname,
    "ui-placement-feedback",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-combat-state")) {
  run([
    new URL("./ui-combat-state-runner.js", import.meta.url).pathname,
    "ui-combat-state",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-combat-effects")) {
  run([
    new URL("./ui-combat-effects-runner.js", import.meta.url).pathname,
    "ui-combat-effects",
  ]);
}
if (selectors.length === 0 || selectors.includes("ui-match-feedback")) {
  run([
    new URL("./ui-match-feedback-runner.js", import.meta.url).pathname,
    "ui-match-feedback",
  ]);
}
if (selectors.length === 0 || selectors.includes("audio-events")) {
  run([
    new URL("./audio-events-runner.js", import.meta.url).pathname,
    "audio-events",
  ]);
}
if (selectors.length === 0 || selectors.includes("audio-renderer")) {
  run([
    new URL("./audio-renderer-runner.js", import.meta.url).pathname,
    "audio-renderer",
  ]);
}
if (selectors.length === 0 || selectors.includes("audio-production-assets")) {
  run([
    new URL("./audio-production-assets-runner.js", import.meta.url).pathname,
    "audio-production-assets",
  ]);
}
if (selectors.length === 0 || selectors.includes("visual-asset-manifest")) {
  run([
    new URL("./visual-asset-manifest-runner.js", import.meta.url).pathname,
    "visual-asset-manifest",
  ]);
}
if (selectors.length === 0 || selectors.includes("visual-arena-art")) {
  run([
    new URL("./visual-arena-art-runner.js", import.meta.url).pathname,
    "visual-arena-art",
  ]);
}
if (selectors.length === 0 || selectors.includes("visual-interface-art")) {
  run([
    new URL("./visual-interface-art-runner.js", import.meta.url).pathname,
    "visual-interface-art",
  ]);
}
if (selectors.length === 0 || selectors.includes("release-build")) {
  run([
    new URL("./release-build-runner.js", import.meta.url).pathname,
    "release-build",
  ]);
}
if (selectors.length === 0 || selectors.includes("combat-effect-protocol")) {
  run([
    new URL("./combat-effect-protocol-runner.js", import.meta.url).pathname,
    "combat-effect-protocol",
  ]);
}

if (selectors.length === 0 || selectors.includes("visual-combat-assets")) {
  run([new URL("./visual-combat-assets-runner.js", import.meta.url).pathname, "visual-combat-assets"]);
}

if (selectors.length === 0 || selectors.includes("visual-motion-polish")) {
  run([new URL("./visual-motion-polish-runner.js", import.meta.url).pathname, "visual-motion-polish"]);
}
