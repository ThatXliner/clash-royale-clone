# CARDS022I / CARDS023D builder evidence

The source and test delta is assembled on accepted base `226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf`. The UI integration adds Brackenwheel portrait/lore lookup, its renderer and presentation-context bridge, and a resource-only Aether Well detail profile. It does not change simulation, combat rules, source records, assets, package files, PLAN, or the default eight-card deck. Aether Well has no portrait in the accepted portrait catalog; the detail panel deliberately keeps that blank placeholder and does not claim new art.

## Brackenwheel browser witness

`browser-attempt-27.stdout.txt`, `.stderr.txt`, `.exitcode.txt`, `.pid.txt`, the browser evidence JSON, screenshots, and the attempt checksum manifest preserve the actual run. Direct test exit was 0 under Node 22.22.3 and Chrome 155.0.8059.40. The actual player pointer event was trusted; player deployment spent 4 elixir and natural AI spent 4 elixir to deploy Brackenwheel once. At contact tick 234 it dealt 267 once to primary ID 2 and 267 once each to eligible secondary IDs 4, 5, and 6; all three secondary receipts retain `melee-area-question-v1`.

The paused checkpoint rendered at physical 13 CSS pixels on phone and resized from 13 to 26 CSS pixels on desktop. Phone normal/reduced and desktop normal/reduced checks passed; each save/restore PNG pair has an identical SHA-256, and session, snapshot, serialized input bridge, selected-card state, and audio continuation hashes remain equal across the paused presentation refresh. Same-deck continuation reached terminal tick 3987, and trusted Play Again restarted at tick 0 with restart count 1. The actual pre/post details are in `browser-attempt-27-cards022-browser-integration-evidence.json`.

Attempts before 27 remain in this directory with their raw outputs and checksums. `failed-attempts.json` explicitly invalidates the earlier nonexistent `controller.input` comparisons and records that the attempt-26 message observer sampled after the production handler. Attempt 27 uses the canonical serialized bridge and labels the message trace accordingly.

## Aether Well details

`cards023d/app-shell-attempt-02.stdout.txt`, `.stderr.txt`, `.exitcode.txt`, `.pid.txt`, `screenshots-attempt-02/browser-evidence.json`, and its checksum manifest preserve the actual run. `node --test tests/app-shell.test.js` exited 0; this test builds a release and exercises the browser application. The screenshot evidence shows the detail view at 390×844 and 1440×933 with no horizontal overflow.

The detail reads the accepted `buildingRuntime` receipt: cost 6 elixir; health 1,070 (QUESTION); deploy 1 s (QUESTION); generation 1 elixir (QUESTION); interval 9 s; lifetime 65 s; destruction grant 1 elixir; role `Resource · does not attack`. The description states that it produces elixir and does not attack. No damage, first-hit, hit-speed, range, or splash values are shown. The test asserts the receipt's per-field policy dispositions and rejects `NaN`/`undefined` display text. The two viewport screenshots are `cards023d/screenshots-attempt-02/aether-well-phone-390x844.png` and `aether-well-desktop-1440x933.png`.

Attempt 01 is preserved as a test-cleanup failure: both Aether screenshots and profile assertions completed, then the helper tried to click the phone-only Back button on desktop. Attempt 02 changed only that cleanup behavior and passed.

`evidence-hashes.sha256` hashes every file in this builder evidence directory except itself. Per-attempt checksum JSON files remain the direct ledgers for each run.

## Final 226 assembled candidate and gates

The owned UI/test delta was assembled on accepted base `226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf` and frozen at commit `bcba6c76ec31215b6dac8208529a6c97b7274ca0`. `final-226-guard/source-identity.json` records the ten changed UI/test paths by Git blob id and worktree SHA-256. The package files stayed unchanged; Node was v22.22.3, npm was 10.9.8, and the locked `npm ci` completed successfully in this private checkout. The captured runs record package and lockfile hashes.

All verification below ran against that frozen source commit; raw stdout, stderr, direct exit codes, PIDs, screenshots and browser evidence are under `final-226-guard/`.

- `node --test tests/ui-combat-state.test.js`: exit 0, PID 8930.
- `node --test tests/cards022-browser-integration.test.js`: exit 0, PID 8947, 1/1 test. Chrome 155.0.8059.40 reported no browser errors. The actual trusted player pointer spent 4 elixir and deployed Brackenwheel; natural AI deployed once. Contact at tick 234 recorded 267 damage to primary ID 2 and once to each eligible secondary ID 4, 5 and 6 (each secondary retained `melee-area-question-v1`). The paused resize checks passed in phone/desktop normal/reduced modes, including physical body scale 13→26 CSS pixels on desktop, byte-identical PNG restore pairs, and unchanged session, snapshot, canonical input bridge, selection and audio hashes. Same-deck terminal reached tick 3987; Play Again restarted at tick 0 with count 1. See `cards022i/harness-artifacts/cards022-browser-integration-evidence.json`.
- `node --test tests/app-shell.test.js`: exit 0, PID 9559, 1/1 test; the test built a release. The actual 390×844 and 1440×933 Aether Well detail screenshots are `app-shell/harness-artifacts/aether-well-phone-390x844.png` and `aether-well-desktop-1440x933.png`. Both show the resource-only profile without attack stats, `NaN`/`undefined`, or horizontal overflow.
- Nondeterminism guard (PID 10105), shipping-isolation guard (10121), shipping-isolation release (10233), shipping-isolation host (10599), and release-build (10669) each exited 0. Exact commands and separate raw output files are under `gates/`.

The final Brackenwheel card-detail and contact screenshots were visually inspected from the fresh 226 run. No source changes followed the frozen candidate commit; only this final verification packet was added afterward.
