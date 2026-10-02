# VIS-003HR round 2: elixir fill raster probe

## Result

A pre-target screenshot alone is sufficient to reproduce the original long-restore mismatch in the fresh-first minimal Bulwark witness. The `standard-opening`-only and `pre-match-choice`-only variants each reach the same strict failure at checkpoint tick 114, forward tick 254 (140 ticks), with exact browser/session/DOM/computed-paint state after restore. Chrome 154.0.8037.97 at 720×1280 reports checkpoint SHA-256 `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`, restored and restored-repeat SHA-256 `31d39f784166db05224f6a7890660ea420755e029559e75665c0393959ba8a29`, and exactly two changed pixels with maximum channel delta 1.

The pixel differences are on the elixir fill's antialiased top-left edge:

- `(118, 1251)`: checkpoint `(81, 73, 95)`, restore `(80, 73, 94)`.
- `(115, 1254)`: checkpoint `(80, 73, 93)`, restore `(79, 72, 92)`.

The owning paint is `.elixir-fill` inside `.elixir-rail` in `src/ui/arena-shell.css`. Its box is 343×16 at `(115,1251)`, with a 7px radius, gradient, and inset highlight. The rail has a 3px border and 11px outer radius. Input/session values are identical across the restore: tick and accumulator 114, elixir amount 7, fill width 343px, and progress clip `76.78571428571429%`.

## One-variable CSS probes

Each probe used a fresh temporary copy of `public/`, `src/`, and the exact standard-opening-only witness. The test's screenshot sequence, settle frames, tick 114 checkpoint, 140-tick forward branch, full-viewport byte-equality assertions, and art crop comparison were unchanged.

| Probe | Strict result | Interpretation |
| --- | --- | --- |
| `.elixir-fill { isolation: isolate }` | Red; same two pixels and hashes | Fill-only stacking isolation is insufficient. |
| `.elixir-rail { isolation: isolate }` | Red; same two pixels and hashes | Rail-level stacking isolation is insufficient. |
| `.elixir-fill { transform: translateZ(0) }` | Green; checkpoint, restored, and repeat PNGs are all byte-identical | Promoting only the fill to its own raster surface removes the edge mismatch without changing its box, radius, gradient, or shadow. |

The passing minimal image SHA-256 is `a978920b64a4ca666a30d0bb7bb6d6ebf4840d2bc740f2055dd2b7d3d0dc7f56`; the full viewport has zero changed pixels between checkpoint, restore, and restore-repeat. Browser/session bytes, arena/projected/HUD/input DOM, computed paint state, elixir raster inputs, and the 66×66 art crop are exact.

## Original-path verification

The original `HEAD:tests/game-browser-building-choice.test.js` was run from an immutable temporary project with only the same `.elixir-fill` transform added to the copied CSS. Test source SHA-256 was `10ef953d33d4ac4e4af49aeb5a29b8271badf4c77a2847321c0348d26430e485`. It passed the original 140-tick restore assertion and the complete continuation, terminal, and restart path. The target was acquired at tick 114 after 113 target-loop steps; the continuation reached tick 254. Checkpoint, checkpoint-repeat, restored, and restored-repeat images all have SHA-256 `a978920b64a4ca666a30d0bb7bb6d6ebf4840d2bc740f2055dd2b7d3d0dc7f56`; viewport and art crop deltas are both zero. Console and page errors were empty.

With the production CSS change, the tracked short restore test and tracked full building-choice test also passed. The source CSS SHA-256 is pinned by `tests/ui-arena-shell.test.js` and `tests/visual-arena-art.test.js` as `4cbc0f14cc874845e02c64bb779cc2b85b3549a1851c0371af436de23249ea44`.

The source snapshots for the two minimal red controls are in `probe-sources/`. Full evidence JSON and representative PNGs are next to this report under `standard-opening-only/`, `pre-match-choice-only/`, `fill-isolation/`, `rail-isolation/`, `fill-promote/`, and `full-original-fill-promote/`.
