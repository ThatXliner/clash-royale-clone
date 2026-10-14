# RELEASE-ARENA-001 builder receipt

Base commit: `049cd15c2bd51d4a6272550b36b740e2e6ee53fb` (the accepted private worktree).

The Pages release failure was caused by app-shell initialization routing `buried-coil` through `projectSessionTroopBattleCard`. The admitted mixed deck contains this defensive structure, but the shell only special-cased Squall Orb and Ember Basin as non-unit cards. The troop projector threw `RangeError: session troop battle card ID is unknown or not admitted` while the app-shell module was loading, before navigation handlers registered. The exact release test then waited 15 seconds for the arena iframe; the full baseline subtest took 27,918.9955 ms and the test process took 28,969.848583 ms.

Instrumented reproduction captured two page errors, a top document that remained on the home view with no battle iframe, and 19 startup requests that all returned HTTP 200 with JavaScript/CSS content types. This rules out the asset/MIME and iframe-URL hypotheses. The raw baseline, instrumented, and GitHub run output are retained beside this receipt.

`src/ui/app-shell.js` now routes IDs in the narrow `EDITABLE_DECK_CARD_IDS` troop set through the troop projector, and the other admitted mixed-deck IDs through `projectSessionNonUnitBattleCard`. The shell therefore uses the accepted typed defensive-building projection for Buried Coil instead of rejecting or dropping the admitted card. The focused app-shell browser check independently expects all 21 collection choices and all 13 replacement choices, confirms Buried Coil renders as a stationary defensive structure with its `QUESTION` provenance, and retains the original default-eight checks and ordering.

`scripts/release-browser-qualification.js` now records failure-only browser diagnostics: page/worker runtime and console errors, request status/content type/failure, top-level view and iframe state, and child-frame DOM/script/style state. Same-origin request URLs are reduced to paths before printing.

## Verification

- Baseline actual-artifact failure: reproduced; 15-second arena wait timeout, 27,918.9955 ms test / 28,969.848583 ms process.
- Instrumented actual-artifact failure: reproduced with the projector `RangeError`, no iframe, and all 19 requests successful.
- `node --test --test-name-pattern='RELEASE-001B emits a deterministic bounded graph' tests/release-001b.test.js`: pass, 1/1, 38.739 s. Fresh deterministic bounded game artifact mounts the arena; game and RL qualification succeed.
- `npm run test:app-shell`: pass, 1/1, 64.478 s. Includes the collection/replacement check and the app-shell browser journey.
- `npm run test:release-build`: pass, 22/22, 51.758 s. Includes the production game/RL artifact, manifest and source-isolation adversaries, and existing caps.
- `npm run test:publication-pages`: pass, 5/5, 32.850 s. Includes the Pages subpath browser smoke.
- `node --check` on the edited JavaScript and `git diff --check`: pass.

The exact command output and failed-run evidence are in this directory. Test-generated screenshots and baseline evidence outside this directory were restored after verification; only the scoped source, regression, failure-diagnostic, and receipt files belong to this candidate.
