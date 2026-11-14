# R3D-004 round 2 — critic verdict: PASS

Candidate d930e287 vs main 2dacacf6. Raw source tree served statically; Playwright Chromium (Metal GPU for screenshots/perf, SwiftShader cross-check).

## Played
Full AI battle at 390x844 (cand-390x844-full): 7 deploys, match ran to the result panel "DEFEAT / Rival wins / RIVAL 3 – 0 YOU" with Play again. Phone Home tab works mid-battle. 0 console errors or page errors under GPU at any viewport; SwiftShader runs log only WebGL driver warnings ("GPU stall due to ReadPixels", "KHR_parallel_shader_compile extension not supported").

## Round-1 gaps
- Crowns in a11y tree: fixed. Frame tree ends with `status: Rival 1 crown, You 0 crowns` → `status: Rival 3 crowns, You 0 crowns`; matches data-north/south at every 30 s sample; same live-region node persists the whole match (announcements can fire). Main exposes only "0 0".
- Phone nav during battle: fixed. 390/360/430 show a 44px strip (Leave + Home/Deck/Cards/Battle), all Tab-reachable and in view; Home click switches view. Hand bottom to strip top gap: 35px (390), 40 (360), 42 (430); Next/elixir row sits in between, no overlap, scrollHeight == viewport.

## Tests (selectors app-shell battle-hand-polish hud-card-painter ui-hud-state ui-match-feedback visual-motion-polish)
app-shell 2/2, battle-hand-polish 1/1, ui-hud-state 10/10, ui-match-feedback 7/7, visual-motion-polish 6/6.
hud-card-painter 1/2 in the combined run: "public app-frame states repeat across fresh scaled iframe contexts — 390x844 insufficient iframe screenshot repeats across four fresh contexts (2 !== 1)" while the critic's browser ran at the same time; rerun alone 2/2 (tests-hud-card-painter-rerun.log). Load flake of the TEST-001 class, not a HUD regression.

## Blind A/B
Committed coin (sha256 f1ddc2f8…), judgment written before unblind: X better at 390 and 1280. X = candidate. Caveat: the critic had seen both builds earlier, so blinding was partial.

## Frame time, 5 s live match, 390x844 DPR2
Metal GPU: candidate median 8.3 ms / p95 10.0 ms; main 8.3 / 10.0 (120 Hz cap). SwiftShader (software): cand 591/659, main 492/768, n≈10, both unusable and not comparable.

## Nits a player could notice
- The FINAL / phase tag still sits on the tip of the rival king roof at 390x844.
- Desktop "Leave  battle" shows a doubled gap (flex gap + leading space in the span).
- Phone Leave is 39px tall, under 44; Tab reaches it after the tabs although it is drawn left of them.
- Pre-existing, not HUD: rival takes the south-left tower in the first ~10 s every run on main and candidate.
