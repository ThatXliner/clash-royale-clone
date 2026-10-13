# CARDS-018K builder evidence

The editable mixed-card path admits Ember Basin alongside the previously supported troops and Squall Orb. It preserves the troop-only witness contract and includes the exact existing troop QUESTION records and original building profile receipt. RL observations now include structures sorted by entity ID, with owner, position, ground layer, HP, lifetime, targeting mode, current attack cycle, and the unchanged QUESTION policy receipt. The RL observation schema is version 2 because it adds the `structures` field; consumers should check `version` before relying on the expanded shape, and version 1 checkpoints are not accepted by the version 2 restore path.

No building constants or source confidence values were changed or promoted. The 20 troop confidence QUESTION references omitted from three existing test fixture helpers are now included by key, filtered from the original roster QUESTION records, and retain their recorded values and dispositions.

The building test occurrence totals were stale in both clean baseline archives. At `12543e0` and `f5034dc661243383d0da54a95b1ffd9842eb1889`, `game-roster-buildings` reported 55 admitted identities / 60 admitted occurrences and 61 claimed identities / 66 claimed occurrences; the fixture expected 49 / 54 and 55 / 60. The test now asserts the measured totals while preserving exact manifest-to-integration occurrence equality and the excluded counts.

Before fixture repair, both clean archives reproduced the source-confidence setup error in `game-building-runtime`: 3 of 15 tests passed and 12 failed with `roster[6].entities[0] source confidence field lacks a QUESTION record`. The same 20 missing references are `briar-runner.{count,damage,deploy-time-ticks,first-hit-ticks,hit-speed-ticks,hitpoints,movement-millitiles-per-second,range-millitiles,sight-range-millitiles,target-mode}` and the corresponding ten `briar-darter.*` keys. All exact records already existed in `createPlayableRosterQuestionRecords()` with QUESTION disposition.

Default shipped GameSession bytes were compared with a clean `12543e0` archive for seeds 0 and 23, including setup, initial serialization, 120-tick continuation serialization, and replay bytes. The hashes matched exactly:

| Seed | Setup | Initial state | After 120 ticks | Replay |
| --- | --- | --- | --- | --- |
| 0 | `6605be1bdf48aa971f3c55d841c19fc44a748ef1f5e25609630a25ec663c4e98` | `ed371dd1d28d6be72a98bda32e434cbbc5431eea4f163e4206a1901cd08dbea1` | `6ebfb5fecea169d18f74d40b57f026f152fbcb789557737863bf2d0363bc532c` | `77cead15ee16064df86b604965cfd61070da424d08d4a2376ab1758f1208bc2c` |
| 23 | `94cbdd3603f4522a8f986499813eb4e210eafd4d4b6170d7d0c81d188faaa219` | `d6879256a66396ff175769546a9c66d0158bfe11d60892713a43173c6b4bff63` | `a04a1b8bd92db6450a4e179fe0a381bc48f88f55050ebf26237c8284a0229f4c` | `23cc3261b0dfae84237f605ecbd0e48137cd0d3dba9dfb7b11fcdd7d97325861` |

Focused verification passed:

- `npm run test:editable-deck` — 12/12.
- `npm run test:rl-environment` — 12/12.
- `node tests/game-building-runtime-runner.js game-building-runtime` — 15/15.
- `node tests/game-roster-buildings-runner.js game-roster-buildings` — 10/10.
- `node tests/game-building-policy-runner.js game-building-policy` — 3/3.
- `git diff --check` — clean.
