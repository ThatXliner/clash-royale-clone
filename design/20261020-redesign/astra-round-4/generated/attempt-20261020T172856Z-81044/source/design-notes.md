# Copperskiff R4: macro heading comparison

**UNRENDERED. This package is source preparation only.** No syntax execution,
Blender run, generated asset, or visual PASS is claimed for R4. Execution waits
for the parent's explicit shared-runtime grant.

The R3 independent critic found `exposed_deck` the strongest boat/team
compromise and found its contact cue readable. The remaining failure was
opposite-heading recognition at native size. The R3 source, renders, saved
models, and independent evidence remain unchanged.

## Premise and existing evidence

The failed premise is: **small prow and stern attachments can orient an
otherwise nearly round hull and canopy at 13 px.** The explicit facing gap
failed R2 and R3, two actual rounds. R1 failed boat/team/contact readability;
it is not counted as a third failure of this narrower gap.

Before changing geometry, I read the R3 verdict and inspected its native
team/contact sheet and arena inspection sheet:

`/Users/me/.codex/clash-qualification/20261020-model-r3-critic/run-20261020T170642Z/`.

The opposite views retain similar broad bodies while the distinguishing ends
occupy tiny pixel clusters. This rejects another attempt to enlarge a rivet,
flag, nozzle, or other small attachment. R4 changes the primary footprint.

## Three alternatives

| Parameter set | Primary heading cue | Remaining risk |
| --- | --- | --- |
| `wedge_hull` | A long triangular foredeck widens into a broad, flat transom. The canvas remains the R3 oval. | The roof could still dominate or conceal the pointed hull. |
| `notched_stern` | The same pointed foredeck contrasts with a large recessed transom around the pusher. | The canopy or pusher could occlude the recess. |
| `tapered_canopy` — provisional selection | The wedge hull and canvas roof both narrow toward the bow; the roof ends in a broad rear edge. | The directional roof must retain the canvas rivercraft identity and exposed TEAM read. |

The selected roof uses five authored cross sections within R3's existing
canopy axis extents, rather than an added arrow, tail, or oversized attachment.
Its copper bindings and support tips follow the new surface. The other two
alternatives keep the R3 canopy geometry. All three keep the R3 hull beam,
length, depth, hover height, canvas height, and spout/pusher extents.

TEAM foredeck vertices conform to the wedge so no painted panel floats beyond
the new hull. The top-facing coaming, side walls and stern boards retain the
same material and width. The exact river `#2E7F86` and ember `#C6452E` materials,
warm studio lights, color transform, and contact motion stay unchanged.

The boat remains the original copper kettle craft with cream canvas, kettle
lid, prow spout, stern pusher and leaf pennant. Existing name, lore, flying
ranged role, stats, mechanics and audio are unchanged. No reference assets,
external models, texture maps or randomness are introduced.

## Native pixel budget and fixed contract

These are design targets, not measured achievements:

| Cue | R4 target or preserved contract |
| --- | --- |
| Heading | At least 3 px of meaningful bow taper versus a broad stern edge or recess at least 4 px wide |
| Opposite silhouettes | At least 12 changed mask pixels and a proposed same-anchor IoU ≤0.85; a viewer must still identify heading |
| Class/team/contact | Preserve the earned R3 copper-boat read, visible exact-palette TEAM area, and outer contact puff/recoil cue |
| Scale | Same 50° orthographic camera, scale 8.025, native 64×64 cell, ground anchor (32,54) |
| Extent | Report against actual R3 alpha≥16 bounds: N 14×15, E 17×12, S 14×13, W 17×12 px; flag any increase |

The fixed camera remains the comparison contract. There is no fit-to-bounds,
per-view enlargement, changed height cap, alpha crop, shifted mask, mirrored
east/west frame, or shape-dependent calibration. Numeric differences alone
cannot establish facing recognition. The 4× sheets are supplementary
inspection; the actual native cells decide readability.

The runner records alpha≥16 and alpha≥128 opposite-view masks at their shared
anchor. It measures all staged pose bounds with the actual saved cameras and
checks for cropping. A second, fresh process reopens the selected `.blend`,
checks camera angle, scale and projected anchor, and verifies the file hash
did not change.

## Prepared bounded run

Only after an explicit parent grant:

```sh
env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8 TZ=UTC \
  bash design/20261020-redesign/astra-round-4/run-comparison.sh
```

The runner creates a unique `generated/attempt-UTC-PID/` directory. It snapshots
the sources, records their hashes and R3 control hashes before launch, and uses
an allowlisted environment. It records actual tool versions, command arrays,
PIDs, raw output and direct exit codes. It preserves every failed attempt.
It uses only fresh `--background --factory-startup --disable-autoexec` Blender
processes and never connects to the user's live scene.

The batch is 33 renders: three variants × four saved views × two teams at idle
(24), the selected variant × four views × two teams at contact (8), and one
256×256 quarter view. Native cells use the unchanged alpha-weighted 4:1 box
reduction. R3's existing control pixels are read byte-for-byte, not rerendered
or modified. The runner then reopens the selected saved scene read-only.

Outputs will include each variant's editable `.blend` and GLB, geometry and
export receipts, native/raw images, projection measurements, opposite-heading
mask measurements, and native and 4× comparison sheets. Actual polygon counts
remain pending; no detail is added merely to fill a triangle budget.

Source parameters and the exact bounded plan are in `alternatives.json` and
`comparison-plan.json`. `prepared-source-sha256.txt` fences this preparation.
Independent critique follows actual execution. No full atlas, Coilblade or
Mossguard revision, UI work, game adoption, or runtime sprite-consumption
change is part of this comparison.
