# GAME-001GPR5 endurance workload scope review

**Verdict: FAIL for GAME-001GPR5; the terminal-aware regression passes its
separate bar.** The seed-zero terminal check does not conflate natural-match
correctness with performance: it accepts stopping input after the real match
ends and still rejects the 18,000-active-tick workload. The strict endurance
result is therefore a workload-duration failure, not evidence of a performance
regression.

## Commands and observed output

Command run in this worktree:

```sh
node --test tests/endurance-workload.test.js
```

Actual output:

```text
TAP version 13
# Subtest: the replay-derived natural terminal stops planning and keeps the 18,000-tick gate red
ok 1 - the replay-derived natural terminal stops planning and keeps the 18,000-tick gate red
  ---
  duration_ms: 1.148
  type: 'test'
  ...
1..1
# tests 1
# suites 0
# pass 1
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 68.223541
```

The prior actual browser command recorded for the frozen 6c7 candidate was
`env -u GAME_BROWSER_ENDURANCE_TICKS npm run test:game-browser-endurance`.
Its TAP output is 1/2: the 300-tick setup test passes, then the full Chrome
workload exits 1 at session tick 13,352 after 572,618 ms. It reaches 46
segments and fails the next input delivery assertion (`24 !== 25`). The fresh
run record has no terminal/restart capture; the stored terminal and restart
images predate that run. Partial telemetry shows initialization 195 ms under
the 300 ms cap, driven and restore long-task maxima 0 ms under the 50 ms cap,
and no observed console, unhandled, or resource errors. Since the match stops
before 18,000, this is not a complete lifecycle or performance-cap pass.

## Receipt, source, and workload comparison

The deterministic transcript copied from that browser failure has SHA-256
`bd06ef21ccd243f48667a1ffdcb5d522613fcf03f3f3b311852dc9c8e4e90594`. Its
derived manifest records first terminal tick **13,352**, with North winning
2–1 by overtime sudden death at tick 13,351. The focused test pins this exact
transcript and result, verifies terminal planning returns `null`, and verifies
the 18,000-tick continuation assertion throws. The last accepted browser input
before that terminal was the planned Cinderlings command at tick 13,200,
`(14500, 5500)`, slot 0. The `24 !== 25` assertion is the attempted delivery
after the match had ended.

The accepted `CARDS-017T` receipt establishes the 100 ms inter-member interval
(six simulation ticks) for the corrected squads. That source-backed behavior
is in the 6c7 runtime and must remain in the test target. The earlier accepted
GPR4 run is a different runtime: its exact 796 commit passed 18,000 ticks and
restart in 61 segments, with initialization 197 ms, zero measured non-init
long tasks, a 600→300 restore, and 42 accepted input commands. It is useful
historical evidence only; it cannot supply the missing current 6c7 pass.

The source-hash timeline confirms why those runs are distinct. Between 796 and
6c7, the SHA-256 changed for `src/content/playable-roster.js`
(`08d49673…` → `61107646…`),
`src/shared/session-troop-source-confidence-authority.js`
(`e784d9ae…` → `87e316ae…`), and
`src/sim/battle-continuation-kernel.js` (`6739f55a…` → `eab70aad…`). The
captured 6c7 source manifest and terminal-regression receipt agree on those
current runtime hashes; the simulation session, live-battle, audio runtime,
browser loop, entry, input controller, and UI projection hashes are unchanged
between 796 and 6c7. The terminal-aware change adds only the workload helper
and its focused/browser regression checks after that frozen run; there is no
fresh full-browser run after the harness correction.

Bounded seed-zero outcome data from the no-emergency target-aware trial uses
the same setup hash, `306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`.
It independently ends North 2–1 at tick 13,352 with 110 North and 52 South
units created, 90 tower contacts, 47 North / 24 South deployments, and 24
accepted South commands. At tick 13,200 the South east tower has 289 HP and a
152-tick lethal deadline. This offline trial is not the browser run and is not
a full-duration candidate.

Keep candidate outcomes separate: the late Reedsting counter trace is a
changed policy that ends at 13,449, and the screen-defense mirror trial is a
changed policy that ends at 13,583. Neither changes the 13,352 baseline
terminal, reaches 18,000, or proves equal/heavier browser load.

## Design fit and next action

The current row pins seed 0, the default eight-card deck, and one continuous
18,000-tick active match. A different seed would change that scope. A different
legal South command policy can preserve seed, deck, normal engine/AI, resource
costs, cycling, placements, and the single-match requirement, but it must be
declared before its full-run result is known. Keep the 13,352 terminal as a
separate regression. Do not count a terminal-aware harness pass or the old 796
run as the current full-duration pass.

**One next action:** calibrate the seed-zero command policy from an earlier
active checkpoint, before the tick-13,200 lane is already unsalvageable. The
late-counter trace shows the Reedsting spawned at `(14500, 14500)` acquires
Mossguard 146 at 399 millitiles rather than Reedsting 159 at 2,200; it dies by
tick 13,380 while the separate counter-trace attacker 159 continues to hit its
tower. A predeclared deterministic policy must account for that actual target
competition, then reach 18,000 active ticks with full normal browser lifecycle
and caps. Record a common load vector against the old accepted run before
claiming any alternate workload is equal or heavier. Only run full Chrome
after a bounded replay shows a legal, nonterminal path through 18,000; retain
the no-performance-cherry-pick candidate set and its failed outcomes.
