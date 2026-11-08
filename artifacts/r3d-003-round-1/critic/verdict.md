PIECE: R3D-003 — PASS
- Full AI matches through the real UI (deck built on Deck screen: squall-orb, ember-basin, duskwing-trio, cinder-host, gloamwing-cluster + 3 standard): 390x844 match ran to result (south wins 0-1, tick 10800); 1280x800 ff match to result (south wins 0-2). 0 console errors/warnings/page errors on Metal in every run (live/, life/, cold/, ab/).
- Deaths frame-stepped (deaths/strip-*.png): north coilblade upright to ~0.5 s then topples sideways, flat by 0.8-1.2 s; north duskwing drops to its ground ring; south mossguard topples sideways. Reads as a fall at 47 deg.
- Projectile (proj/zoom-seq0.png): south copperskiff dart travels to north mossguard and sparks on it. Spell (spell/strip-spell.png): team-tinted area ring on target tower, damage 3052->2845.
- Blind A/B 390x844, same scripted ticks 780/1320 (ab/): Y preferred before unblinding; Y = candidate.
- Gaps: briar-darter straw hats hide team colour from above when stacked (ab/cand-t1320-darters.png); bridge crowds stack units; DOM tower HP plates cover units behind; one south flyer drawn inside tower rubble (live/crop-tower-rubble.png); SwiftShader frames ~317 ms median.
- Perf (a) renderer-only, own wrappers around units/effects animate + renderer.render: 60 units 1.5/1.7 ms median/p95, 100 units 2.1/2.4 ms, live 20-40 units 0.8-1.3 ms median. (b) identical scripted crowded match, live 20 s x2 pairs: 3D frame median 82/76 ms p95 249/217 vs DOM 68/74 ms p95 201/233; tick rate 62-63/s both; main thread saturated by sim in both.
- Tests: 87 TAP ok, 0 not ok, 1 env-gated skip.

PIECE: R3D-006 — PASS
- Metal, fresh browser+context, CDP cache disabled, shader sources busted: 3D idle x3 long tasks after interactive none; with 6-8 early deploys x5 max 129-153 ms (DOM same scenario 130 ms). Tick at +6 s after interactive 362-364 vs DOM 366-367. From Battle click: 3D 318-322 vs DOM 341 (clock held ~265 ms longer: click->interactive 690-720 ms vs 425-437 ms).
- During warm-up the player sees ~0.4 s dark panel, then ~0.2 s legacy 2D arena with clock frozen at 3:00, then 3D (same flash exists on main).
- SwiftShader: 14.3 s to interactive, one 677 ms long task after interactive (main: 723 ms), new warning "KHR_parallel_shader_compile extension not supported".
