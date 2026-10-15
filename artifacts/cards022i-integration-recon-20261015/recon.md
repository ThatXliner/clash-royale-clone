# CARDS-022I integration reconnaissance

Read-only packet frozen from `a26ea7f80dbd75db22f372d40a3939a098bf6541` (clean detached worktree). Parent later reported `dc0949edfe8d6a88953636a4ed6969b49ae292f7` as accepted ART-022L round 498; the accepted change supplies `src/ui/brackenwheel-art.js` and `public/assets/brackenwheel-battle-sprite.webp`. This packet contains source observations, not a build or test result. No source, PLAN, package, or reference files were changed.

## Minimal owned integration paths

Brackenwheel is already an editable collection/replacement choice. Keep `src/content/playable-roster.js` at its exact default eight and do not edit `src/content/session-troop-roster.js`, editable-deck rules, simulation, or asset/provenance manifests. `src/ui/app-shell.js:12-18,296-311,354-362` assembles the collection; `src/content/session-troop-roster.js:60-73` already includes `brackenwheel`. The old browser test's total-count assertion at `tests/cards021-browser-integration.test.js:865-868` is stale (21 at a26); assert Brackenwheel's presence and the default eight directly, not a fixed total, since later admitted cards can change it.

Minimum runtime ownership for I:

- `src/ui/card-portrait-art.js:1-93` — add lookup for the existing `brackenwheel-portrait-painted` manifest asset (`src/content/visual-asset-manifest.js:524-534` at a26).
- `src/ui/card-lore.js:3-29` — add the approved two-sentence entry below.
- `src/ui/combat-state.js:294-347,495-583` — dispatch Brackenwheel to the accepted scale-art helper and keep combat-view projection/state deterministic.
- `src/ui/app-shell.js:406-424,338-345` and `src/ui/arena-shell-entry.js:47-78` — use the existing outer layout calculation/strict bridge to carry explicit presentation size context. The frame is scaled from 720×1280; derive the requested body CSS-pixel target from the trusted viewport/layout context at resize/layout time (phone390×844 → 13px, desktop1440×933 → 26px). Keep this presentation-only, outside the simulation/session state; do not measure layout in the hot simulation loop or use counters/randomness.

No `game-browser-entry.js`, `game-ui-projection.js`, or `game-browser-loop.js` change is needed if the validated context is set once on the arena document and read by the existing renderer. Add them only if the current accepted code's actual context route requires forwarding through those modules. Preserve `src/ui/game-ui-projection.js:500-548,588-605` staged semantic render projection and unchanged-child lifecycle; `src/ui/combat-state.js:581` currently replaces staged layers on bind, so restore must be checked at the actual screenshot boundary.

Approved lore supplied by parent from the original Brackenwheel brief (not located in repo lore map/history): “Brackenwheel learned to clear jammed sluice gates by spinning a copperroot sickle through the reeds. After dusk, emberseed sparks trace a ring around her boots, and she counts each flicker as a warning from the river.” Do not substitute invented prose.

## Existing witnesses and harness

- Natural seed-2 AI + causal area-contact witness: `tests/cards022k-brackenwheel.test.js:321-368`. Deck is `brackenwheel,briar-band,coilblade,mossguard,ironroot,copperskiff,brassbolt,reedsting`; south Brackenwheel is deployed via public RL action at world `(3500,14500)`, north AI naturally deploys Brackenwheel(s) and Briar Band, checkpoint at tick 234, then tick 235 records a primary and two secondary Brackenwheel contacts and exact RL checkpoint restore. This is the known seed/causal witness, not browser input evidence.
- Companion cost/cycle/restore witness: `tests/cards022k-brackenwheel.test.js:192-266` uses `GameSession(createEditableGameSessionSetup(deck,2))`; south Brackenwheel command and constrained north Briar deployment establish the 4-cost/one-cycle behavior, contact, restore/fork. It is not the natural-AI witness.
- Actual trusted-input integration base: `tests/cards021-browser-integration.test.js:1-35,634,698-854,865-918,960-1105`. `clickWorldPoint` maps a native `page.mouse.click` to world coordinates (`:94`); existing test asserts `event.isTrusted` (`:1017-1019`) and exercises selection/action, screenshot/state/input/audio restore, normal/reduced motion, and 390×844 / 1440×933 contexts. Extend this harness or add `tests/cards022-browser-integration.test.js`; use a native pointer path to deploy/use Brackenwheel and let seeded AI run. Do not set combat state, inject queued commands, or fake `requiredCard`.

Read-only commands identified for the later builder (none run during recon):

- `node --test tests/cards022k-brackenwheel.test.js`
- `node --test tests/ui-combat-state.test.js`
- `node --test tests/app-shell.test.js tests/app-shell-layout.test.js`
- `node --test tests/game-ui-projection.test.js tests/game-input-bridge.test.js`
- `node --test tests/cards021-browser-integration.test.js` (existing harness performs its own release build; use the focused CARDS-022I browser test instead if split out).
- `package.json` also defines focused `test:app-shell`, `test:ui-combat-state`, `test:game-ui-projection`, `test:game-input-bridge`, `test:game-restart`, and `test:game-browser-audio` scripts. Confirm current package scripts on the builder base before invocation.

Verification targets for the builder: custom eight-card player deck with Brackenwheel and natural AI Brackenwheel; one 4-elixir spend/cycle; trusted native phone pointer causing actual primary and secondary area-contact feedback; 13px phone and 26px desktop body size in normal/reduced motion; visible QUESTION labels; existing audio/input receipts; exact PNG/state/input/audio restore and same-deck restart; default eight unchanged. This packet did not run tests, a release build, or a browser.

## Provenance and hashes

Recon source: `a26ea7f80dbd75db22f372d40a3939a098bf6541`; later accepted ART-only base reported by parent: `dc0949edfe8d6a88953636a4ed6969b49ae292f7`. The accepted source observations above were read at a26 unless explicitly marked as the parent-reported dc adoption. The lore quote is parent-provided session evidence, not a repository-history finding.
