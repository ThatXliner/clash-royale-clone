# Combined presentation source cut and qualification runbook

## Frozen source cut

This record is preparation only. Candidate `69a44d3b35f84ede74e2bc20ca4aa2f50d3bfa9d` is a source-only child of exact accepted base `b9b0aff3bb85e099b1438fcffbb13e34fe9ff9c0`. Its seven-file delta copies the ART-004 component blobs from `b460d2e319ca67ff82503ffca31506e941c39d85` exactly. All eight accepted VIS-003SH source blobs match `c4bf8ccefbd0dcb0a6c554a247d2199e13fcd7b0`, `b9b0aff3bb85e099b1438fcffbb13e34fe9ff9c0`, and this candidate byte-for-byte. The manifest records the Git graph, each blob ID and content SHA-256, and the exact tree delta.

The candidate is not yet an accepted combined source. ART-004's independent verdict is pending. No tests, dependency install, build, or browser run was performed for this preparation. The fresh full-source qualification also remains pending; Round 476's result on `5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146` cannot qualify this cut.

The source-kernel file is 523,788 bytes, below the 524,288-byte limit. `package-lock.json` is unchanged and hashes to `d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4`.

## Qualification prerequisites

After ART-004 is accepted and the root releases the final qualification, create a new clean private worktree at the exact accepted final source SHA. Do not use this preparation worktree as the critic checkout. Run every browser gate sequentially, preserve the actual TAP and exit status, browser JSON and PNGs, and source pre/post hashes. Record the exact final source SHA beside every receipt. Keep the existing timing limits and assertion behavior; do not add retries, masks, tolerances, CSS injection, or browser/GPU flags.

The accepted eight VIS source paths and the seven ART-owned paths are disjoint. The original assets and card stats remain unchanged in this candidate. Read `reference/stats/SOURCES.md` before interpreting any stat claim: low-confidence fields stay marked QUESTION. This qualification does not establish full historical parity for the 109-card roster.

## Combined native evidence on one frozen source

Run both native browser integrations from the same final accepted commit and record the identical commit/tree and source fence in each receipt. The ART browser test exercises live arena sprites, physical deployment input, typed audio continuation, exact restore, reduced motion, phone 390×844, and desktop 1440×933. The VIS/CARDS-021 browser integration exercises authenticated structure-origin contacts, damage/death feedback, audio, input, and exact normal/reduced-motion restores at those viewports. Together they establish the two presentation paths on one frozen source cut; the earlier independent VIS run is background only and cannot replace the fresh final-source run.

`tests/combat-sprite-prototype-browser.test.js` writes to a hard-coded tracked path, `artifacts/art004-aggregate-round-5/builder/live-browser`, which already contains older evidence. Before its one allowed run, redirect that path through a temporary symlink to a fresh empty directory under the unique final run root. Preserve the old tree from Git and restore it from the final commit immediately afterward. The script below records hashes to prove restoration. Do not run the test twice into the same output directory.

`tests/cards021-browser-integration.test.js` accepts `CARDS021_BROWSER_ARTIFACTS`; point it at a fresh directory under the unique final run root. The endurance runner accepts `GAME_BROWSER_ENDURANCE_ARTIFACTS`; use separate `default-eight` and `kilnkeeper` directories.

## Frozen-source and environment commands

Run from the root of the new critic checkout after ART acceptance and release. Substitute only the exact final accepted source SHA. Keep `GAME_BROWSER_ENDURANCE_TICKS` unset so each endurance run retains the full 18,000-tick bound.

```sh
FINAL_SOURCE='<exact-final-accepted-source-sha>'
RUN_ROOT="artifacts/combined-presentation-round1/critic/${FINAL_SOURCE}"
PLAYWRIGHT_MODULE="$PWD/node_modules/playwright/index.mjs"
CHROME_EXECUTABLE='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

# Confirm this is the clean, exact final cut before installing or running anything.
test "$(git rev-parse HEAD)" = "$FINAL_SOURCE"
git diff --quiet
git diff --cached --quiet
test -z "$(git ls-files --others --exclude-standard -- src public/assets tests package.json package-lock.json)"

# In the released final critic checkout only, install from the unchanged lockfile.
npm ci
test "$(node --version)" = 'v22.22.3'
test "$(npm --version)" = '10.9.8'
test "$("$CHROME_EXECUTABLE" --version)" = 'Google Chrome 155.0.8059.40'
test "$(shasum -a 256 package-lock.json | awk '{print $1}')" = 'd707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4'
test "$(wc -c < src/sim/battle-continuation-kernel.js | tr -d ' ')" -le 524288

mkdir -p "$RUN_ROOT"
node --version > "$RUN_ROOT/node-version.txt"
npm --version > "$RUN_ROOT/npm-version.txt"
"$CHROME_EXECUTABLE" --version > "$RUN_ROOT/chrome-version.txt"
printf '%s\n' "$FINAL_SOURCE" > "$RUN_ROOT/final-source-sha.txt"
```

For each gate, capture a SHA-256 manifest of tracked `src`, `public/assets`, `tests`, `package.json`, and `package-lock.json` immediately before and after. Check for untracked files in those same source scopes. Preserve command output byte-for-byte and write the exact process exit code in a separate file. A browser result only counts for the frozen final source if the commit and both source fences still match.

## ART and VIS native integration commands

The two browser commands below are sequential. Capture each command's raw TAP/output and exit status under a distinct directory. For the ART runner, redirect its baked-in output directory before invoking Node:

```sh
test ! -e "$RUN_ROOT/art-browser-artifacts"
test ! -e "$RUN_ROOT/cards021-browser-artifacts"
mkdir -p "$RUN_ROOT/art-browser-artifacts" "$RUN_ROOT/cards021-browser-artifacts"

ART_OUT='artifacts/art004-aggregate-round-5/builder/live-browser'
ART_ARCHIVE="$RUN_ROOT/old-art004-round5-live-browser.sha256"
ART_TEST_OUTPUT="$RUN_ROOT/art-browser-artifacts"
find "$ART_OUT" -type f -print0 | xargs -0 shasum -a 256 > "$ART_ARCHIVE"
rm -rf "$ART_OUT"
ln -s "$PWD/$ART_TEST_OUTPUT" "$ART_OUT"
GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT_MODULE" GAME_BROWSER_CHROME="$CHROME_EXECUTABLE" \
  node --test tests/combat-sprite-prototype-browser.test.js \
  > "$RUN_ROOT/art-browser.tap" 2>&1
ART_STATUS=$?
printf '%s\n' "$ART_STATUS" > "$RUN_ROOT/art-browser.exit"
rm "$ART_OUT"
git restore --source="$FINAL_SOURCE" --worktree --staged -- "$ART_OUT"
find "$ART_OUT" -type f -print0 | xargs -0 shasum -a 256 > "$RUN_ROOT/restored-art004-round5-live-browser.sha256"
diff -u "$ART_ARCHIVE" "$RUN_ROOT/restored-art004-round5-live-browser.sha256"

GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT_MODULE" GAME_BROWSER_CHROME="$CHROME_EXECUTABLE" \
CARDS021_BROWSER_ARTIFACTS="$RUN_ROOT/cards021-browser-artifacts" \
  node --test tests/cards021-browser-integration.test.js \
  > "$RUN_ROOT/cards021-browser.tap" 2>&1
CARDS021_STATUS=$?
printf '%s\n' "$CARDS021_STATUS" > "$RUN_ROOT/cards021-browser.exit"
```

Use an error-safe wrapper or shell trap in the actual run so the ART artifact symlink is removed and the tracked directory restored even if the browser command fails. A failing command remains a failure in the receipt; cleanup must not mask its exit status. Compare ART and VIS screenshots and JSON from this final cut directly. Keep the prior Round 478 artifacts unchanged as historical evidence.

## Focused source gates

After the native integrations, run the owned unit/integration gates serially, retaining TAP and exit code per command:

```sh
node --test tests/combat-sprite-prototype.test.js
npm run test:game-ui-projection
npm run test:ui-combat-state
npm run test:ui-combat-effects
npm run test:combat-effect-protocol
```

Do not broaden this into the full suite unless the root's final gate explicitly includes it. Source hashes and the exact commit must match after each run.

## Strict GPR7A endurance and audio gates

The default-eight and custom Kilnkeeper journeys must each run to their original bounds, on the same final accepted source SHA, in separate sequential processes. Do not provide `GAME_BROWSER_ENDURANCE_TICKS`; keep the existing 50 ms non-initialization long-task cap, 300 ms initialization cap, 40 ms synchronous slice target, 30-second segment cap, and 1,200-second total cap. Preserve the actual browser screenshots and endurance JSON for each scenario.

```sh
mkdir -p "$RUN_ROOT/default-eight/browser" "$RUN_ROOT/kilnkeeper/browser"

GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT_MODULE" \
GAME_BROWSER_CHROME="$CHROME_EXECUTABLE" \
GAME_BROWSER_ENDURANCE_SCENARIO='default-eight' \
GAME_BROWSER_ENDURANCE_ARTIFACTS="$RUN_ROOT/default-eight/browser/" \
  npm run test:game-browser-endurance \
  > "$RUN_ROOT/default-eight.tap" 2>&1
DEFAULT_STATUS=$?
printf '%s\n' "$DEFAULT_STATUS" > "$RUN_ROOT/default-eight.exit"

GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT_MODULE" \
GAME_BROWSER_CHROME="$CHROME_EXECUTABLE" \
GAME_BROWSER_ENDURANCE_SCENARIO='kilnkeeper' \
GAME_BROWSER_ENDURANCE_ARTIFACTS="$RUN_ROOT/kilnkeeper/browser/" \
  npm run test:game-browser-endurance \
  > "$RUN_ROOT/kilnkeeper.tap" 2>&1
KILNKEEPER_STATUS=$?
printf '%s\n' "$KILNKEEPER_STATUS" > "$RUN_ROOT/kilnkeeper.exit"

GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT_MODULE" GAME_BROWSER_CHROME="$CHROME_EXECUTABLE" \
  npm run test:game-browser-audio \
  > "$RUN_ROOT/game-browser-audio.tap" 2>&1
AUDIO_BROWSER_STATUS=$?
printf '%s\n' "$AUDIO_BROWSER_STATUS" > "$RUN_ROOT/game-browser-audio.exit"

npm run test:audio-production-assets \
  > "$RUN_ROOT/audio-production-assets.tap" 2>&1
AUDIO_ASSET_STATUS=$?
printf '%s\n' "$AUDIO_ASSET_STATUS" > "$RUN_ROOT/audio-production-assets.exit"
```

Run each command only once per frozen source and preserve its actual output, exit code, JSON, and screenshots. If a gate fails, retain that evidence and report the failure; do not retry with relaxed timing, paint, image, GPU, or source fences. After the last gate, run a fresh independent critic on this exact final accepted source with the task's required blind role boundary and source identity, and retain its native evidence and verdict separately.
