# Restore raster failure diagnosis

This is a read-only diagnosis of the browser-suite failure reported from isolated tested commit `6c99614` in `/Users/me/.codex/worktrees/post-provenance-full-suite/clash-royale-clone`. The full-suite log is `/tmp/clash-royale-post-release-isolation-full-suite.log`. No code was changed and no test or reproduction was run for this diagnosis.

## Failure evidence

The failure is at `tests/game-browser-building-choice.test.js:649`, in the assertion that compares the restored full-viewport screenshot with the checkpoint screenshot. The evidence is saved at `artifacts/game-001huib-round-2/building-choice-evidence.json` in the isolated repository.

- Viewport: 720 × 1280 (921,600 pixels).
- Checkpoint SHA-256: `f623b7ac6fabdddf08d4ba3366263d2d6cfdc1aaba8ed2128bd68814571d316a`.
- Restored SHA-256: `e6ea0d11bd710482892595509d07267464dcf1ab9fbe0353dc2955cd1fbffc86`.
- Pixel comparison: 79,379 changed pixels; maximum channel delta 19; mean channel delta 0.06181821469907407; 12 pixels have a delta greater than 8.
- Max-channel-delta histogram from the saved PNGs: 63,183 pixels at 1; 15,215 at 2; 969 at 3; 6 at 17; 6 at 19; all remaining pixels match.
- The checkpoint and immediate repeat checkpoint PNGs are byte-identical and both have the checkpoint hash above.
- The 66 × 66 Bulwark art crop changes at 838 pixels, with maximum channel delta 2, mean 0.09358738904193449, and zero pixels over 8.

The exact compared files are:

- `artifacts/game-001huib-round-2/bulwark-restore-checkpoint.png`
- `artifacts/game-001huib-round-2/bulwark-restore-checkpoint-repeat.png`
- `artifacts/game-001huib-round-2/bulwark-restore-rebuilt.png`
- `artifacts/game-001huib-round-2/bulwark-art-before-restore.png`
- `artifacts/game-001huib-round-2/bulwark-art-after-restore.png`

The same isolated repository contains a useful passing comparison in `artifacts/visual-003h-round-1/restore-evidence.json`: the Bulwark-targeting checkpoint has the same `f623…` SHA-256, and its restored screenshot is byte-identical. That case starts at tick 114, steps two ticks, then restores. The failing building-choice scenario starts at the corresponding checkpoint, advances 140 ticks, captures the forward state, then restores.

The failing evidence also reports exact browser and session bytes, combat/effects/feedback DOM, HUD/input/focus/markers, and no differences in its computed paint-state snapshot. The raster diff is dominated by one- to three-channel changes following the arena's repeated background texture, inset shadow, and frame edges. The 12 pixels over delta 8 fall at the antialiased edges of the three static tower health bars: `(180,811)`, `(209,811)`, `(510,811)`, `(539,811)`, `(345,946)`, `(374,946)`, with the same x positions repeated at y 814 and y 949. The saved image comparison therefore shows no broad scene displacement or material visual change.

## Unverified hypothesis and smallest experiment

The leading hypothesis is a Chrome raster/compositor invalidation difference after the longer forward-rendering branch, rather than divergent restored simulation or projection data. Restore cleans up and rebuilds the browser graph in `src/ui/game-browser-loop.js:332-348`; `mountGameUiProjection` stages and replaces the four projected layer subtrees in `src/ui/game-ui-projection.js:300-360`. The shell promotes each `.game-browser-layer` with `transform: translateZ(0)` in `src/ui/arena-shell.css:263-265`, over a textured, shadowed arena background in `src/ui/arena-shell.css:235-260`. This is a plausible raster-cache trigger, not a confirmed cause.

The smallest code experiment is to remove that forced layer promotion and run only the isolated 140-tick building-choice restore test, retaining the strict pixel equality assertion. Before treating it as a fix, capture two consecutive post-restore screenshots after the existing two-native-frame settle. If they match each other but not the checkpoint, the restored raster is stable and differs after the long paint history; if later native frames converge to the checkpoint, the issue is paint-settle timing. Neither experiment has been run, and the hypothesis remains unverified.
