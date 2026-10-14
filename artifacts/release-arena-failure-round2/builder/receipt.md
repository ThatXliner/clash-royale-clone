# RELEASE-ARENA-001 builder receipt, round 2

Base commit: `43292aae51a80966d2e02bd7dd38d5e9342b8ec2` (the frozen round-1 candidate). Round-1 code, diagnostic logs, and receipts remain unchanged.

The round-1 prefixed Pages inspection at `/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-arena-failure-round1/critic/prefixed-pages-inspection.json` showed that startup and the arena now work, but Buried Coil's summary said it dealt splash damage to unavailable targets while its accepted defensive profile is single-target, has `targetMode: "air_and_ground"`, and has no area-damage radius. The details renderer also treated the profile's canonical target mode as unavailable.

The app shell now maps the canonical `air_and_ground` value to “ground and air.” Defensive structure descriptions derive single-target versus splash wording, target set, radius, and confidence from the existing `buildingRuntime` profile and its policy. A defensive profile with a `null` area radius displays “None (QUESTION)”; its target field displays “ground and air (QUESTION).” No profile fields, values, or confidence policies were changed.

Buried Coil's final summary copy is:

> Stationary defensive structure · single-target attacks against ground and air targets. Its combat profile is QUESTION; shown combat values remain provisional.

Ember Basin's final summary copy is:

> Stationary defensive structure · splash damage against ground targets within a 1-tile radius. Its combat profile is QUESTION; shown combat values remain provisional.

The browser regression asserts Buried Coil's canonical target mode, null radius and `question` disposition, its full rendered profile, and the exact truthful summary without a splash or unavailable-target claim. The existing Ember Basin profile assertion still checks its 1-tile splash radius, ground target, and QUESTION values; the revised test also checks the exact splash summary. Default-eight and older collection expectations are unchanged.

## Verification

- `node --check src/ui/app-shell.js`, `node --check tests/app-shell.test.js`, and `git diff --check`: pass.
- `npm run test:app-shell`: pass, 1/1, 64.599 s, against the built browser artifact.
- `npm run test:release-build`: pass, 22/22, 50.453 s, including release game/RL browser qualification and unchanged bounds/isolation checks.
- `npm run test:publication-pages`: pass, 5/5, 32.592 s, including the prefixed Pages browser smoke.

Captured output is beside this receipt. Test-generated screenshots and older release evidence outside this round's receipt directory were restored before freezing the candidate.
