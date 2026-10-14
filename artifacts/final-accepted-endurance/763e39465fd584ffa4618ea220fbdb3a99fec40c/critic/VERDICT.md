# GAME-001GPR7A strict accepted-source qualification

**Verdict: PASS for the requested scoped qualification on `763e39465fd584ffa4618ea220fbdb3a99fec40c`.** All four required gates completed with exit code 0: default-eight full 18,000, separate full Kilnkeeper natural-terminal/restart, browser-audio adapter, and production audio assets. Raw TAP totals are 22/22 (3 + 3 + 11 + 5). This is an endurance/audio qualification for these two eight-card journeys; it is not a 109-card historical parity certification. No result from the earlier 5ed source run was used to qualify this SHA.

## Frozen source and runtime

The runs used a new private detached checkout at `/tmp/clash-royale-critic-763e3946`; the shared checkout’s `HEAD` and index were not changed. The frozen source SHA is recorded before and after every gate. The continuation kernel was 523,788 bytes, SHA-256 `115c43146f5818c69a98120e856ddaa5d20243fced3609320d90edc7ae933bea`; `package-lock.json` SHA-256 was `d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4`.

The pinned environment was Node 22.22.3, npm 10.9.8, Playwright 1.58.2, and native `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` version 155.0.8059.40. `npm ci` exited 0. No test caps, browser flags, tolerances, masks, styles, or tick overrides were changed. The endurance limits remained 50 ms noninitial long tasks, 300 ms initialization, 40 ms synchronous simulation slices, 30 s per segment, and 1,200 s total.

## Gate results

| Gate | Process / exit | Actual result |
| --- | --- | --- |
| `npm run test:game-browser-endurance` with both scenario and tick variables unset | PID 60895 / 0 | 3/3 TAP. Default eight completed a natural terminal at tick 18,000: South 2–1 by lowest-HP tiebreak. Seed-zero restart returned to tick 0 with the same shipped eight-card deck and restart count 1. Test duration 968,223 ms. |
| `npm run test:game-browser-endurance` with `GAME_BROWSER_ENDURANCE_SCENARIO=kilnkeeper` and tick variable unset | PID 66798 / 0 | 3/3 TAP. Separate selected eight-card Kilnkeeper deck reached natural regulation terminal at tick 10,800: North 2–1; restart returned to tick 0 with that same selected deck and restart count 1. Test duration 448,184 ms. |
| `npm run test:game-browser-audio` | PID 69688 / 0 | 11/11 TAP using host-double audio contexts. These checks cover adapter behavior and policy; they are not native PCM evidence. |
| `npm run test:audio-production-assets` | PID 70053 / 0 | 5/5 TAP, including a real Chrome run that schedules and records PCM observations through the shipped sink. This is browser sink evidence, not a measurement from physical speakers. |

Both endurance runs stayed inside every limit. Default-eight: maximum initialization long task 161 ms, maximum noninitial 0 ms, maximum sync session slice 34.1 ms, restore slice 8.4 ms, maximum segment 10,347 ms, total 968,223 ms. Kilnkeeper: 159 ms initialization, 0 ms noninitial, 22.9 ms sync session slice, 7.6 ms restore slice, 10,311 ms maximum segment, and 448,184 ms total. No restore, terminal, restart, final-drain, screenshot, or out-of-segment long task was recorded.

Both journeys restored from tick 600 to 300, then replayed to tick 600. Browser/session bytes, E2 bridge history, and future audio continuation bytes matched their branch witnesses. Typed simulation continuation matched exactly across original and replay: 29 starts in default-eight and 27 in Kilnkeeper. The actual sink retained 55/55 starts through default restore and 54/54 through Kilnkeeper restore, with replay totals of 86 and 83 respectively. Simulation and UI sequence-zero domains remained distinct; replayed UI sequence advanced exactly twice per journey.

The workload sends card-slot and arena pointer actions through the live Chrome page. The harness checks that each physical action produces exactly one E2 bridge delivery, that normalized card/slot/point/tick data equals the planned command, and that the direct E2 mirror accepts it. Transport IDs are monotonic within each branch. IDs repeat at the restore boundary when the saved branch is replayed, as expected. The summary field `acceptedBrowserCommandIdsMonotonic` is false only when those two timelines are flattened together; raw branch records and replay assertions show the intended behavior. The exact `event.isTrusted` bit is not serialized in the endurance JSON, so trust is evidenced by the Playwright/Chrome pointer-input path rather than a separate persisted boolean.

In the production audio evidence, Chrome scheduled 45 nonzero PCM buffers across the required nine families (`uiToggle`, `cardSelect`, `cardPlay`, `attack`, `launch`, `impact`, `tower`, `crown`, `matchEnd`); each recorded sample has positive peak and energy at 12 kHz. The two toggle observations record unmuted/effective gain 57 basis points and muted/effective gain 0. Restart showed zero unlocks and zero PCM before the new gesture, then one unlock and PCM after it. A separate Chrome movement capture recorded 23 nonzero buffers, including the movement family. The offline WAV is also nonzero and byte-stable. The adapter’s 11 host-double checks and this five-case production suite are reported separately to keep their evidence scopes clear.

## Source fences and limits

The original 535-file `src`, `public/assets`, `tests`, package, and lock manifests matched before and after the default run. Its supplemental all-`public/` 537-file baseline was reconstructed from the clean pinned Git tree and is explicitly labeled as such; the actual post-run all-public manifest matched it. Kilnkeeper and both audio gates each captured matching 537-file all-public manifests directly. All gates recorded the same frozen `HEAD`, kernel, and lock hashes, and scoped source status is empty after each gate.

The production audio suite writes to a hard-coded tracked artifact directory. Its two original tracked files were hash-archived, the directory was temporarily redirected to this unique evidence folder, then restored byte-for-byte. The before/restored hashes match. The private checkout is clean and no Chrome or test runner remains active.

The evidence does not establish exhaustive interaction parity for every historical card combination, side-by-side visual parity against reference footage, or acoustic output from a physical audio device. Those remain outside this scoped endurance qualification.

## Receipts

- `default-eight/raw.tap`, `default-eight/endurance-result.json`, `default-eight/summary.json`, and active/terminal/restart screenshots
- `kilnkeeper/raw.tap`, `kilnkeeper/endurance-result.json`, `kilnkeeper/summary.json`, and active/terminal/restart screenshots
- `game-browser-audio/raw.tap`
- `audio-production-assets/raw.tap`, generated `audio-production-evidence.json`, and `audio-production-offline.wav`
- Per-gate commands, actual process IDs, exit codes, source manifests/status, kernel/lock fences, and `evidence-SHA256SUMS.txt`
