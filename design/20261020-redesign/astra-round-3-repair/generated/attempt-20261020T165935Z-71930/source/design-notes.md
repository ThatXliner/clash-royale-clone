# ART-3D-001, round three: macro-form comparison

**UNRENDERED. Source preparation only. No syntax, model, render, test, or visual
PASS is claimed.** The factory owns the heavy runtime until the parent explicitly
grants a bounded Blender window.

## Premise tested by the two failed rounds

The failed premise was: **a cream envelope centered above a small kettle hull
will retain an airship/boat identity at 13 px if its physical suspension gap is
made clearer.**

The R1 independent images showed one cream oval. R2 increased the real
suspension gap, reached 1,812 triangles, and passed the saved-camera/anchor
checks. Its independent native and terrain sheets still showed a cream cap on
a copper stem. Its north/south idle silhouettes had 0.976 IoU, both team colors
were weak, and the sampled contact was not a reliable impact cue.

I read the independent verdict and viewed
`native-64-sheet-4x.png` and `tile-context-labeled-4x.png` in
`/Users/me/.codex/clash-qualification/20261020-model-r2-critic/run-20261020T155005Z/`.
This observation rejects the shared premise. R3 changes the relative masses,
not another small detail or another increase in vertical suspension.

## Three alternatives and provisional selection

All three remain original copper kettle boats supported by cream canvas, with a
kettle lid, prow spout, stern pusher, and leaf pennant. They keep the woodland
river-workshop identity, accepted name, lore, role, statistics, mechanics, and
audio. No reference assets are imported. No new gameplay quantities are defined.

| Alternative | Macro change | Expected native read | Risk |
| --- | --- | --- | --- |
| `umbrella_barge` | Broad lateral canvas lens close to a wide, shallow hull | Wide canopy above a boat; 12–15 px width | Canopy may cover the deck in east/west |
| **`exposed_deck` — provisional selection** | Smaller canvas awning over a broad, low copper hull, with exposed TEAM coaming and foredeck | Copper boat with a cream roof; no narrow stem | Canopy mass differs from the original long envelope |
| `split_canvas` | Two joined canvas lobes leave a central deck channel | Pale canopy around a colored boat center | May drift toward a winged craft; identity needs critique |

The exposed-deck form is selected for detailed team/contact comparison because
it spends the most visible area on the existing kettle boat and its team zone.
This is a design hypothesis, not a winner established by renders. All three
parameter sets and their geometry are implemented.

## Explicit 13 px budgets

These are targets to inspect after rendering, not measured achievements.
Nominal height is 13 px; the source budget allows a one-pixel antialiasing margin.
No renderer will resize a candidate to force these targets.

| Cue | Exposed-deck target | How the source allocates it |
| --- | --- | --- |
| Overall class | 12–14 px high, 12–15 px wide | Low wide hull; canopy smaller than the hull |
| Canvas | 3–4 rows of pixels | Shallow pale lens |
| Copper boat | 4–5 rows of pixels | Faceted rounded belly, pointed bow, wide stern |
| Team | ≥22 visible native pixels; at least one contiguous 4×2 patch | Top-facing coaming and foredeck, plus side walls and stern boards |
| Separation | Distinct pale and copper masses with a dark break | Open deck and visible supports; no thin copper stem |
| Facing | ≥2 px prow projection versus ≥4 px broad forked stern | Single upturned kettle spout versus two stern boards |
| Contact | ≥2 px extra extent and a bright 2×2 cluster outside the idle body | Enlarged spout puff, lid opening, recoil pitch |

The umbrella target is ≥18 team pixels and a contiguous 3×2 patch. The split
canvas target is ≥22 team pixels, a 3×2 patch, and a 2 px center opening.
All exact budgets and dimensions are in [alternatives.json](alternatives.json).

The north/south silhouette comparison should improve materially on R2's 0.976
IoU. A proposed source-review screen is ≤0.85, paired with a viewer who can
identify the prow: numeric difference alone is not recognition. Similarly,
changed contact pixels alone do not establish an impact cue.

## TEAM under the actual lights

The palette is byte-identical to R2. `TEAM` retains river `#2E7F86` and ember
`#C6452E`, nonmetallic roughness 0.8. The saved warm key, fill, rim, exposure, and
AgX setup stay unchanged. The revision enlarges top-facing visible surfaces,
rather than compensating with a new hue or emission.

The painted TEAM coaming has a horizontal surface 0.20 BU wide around the
deck. The pointed foredeck is also TEAM. Raised stern boards and upper side
walls carry that same material. These surfaces are oriented to give the 50°
cameras a visible area in all cardinal directions; the later images must show
whether occlusion and lighting still defeat the intended read.

## Fixed comparison contract

- All alternatives use the proven **50° orthographic camera, scale 8.025**.
- Ground anchor remains **(32,54)** in a 64² native cell, or (128,216) at 4×.
- The camera target height is derived from that fixed anchor and projection,
  not from candidate bounds.
- There is **no** fit-to-bounds step, alpha crop, per-direction scale, mirrored
  east/west, or per-variant resizing.
- Idle frame 1 and contact frame 100 retain the existing presentation sampling
  contract. All twelve staged source poses get projected crop/anchor checks.
- Both teams render in the same studio. R2's existing native images are read
  unchanged as the control, with hashes recorded.
- Coilblade and Mossguard are not rebuilt or edited in this comparison. Their
  prior files, geometry, and open qualification status remain untouched.

The comparison retains original procedural editable meshes and named material
slots. It adds no texture maps, copied models, or unseeded randomness.
Triangle counts will be measured after execution. Broad shapes take priority
over adding geometry to reach an arbitrary lower count.

## Bounded later command

Only after the parent grants the shared runtime:

```sh
bash design/20261020-redesign/astra-round-3/run-comparison.sh
```

The prepared run uses fresh isolated `--background --factory-startup
--disable-autoexec` Blender processes. It records exact sources, hashes,
versions, argv, non-secret environment, PIDs, raw output, and direct exits.
It never connects to or resets the user's live Blender.

The bounded comparison is **32 native source renders plus one 256² quarter
view**: three alternatives × four directions × two teams at idle (24), then
four directions × two teams at contact for `exposed_deck` (8). The source
PNGs are reduced 4:1 with the same alpha-weighted box method as R2.

Expected outputs:

- Per-alternative editable `.blend`, GLB, geometry/ownership receipts, native
  PNGs, and projected pose/camera measurements.
- A native massing sheet with R2 control, all three alternatives, and black
  silhouettes; a separate paired-team sheet; a selected team/contact sheet.
- Nearest-neighbor 4× sheets for inspection, without changing native pixels.
- A separate read-only reopen of the selected `.blend`, measuring its saved
  camera angle and anchor with the previously successful inspector.

A successful process is not a visual verdict. The parent assigns independent
critique after actual native-size inspection. No full atlas, hero batch, whole
cast revision, final team rings, live-game adoption, or motion-film production
is included before this gate is resolved.
