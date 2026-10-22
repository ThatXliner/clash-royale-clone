# Endurance evidence audit — 2026-10-22

## Current source and gate

Authoritative repository HEAD: `fd6b2af97294be762af637a1d8a40c3af18452cf`. The pinned source assembly is `/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1` (receipt identifies exact HEAD and 627 files). Builder owns the exclusive full Node/Chrome run against this pin. This audit did not run or inspect that runtime. An exact-HEAD full 18,000-tick result is still required; older claims do not substitute for it.

## Located durable evidence

The latest independently located matching-main `GAME-001GPR7A` acceptance is for source commit `763e39465fd584ffa4618ea220fbdb3a99fec40c`, at `/Users/me/.codex/clash-qualification/20261020-engine-current-art-qualification/attempt-reviewed57baa0-r2/runner/artifacts/final-accepted-endurance/763e39465fd584ffa4618ea220fbdb3a99fec40c/critic/`. Its `VERDICT.md`, raw TAP, JSON result, command, and source fences are present. The verdict reports all four gates passing (22/22 total assertions): default eight-card 18,000-tick run, separate Kilnkeeper run, audio adapter, and production audio. The default run records 67 segments, natural South 2–1, exact 600→300→600 restore, audio/input continuation, and restart at tick 0. It is scoped to those two deck journeys, not broad card parity. Its pinned source is `/tmp/clash-royale-critic-763e3946`; the recorded command is in `critic/default-eight/command.txt`.

The tracker is inconsistent: some `GAME-001GP` / `GAME-001GPVT` rows still point at older `1464219…` evidence, while the newer `GAME-001GPR7A` row points at the 763 run. Do not present the old pointers as the latest acceptance.

Root separately reports a BAR full-default anchor at source/commit `5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146`: 18,000 ticks, 40 commands, natural result, and 600→300→600 restore. Its artifact path and raw outputs were not independently resolved in this bounded audit, so treat this as a reported anchor pending root's reference, not as evidence located here.

## Historical failure and remaining scope

The 16,200-tick / 55 ms and 51 ms long-task failure belongs to historical Round320 at `5296f1a`; Round321 at `0269fed` is reported as its full-18,000-tick successor. That supersession does not establish exact-HEAD (`fd6b…`) performance, so the builder's current pinned run remains the decisive default gate.

The expanded Brack scenario is a separate unresolved gate. CARDS-022Q source `ac224…` passed its default eight-card 18,000-tick run but failed the expanded paid-South 900-tick guard at tick 7,200. Round507's `QH` correction has only a bounded 8,100-tick smoke reported; a matching full combined retry remains unproven. The factory R5 candidate `e35…` is unadopted and its pass cannot qualify current main. Run the expanded Brack full scenario against the exact adopted source only after the current default gate, and keep factory evidence separately labeled unless that candidate is adopted.

## Historical failure successor source verified

`git log --ancestry-path 5296f1a..0269fed` has only tracking a57705a9 and production fix0269fedb8e6d059bfb78b7cd7be4e862039e44c2 (Reuse immutable combat records and their canonical presentation bytes). Its two product changes freeze normalized records on admission/share records in immutable snapshots, and cache each immutable combat-effect record canonical byte string in a WeakMap. This removes repeated deep record cloning and canonical event serialization without changing replay bytes; accompanying protocol/UI tests were added. Current fd6 frozen source still contains state.records.push(freeze(checked)), Object.freeze([...state.records]), and CANONICAL_EVENT_BYTES cache. This is a verified successor source change and historical successful round linkage, not a fresh profile attributing each old55/51ms task stack. Current-main new full run3/3 builder PASS and independent full critic in progress provide the matching-source regression evidence. No new speculative production fix is required for a failure already superseded.
