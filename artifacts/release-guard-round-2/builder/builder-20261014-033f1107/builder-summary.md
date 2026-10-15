# RELEASE-GUARD-001 round 2 builder evidence

Candidate: `46c542a10df358902fa1147e6d2b7ad04ea80d57` (parent `033f1107b22b39f3079670a33a660fba81b95f75`). The only committed tracked change is `tests/game-spell-runtime.test.js` (4 insertions, 2 deletions): two fixture helpers now union canonical `QUESTION` keys from each entity's `sourceConfidencePolicy.fields[].questionKey`. Private detached candidate checkout is clean. Shared checkout `HEAD` remained 033; no shared checkout cleanup was performed.

## Source and release fences

`source-equivalence.json` resolves qualification ref `763e39465fd584ffa4618ea220fbdb3a99fec40c`. Git `diff --quiet` returned 0 for `src/`, `public/`, `scripts/`, `package.json`, and `package-lock.json` between 033 and 763, between candidate and 033, and between candidate and 763. Test harness plus package/lock comparisons differ only because of the single permitted test helper file. The 558-path pre/post tracked fence changed only `tests/game-spell-runtime.test.js`; 557 paths are identical. Exact pre/post hashes and sizes are recorded in `source-public-fence.compare.json` and `final-fences.json`.

Candidate Pages was built with full candidate SHA `46c542a10df358902fa1147e6d2b7ad04ea80d57` and prefix `/clash-royale-clone`; actual build exit was 0. The 033 and candidate manifests each have 54 entries and 6,137,783 release bytes, with identical paths, sizes, and SHA-256 values. Their 64-file assembled trees differ only in root `index.html` (6,205 bytes), which contains the build ref. Native desktop Chrome requested `/clash-royale-clone/`; it returned HTTP 200 with body SHA-256 equal to the candidate emitted `index.html` (`f8dc1c83b36f1941ed896ed009ecbfcc054d1450e5a95af7c3e7c75a56f2ff56`). Caps remained 128 files, 1,048,576 bytes per file, 8,388,608 total bytes. No protected paths were found.

The Pages artifact contains all 27 registered public assets byte-exactly, including the 21 registered card portraits. The native desktop run decoded the full portrait roster and arena background, Briar PNG, and Briar SVG from prefixed paths. It imported the prefixed RL module (`actionCount=2305`), verified reset tick 0, step tick 1, restore tick 1, and subsequent step tick 2; it also imported the prefixed arena controller, verified its API and active session through tick 11. Desktop viewport was 1440×933 at DPR 1. All 66 observed requests were HTTP 200; there were zero page errors and zero console errors. Landing, game home, cards, and Battle screenshots are retained. Browser and server closed; observed Chrome PID 82252 and audit PID 82247 are absent from the final process check.

Phone viewport was 390×844. The v4 run physically loaded the landing, home, cards, and Battle views; decoded 21 portraits and the arena/Briar assets; exercised prefixed RL reset/step/restore/step and arena controller imports; and captured screenshots. Its actual harness exit was 1 because its final required-resource assertion expected the unbundled source CSS path `/game/src/ui/arena-shell.css`, while the real page fetched the emitted `/game/assets/ui-arena-shell-er5XVwGC.css` with HTTP 200. Treat this as partial physical/API evidence, not a passing overall phone harness. Fresh critic is expected to independently complete the phone audit.

## Focused gates

Pinned versions recorded in `environment-versions.json`: Node 22.22.3, npm 10.9.8, Playwright 1.58.2, native Chrome 155.0.8059.40. `npm ci` actual exit 0. The exact command, actual exit, PID, duration, TAP counts, and raw log paths for each gate are in `suite-run-receipts.json` and individual `.exit`, `.pid`, and `.tap` files.

Observed actual exit 0 and TAP counts: nondeterminism guard 10/10; shipping isolation guard 13/13; shipping isolation release 4/4; shipping isolation host 1/1; compact capability hostile 4/4; combat effect feed bound 6/6; sprite unit 10/10; visual asset manifest 6/6; visual arena art 6/6; release build 22/22; publication Pages 5/5. The original spell-runtime run on 033 is preserved as actual exit 1, TAP 1/15 pass and 14/15 failing at the same invalid test fixture. The corrected candidate spell test produced TAP 15/15, preserving all existing spell behavior assertions, but its shell wrapper attempted to assign an exit code to zsh's read-only `status`; npm's direct exit was not captured. `spell-corrected-run-receipt.json` states that limitation explicitly. Do not infer a direct npm exit 0 from its TAP summary; critic should capture it independently.

## Spell fixture diagnosis

The failing fixture's `roster[6]` is Briar Band, containing Briar Runner and Briar Darter. Its ten confidence-policy fields per entity reference 20 canonical question keys missing from the test helper's old union. The current production validator correctly rejected the malformed fixture: `roster[6].entities[0] source confidence field lacks a QUESTION record`. The preserved v2 constructor probe varies only this canonical QUESTION set: existing 12-question fixture rejects; same fixture with the 20 referenced keys (32 total) initializes at tick 0; the unmodified current canonical roster with all 33 canonical questions initializes at tick 0. The helper repair supplies the canonical records without changing policy values or weakening assertions. Existing negative cases already cover missing and divergent canonical confidence receipts, so no mirror-only tests were added.

## Preserved browser harness failures

All failed versions remain archived with source script, command, actual process exit, raw output, and JSON receipt; no source/CSS change, forced click, screenshot tolerance, paint wait, or terminal forcing was used.

- v1 actual exit 1: strict Playwright selector matched both `Enter the arena` and `Got it — battle` buttons.
- v2 actual exit 1: path normalization mapped the prefix directory request to an empty manifest key and falsely rejected it; the later v5 audit explicitly verified prefix-directory HTTP 200 and exact index body/hash equality.
- v3 actual exit 1: harness expected direct source `/game/src/ui/arena-shell-entry.js` to be fetched; Vite imports the arena controller through emitted JS chunks.
- v4 actual exit 1: harness expected direct source CSS; Vite emitted and served the hashed CSS asset described above.
- v5 desktop actual exit 0: completed all artifact, prefixed native browser, RL, controller, portrait, and resource request assertions. It was desktop-only.

The first source-probe harness failure, corrected constructor-probe output, test-run wrapper error, rewritten tracked-output captures, original artifacts, screenshots, JSON receipts, and command scripts are retained in this directory. Ten tracked generated outputs rewritten by tests were captured with post-test bytes, then restored from pinned Git HEAD; `tracked-output-archive-receipt.json` distinguishes pinned Git baseline hashes from direct pre-run captures. Evidence checksums are in `evidence-checksums.sha256` (the checksum manifest excludes itself).
