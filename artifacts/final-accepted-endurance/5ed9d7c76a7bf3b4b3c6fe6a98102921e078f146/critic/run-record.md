# GAME-001GPR7A accepted-source qualification

## Frozen source and runtime

- Commit: `5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146`
- Tree: `d2f039c4fddae413f44b4ffca400538456f08977`
- Commit subject: `Accept Buried Coil presentation after independent round475`
- Checkout: `/private/tmp/gpr7a-final-accepted-critic-5ed9d7c`, detached and clean.
- `package-lock.json` SHA-256: `d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4`
- Browser endurance test SHA-256: `6ca92ac55924f83c7c096ccfc33b5d9513d1e8ce09f8093934e683f67b1dc92e`
- Workload helper SHA-256: `ba3da312e57ea0acb029d2ba0c7db05110d3ee180dab1f195986f307aa7f4ee2`
- Endurance runner/server/fixture SHA-256: `c16db12c89e914e375806c1cad8f62c63c594c46d6246a251a8e53b74aaf40c2`, `0ba074d028f4b2808f00d59e701a08288c0e050d715ad40cf2ec37da62f9d485`, `df0b27baa4a423ee4bc989419a266364c74043a9ad645fe129f44cda65f7d94a`.
- `src/sim/battle-continuation-kernel.js` SHA-256: `7e21668d9348670cf4ebb9d4fb917be146b75b97acaf974b253ab57d6a5361c2`; keep the pinned 524,103 / 524,288 kernel-cap invariant unchanged.
- Node: `v22.22.3`; npm: `10.9.8`; Playwright: `1.58.2`; native Chrome: `Google Chrome 155.0.8059.40` at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
- `npm ci` exit: `0` (`added 19 packages, audited 20 packages, found 0 vulnerabilities`).

The accepted source was checked against its own `AGENTS.md`,
`.agents/skills/gauntlet-round/SKILL.md`, `reference/stats/SOURCES.md`, and
the exact `PLAN.md` GAME-001GPR7A row. Historical fields flagged
low-confidence remain questions. Passing this journey cannot be described as
full 109-card historical parity.

## Commands and invariants

Each gate uses the exact detached commit, an independent pre/post SHA-256
manifest over every tracked file under `src`, `public/assets`, and `tests`,
plus `package.json` and `package-lock.json`; per-gate tracked diffs and
untracked source-file checks are also saved. Browser gates run sequentially.

The endurance commands set `GAME_BROWSER_PLAYWRIGHT` to this worktree's
Playwright 1.58.2 module and `GAME_BROWSER_CHROME` to native Chrome 155. They
set `GAME_BROWSER_ENDURANCE_SCENARIO` and a unique artifact directory, and
leave `GAME_BROWSER_ENDURANCE_TICKS` unset. The required caps remain 50 ms
non-initial long tasks, 300 ms initialization, 40 ms synchronous one-tick
slice, 30 seconds per segment, and 1,200 seconds total.

TAP, exit status, `endurance-result.json`, screenshots, terminal and restore
evidence, and per-gate source fences are saved beside this record.

The default full journey is launched as:

```sh
env -u GAME_BROWSER_ENDURANCE_TICKS \
  GAME_BROWSER_PLAYWRIGHT=/private/tmp/gpr7a-final-accepted-critic-5ed9d7c/node_modules/playwright/index.mjs \
  GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  GAME_BROWSER_ENDURANCE_SCENARIO=default-eight \
  GAME_BROWSER_ENDURANCE_ARTIFACTS=/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/final-accepted-endurance/5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146/critic/default-eight/browser/ \
  npm run test:game-browser-endurance
```

The separate full Kilnkeeper natural-terminal/restart journey is launched as:

```sh
env -u GAME_BROWSER_ENDURANCE_TICKS \
  GAME_BROWSER_PLAYWRIGHT=/private/tmp/gpr7a-final-accepted-critic-5ed9d7c/node_modules/playwright/index.mjs \
  GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  GAME_BROWSER_ENDURANCE_SCENARIO=kilnkeeper \
  GAME_BROWSER_ENDURANCE_ARTIFACTS=/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/final-accepted-endurance/5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146/critic/kilnkeeper/browser/ \
  npm run test:game-browser-endurance
```

The remaining audio commands use the same pinned Playwright module and
native Chrome executable:

```sh
cd /private/tmp/gpr7a-final-accepted-critic-5ed9d7c
GAME_BROWSER_PLAYWRIGHT=/private/tmp/gpr7a-final-accepted-critic-5ed9d7c/node_modules/playwright/index.mjs \
  GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  npm run test:game-browser-audio

cd /private/tmp/gpr7a-final-accepted-critic-5ed9d7c/audio-assets-run-5ed9d7c
GAME_BROWSER_PLAYWRIGHT=/private/tmp/gpr7a-final-accepted-critic-5ed9d7c/node_modules/playwright/index.mjs \
  GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  npm run test:audio-production-assets
```

The audio-assets test writes to a fixed path relative to its test file. Its
first run from the isolated output root is kept under
`audio-production-assets/attempt-1-setup-failure/`; the second run used the
same unmodified 535-file source copy after its unique artifact directory was
created. That copy was SHA-checked against the frozen worktree before and
after the gate. The original private checkout's pre-existing audio artifacts
were not overwritten.

## Gate results

- Default-eight full 18,000 tick browser journey: **PASS**, TAP 3/3, exit 0,
  test duration 977,482.6 ms (workload 975,112 ms). It ended naturally at tick
  18,000 with South winning 2–1 by `tiebreak_lowest_hp`. Initialization long
  tasks peaked at 162 ms (below the unchanged 300 ms cap); there were no
  non-initial long tasks. Maximum one-tick simulation slice was 30.7 ms and
  maximum segment duration was 10,333 ms. Exact result summary:
  `default-eight/result-summary.json`.
- Default source fence: **PASS**; exact commit unchanged, all 535 tracked files
  under `src`, `public/assets`, `tests`, plus package manifests, hash-identical;
  clean index/worktree and no untracked source files.
- Separate full Kilnkeeper natural-terminal/same-deck-restart browser journey:
  **PASS**, TAP 3/3, exit 0, total TAP duration 450,589.9 ms (workload
  448,369.7 ms). The selected seed-zero eight-card deck reached a natural
  `regulation_crowns` terminal at tick 10,800; North won 2–1. The exact same
  seed-zero custom deck restarted at tick 0. Kilnkeeper's south-side delivery
  at tick 0 spent 5 elixir, the north copy launched at tick 60, and its three
  projectile contacts at ticks 243, 327, and 411 matched after the 600→300→600
  restore replay. Max one-tick slice was 23.3 ms; max segment was 10,284 ms;
  initialization max was 162 ms, with zero non-initial long tasks. Exact
  summary: `kilnkeeper/result-summary.json`.
- Kilnkeeper source fence: **PASS**; exact commit unchanged, all 535 tracked
  source/test/package files hash-identical, clean source/index and no
  untracked source files.
- `test:game-browser-audio`: **PASS**, TAP 11/11, exit 0, 588.9 ms. This suite
  checks the audio adapter's unlock, source scheduling, mute/gain, disposal,
  replacement, and rejection behavior using its controlled Web Audio test
  contexts; it is not the native-Chrome PCM evidence.
- Audio-browser source fence: **PASS**, exact commit and all 535 scoped files
  unchanged.
- `test:audio-production-assets`: first isolated attempt is preserved at
  `audio-production-assets/attempt-1-setup-failure/`: TAP 4/5, exit 1 because
  the new isolated output root lacked the fixed artifact directory expected
  by `writeOfflineRender` (`ENOENT`). The unchanged test was run again once
  after creating that per-run output directory. Attempt 2: **PASS**, TAP 5/5,
  exit 0, 6,024.8 ms; native Chrome 155 captured 45 positive-PCM buffers at
  12 kHz across nine cue families, verified unmuted/muted output observations,
  unlock-after-restart, movement PCM, 17 pinned waveform recipes, mix policy,
  and deterministic offline WAV provenance. Exact capture and WAV are under
  `audio-production-assets/generated/`; compact metrics are in
  `audio-production-assets/result-summary.json`.
- Audio-production source fence: **PASS**; the isolated runner's 535-file
  source/test/package copy matched the frozen 5ed manifest before and after,
  and the original detached checkout remained clean with no scoped
  modifications or untracked files.

## Scoped verdict

**ACCEPTED for this qualification scope.** The requested full default-eight
18,000-tick browser journey, separate full custom-eight Kilnkeeper natural
terminal and same-deck restart, and both audio gates passed on frozen source
`5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146`. Four final suites passed 22/22
TAP subtests. The initial audio-asset setup failure remains preserved and is
not counted as a passing attempt. All per-gate source fences pass. This does
not establish full 109-card parity or resolve the low-confidence source-table
questions and reference-footage visual comparisons; those remain outside the
scope of these endurance/audio gates.
