# Mossguard integration reconnaissance

Read-only source basis: exact `HEAD` `3a4265a39cc5176329ad70cdff358577cdc66f5d` (inspected with `git show`). No tests or browser checks were run.

## Ownership map

- ART-005M is `FAIL` and ART-005MI is `PENDING` in `PLAN.md:270-271`. The recorded asset review rejected the first Mossguard sheet for size, edge fringe, native-scale pose readability, and baseline alignment. The current Mossguard sprite asset is unaccepted; keep the existing generic vector art until ART-005M accepts a sheet. Do not assume the pending revision is valid.
- `src/ui/combat-art.js:10-18,46-54,168-225`: Briar has the atlas metadata and painted-frame helpers; Mossguard is currently among generic vector `shapes`. Add accepted Mossguard asset metadata/creation here.
- `src/ui/combat-state.js:482-493,518-576`: current target-link heading helper, reduced-motion lookup, canonical tick, and Briar-only art branch. Route Mossguard through its accepted atlas while preserving the existing heading/tick/team inputs.
- `src/ui/game-ui-projection.js:161-219,321-330,535-549`: `briarAttackContacts` and `bindBriarAttackFrames` restrict painted melee attack-frame binding to Briar. The source motion feed is already attached here.
- `src/ui/combat-motion.js:28-69,102-155`: authentic attack poses and melee contacts are already derived for any supported live unit with a valid attack cycle; generic contact markers are rendered. Mossguard melee is already projected as motion/contact feedback, but has no Mossguard painted attack-frame binding. No source change here is needed for event generation.
- `src/content/visual-asset-manifest.js:226-247`: register the accepted Mossguard output with its measured bytes, dimensions, format, SHA-256, authored provenance, and license.

## Existing witness and qualification paths

- `tests/game-shared-runtime-integration.test.js:51-78,157-175,187-220` provides authentic deterministic Mossguard melee data: seed 444, south Mossguard, tick-102 contact, source 1 to target 2, 202 damage. This is simulation evidence, not browser sprite proof. Same-X northward target placement supplies a usable north heading through the existing target link.
- `tests/game-ui-projection.test.js:1161-1269` contains the authentic Briar contact, age, and exact projection restore pattern. Its accepted-parent comparison at `1271-1333` includes Mossguard and currently expects full non-Briar DOM equality.
- `tests/ui-combat-state.test.js:186-253` compares all non-Briar art with the accepted parent; this fence must permit only the intentional Mossguard art change while retaining other-role checks.
- `tests/combat-sprite-prototype-browser.test.js:518-677,780-1057,1098-1247` is the closest actual-battle path to extend. It exercises `1440×933` and `390×844`, checks a real player deployment and melee contact, normal/reduced motion, viewport PNG equality after restore, and exact session/input/audio continuation plus PCM replay. It currently qualifies Briar only; Mossguard browser integration remains unproved.
- `tests/game-browser-endurance.test.js:35-54,226-239` is the performance gate: default run reaches tick 18,000, with 50 ms browser long-task and 300 ms initialization caps. Performance qualification for production renderer changes remains unproved.

## Commands available from `package.json`

- `npm run test:ui-combat-state`
- `npm run test:game-ui-projection`
- `npm run test:visual-asset-manifest`
- `node --test tests/combat-sprite-prototype-browser.test.js` (no named npm script)
- `npm run test:game-browser-endurance` (reopen if production rendering changes)

The Mossguard asset has not been accepted, and actual-battle integration, restore qualification, and performance qualification for it are all unproved.
