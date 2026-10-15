# CARDS022I R2 source-matched gate packet

The source candidate was assembled on accepted base `52718dd61252ee2b41cdaf73d9b9be3b18f5f80d` and frozen before browser gates at `66a969468745d09af7ebce64e162b6019c42b858`. A test-only correction removed a click on the phone-only desktop Back control; the final source commit is `31421c94a01b28eea01324103ad9dbf694a780e7`. No production file changed after that source commit.

## Focused UI results

`app-shell-attempt03` passed under Node 22.22.3, Playwright 1.58.2, and native Chrome 155.0.8059.40. Brackenwheel’s seven visible stat fields—Count, Health, Damage, Hit speed, Range, Targets, and Moves—carry `QUESTION` only when the corresponding canonical receipt is non-authoritative, unverified, and has question disposition. The visible 4-elixir cost remains unmarked. The labels and values fit at 720×1280, 390×844, and 1440×933. The same run passed the Aether Well resource details on phone and desktop; its six field-specific statuses remain intact, with no attack fields, `NaN`, or `undefined`.

`cards022-browser-attempt01` passed all four phone/desktop and normal/reduced-motion modes. The witness used the trusted deck editor and player pointer with the natural AI. It reached contact at tick 234 with one AI deployment; Brackenwheel dealt 267 to primary target 2 and 267 each to eligible secondary targets 4, 5, and 6, with the secondary policy tag preserved. The paused presentation selected explicit 13-pixel phone art and 26-pixel desktop art. Each before/after PNG hash matched, as did serialized session, input bridge, selected card, audio continuation, snapshot, and projected state. The same custom eight-card seed-2 match reached natural terminal at tick 3987 and restarted once at tick 0 with the same deck and seed.

## Matching-source suite

All direct exits were zero: UI combat state 16 passed with one optional skip; nondeterminism guard 10/10; shipping-isolation guard 13/13; release-build 22/22; shipping-isolation release 4/4; shipping-isolation host 1/1; and visual asset manifest 6/6. The serialized orchestration stopped on any nonzero result.

The first app-shell attempt is retained as a setup failure: the clean worktree did not yet have locked dependencies installed (`vite` was missing). After `npm ci` installed the lockfile dependencies without changing either lock hash, attempt 02 reached the desktop disclosure screenshot and exposed a test-only click on a control hidden by the desktop layout. That attempt and its screenshot are preserved. Attempt 03 passed after the invalid click was removed; no disclosure assertion or product layout changed.

The final source fence verifies that only the ten owned I source/test paths differ from accepted base, ART’s five accepted paths and the D503 resource-renderer function remain byte-identical, the package files and assets/simulation/content/RL/kernel paths are unchanged, and all evidence is tied to source commit `31421c9`.

The shipping tests rewrote five tracked report files in their normal test paths. Exact post-test copies and their checksums are preserved under `generated-reports-post-gate/`; only those five generated reports were restored after capture.

Raw stdout, stderr, direct exits, process IDs, browser evidence, and screenshots are stored beside this summary. Independent critique is pending; this packet records builder evidence only.
