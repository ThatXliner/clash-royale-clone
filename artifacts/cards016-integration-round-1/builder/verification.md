# CARDS-016I builder verification

Candidate worktree state before commit: integration-focused run results below. These are implementation checks for the independent critic; they are not a gameplay or visual acceptance verdict.

## Passing checks

| Command | Result |
| --- | --- |
| `node --test tests/cards016-integration.test.js` | PASS, 5/5. Deck counts/default setup, retained QUESTIONs and restore, seeded opponent choices, air-to-air combat/projectile restore, and mixed RL masking/cycle/restore. |
| `npm run test:editable-deck` | PASS, 10/10. |
| `node --test tests/game-roster-troops-air-swarms.test.js` | PASS, 8/8. |
| `npm run test:rl-environment` | PASS, 11/11. |
| `node --check tests/app-shell.test.js && node --check src/content/editable-deck.js` | PASS. |
| `git diff --check` | PASS. |

The integration test asserts that the shipped default setup remains byte-for-byte equal to the prior eight-card setup. No default deck or runtime timing code was changed.

## Candidate gap

`APP_SHELL_ARTIFACTS=artifacts/cards016-integration-round-1/builder/app-shell npm run test:app-shell -- app-shell` did not pass. At `tests/app-shell.test.js:723`, after resizing to 390x844, the arena iframe measured approximately `{x: 52.03, y: 117, width: 615.94, height: 1095}` and exceeded the expected 390x660 available area. The runner stopped there, before the later trusted Gloamwing deck replacement and deployment steps. Do not treat this as a UI pass; the independent critic should reproduce at 390x844 and 1440x933 and assess the gap.

The `app-shell/` directory retains the detail-screen captures produced before that failure, including Gloamwing and Coppershade phone/desktop captures. Their existence does not change the failed end-to-end status.
