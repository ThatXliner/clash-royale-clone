# CARDS-016K core critic receipt

- Frozen source: `e3413fdc529a366a56e2d0b35afb7fa7b14dcd6f`.
- Test checkout: clean `git archive` extracted to `/tmp/cards016k-core-critic.qVCQJH`; `node_modules` is a symlink to the shared installed dependencies. No source edits were made.
- Focused test process: session 88665 completed; spawned shell PID 8385 and Node PID 8395 exited. TAP result is 80 tests, 80 pass, 0 fail, 0 skipped; duration 84,990.3 ms. Raw output is in `focused-tests.log`. There is no live test handle.
- Guard verification already completed on the same frozen archive: `npm test -- nondeterminism-guard shipping-isolation-guard`, exit 0; nondeterminism 10/10, shipping isolation 13/13. This kept the existing 524,288-byte canonicalization bound. Kernel diff against `6dcf64b81751f69f9fe7520878ac136bda9143ed` is empty and the baseline/reviewed kernel SHA-256 is identical.
- Baseline comparison: default eight-card GameSession snapshots at seeds 0/23 and ticks 0/120/900 match baseline byte-for-byte and by SHA-256; see `default8-comparison.json` and its two input files.
- Runtime source probes: `session-probes.mjs` and its frozen output `session-probes.json`. It reads `reference/stats/cards.json` only as a test-side comparison. Probe includes exact field conversions and unverified flags, per-card runtime question keys, player/opponent deployments, target trades, malformed policy rejection, live projectile/death restore, editable/RL boundary, and manifest/profile inventory counts.
- Editable count, independently enumerated: 15 troop IDs plus the one spell `squall-orb` = 16 mixed editable IDs; 8 default playable IDs. This preserves the earlier immutable baseline.
- The probe tested real public `GameSession` setup and commands, not a private fixture. No 109-card full-roster execution claim is made.
- Full 18,000-tick endurance was not rerun for this changed runtime. The prior 146-run is not evidence for the new runtime hash; parent owns current endurance after integration.

Verdict is `FAIL` for the one source-confidence gap detailed in `confidence-gap.md`. All measured values matching the datamine remain estimates where the source row marks them `unverified_fields`; the receipt does not certify historical parity.
