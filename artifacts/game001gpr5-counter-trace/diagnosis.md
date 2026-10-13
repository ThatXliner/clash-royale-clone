# GAME001GPR5 counter trace

This is one deterministic replay of the saved overtime latest-feasible-counter policy, with observations added only to the copied artifact script. No simulation or source files changed. The command ran as PID `59098` in attached exec session `72537`:

```sh
node artifacts/game001gpr5-counter-trace/counter-trace.mjs > artifacts/game001gpr5-counter-trace/counter-trace.stdout.json 2>&1
```

The setup SHA-256 is `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`. It matches the saved candidate replay's setup hash. Both runs submit the Reedsting emergency command at tick `13200` to `(14500,14750)` and end at tick `13449` with the same 2–1 north win at sudden-death tick `13448`; the 18,000-tick requirement is not reached.

The policy selected north Reedsting unit `159` at `(14500,16700)` as the lethal threat. The deployed south Reedsting was unit `160`, spawned at tick `13200` at `(14500,14500)`. At the next observation, unit `160` had acquired unit `146` (north Mossguard) as its target, while unit `159` still targeted `south:lane:east` (numeric target ID `9007199254740988`). Mossguard `146` was at `(14101,14500)`, about 399 millitiles from unit `160`; the selected threat was 2,200 millitiles away.

| Tick | South counter 160 | North threat 159 | East lane tower |
| --- | --- | --- | --- |
| 13200 | Reedsting command admitted; spawned at `(14500,14500)` | `(14500,16700)`, targeting east lane | 289 HP |
| 13260 | Alive, 260 HP, targeting north unit 146, attack sequence 0 | `(14500,16700)` | 289 HP |
| 13320 | Alive, 17 HP, targeting 146, attack sequence 1 | `(14500,16700)` | 289 HP |
| 13380 | Dead, 0 HP, attack sequence 2 | `(14500,14834)`, targeting east lane | 158 HP |
| 13440 | Dead | `(12834,14500)`, targeting east lane, attack sequence 3 | 27 HP |
| 13449 | Dead | `(12534,14500)`, still alive and targeting east lane | 0 HP; match ended at 13448 |

The captured attack/projectile records for unit `159` show launches at ticks `13353`, `13395`, and `13437`, each against the east lane tower. Projectiles `232`, `233`, and `234` contacted at ticks `13366`, `13405`, and `13448`, dealing 131 damage each. This confirms unit `159` continued along its route and was not blocked.

The trace establishes wrong target selection followed by the counter's death: unit `160` targets Mossguard `146`, reaches attack sequence 2, and is dead by tick `13380`; no sampled state shows it switching to Reedsting `159`. Exact event ticks for unit `160` were not retained because the trace's event filter followed unit `159` and actors that targeted `159`. The sampled authoritative states still show unit `160`'s target, health, attack sequence, and death interval. The raw output is preserved so a corrected event filter can capture those exact event records if needed.

The next policy iteration should account for the runtime's acquired target at the chosen deployment point. At this point, Reedsting `160` engages nearby Mossguard `146` before the forecast attacker, so the estimator's assumption that the counter focuses unit `159` is false. A candidate should be rejected or changed when actual target acquisition does not cover the selected lethal threat.
