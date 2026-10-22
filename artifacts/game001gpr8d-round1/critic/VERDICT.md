PIECE: GAME-001GPR8D — current accepted runtime default full endurance
VERDICT: PASS
EVIDENCE:

Independent run used the pinned candidate at `fd6b2af97294be762af637a1d8a40c3af18452cf`, Node `/Users/me/.hermes/node/bin/node`, the RUN-PLAN Playwright/Chrome paths, `env -i`, `default-eight`, and no `GAME_BROWSER_ENDURANCE_TICKS` override. Only the external artifact directory changed to `critic/runtime/`.

Actual TAP output:

```text
ok 3 - game browser endurance: default-eight seed-zero workload uses the yielding driver
  duration_ms: 978080.840083
# tests 3
# pass 3
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 980297.810041
```

Direct process exit code: `0`. Telemetry reports `default-eight-full-18k`, the expected setup size/hash (`39641` bytes, `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`), and natural terminal at tick `18000`: South won `2–1` by `tiebreak_lowest_hp`. The final direct session transcript has `40` submitted commands; the run's paid-play assertion passed for both North and South.

The measured `600 → 300 → 600` restore/replay passed the browser continuation, direct-session bytes, input bridge, projected layers, policy state, and future-audio continuation assertions. Restore returned from tick `600` to `300`; its saved continuation snapshot was `54012` bytes. Actual sink starts stayed `55 → 55` across restore. The original and replayed typed simulation continuations each contain `29` cues; UI sequence stayed at `2` through restore and advanced to `4` after replay. Post-restore physical delivery passed.

Terminal audio was disposed with `0` active voices; the terminal overlay measured `520×428` and restart was visible. Restart returned exact shipped seed-zero session bytes at tick `0` (`restartCount: 1`, restart hidden, no terminal overlay). I inspected `terminal.png` and `restart.png`: the result panel and Play Again control were visible, and restart returned to the opening arena/deck state.

All `67` measured segments stayed within the `30000 ms` cap; the slowest was `10375 ms`. Measured browser duration was `977897 ms` (the endurance TAP subtest took `978080.840083 ms`), within the `1200000 ms` cap. Initialization long tasks were `93 ms` and `175 ms` (cap `300 ms`). The maximum one-tick slice was `27.9 ms`; restore step slices peaked at `7.8 ms`, preflight at `6.2 ms`, serialization at `0.2 ms`, and restore DOM commit at `0.1 ms` (each cap `40 ms`). Driven, restore, terminal-observation, restart, screenshot, final-drain, and out-of-segment long-task counts were all `0` (cap `50 ms`). The existing conditional quiescent slice audit was not invoked (`environmentAudits: []`), so there were no audit exemptions.

Console errors, unhandled errors, resource errors, and pending resources were all `0`; endurance server exited cleanly with empty stderr. `627/627` source pins passed before and after the run. The normal Git index hash was unchanged at `8e79bb09cef07999afb8d2c991c3f1a9b5562528a82d74eef865a39582def914`.

BIGGEST GAP: This qualifies only the pinned default-eight seed-zero browser endurance path; alternate scenarios and broad historical gameplay parity remain unqualified.

FILES:
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/command.txt`
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/stdout.raw`
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/stderr.raw`
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/exit-code.txt`
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/endurance-result.json`
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/active.png`, `terminal.png`, `restart.png`
- `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/critic/runtime/integrity.txt`
