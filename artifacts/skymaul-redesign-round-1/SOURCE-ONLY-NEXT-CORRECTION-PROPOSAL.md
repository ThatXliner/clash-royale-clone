# Skymaul next correction: source-only proposal

Advisory, unbuilt and unrendered. The sealed candidate, independent FAIL and all gates remain unchanged. Only this document and `source-only-next-correction-audit.json` were created, outside the candidate. No heavy runtime, source mutation or Claude call occurred. Root's actual Claude review should select the final geometry/pose values before a new source scope and runtime grant are pinned.

## Causes established from the saved images

| Failure | Evidence | Required correction |
| --- | --- | --- |
| Core E/W area | Best 2×2 minimum coverage: East idle/walk/contact **90/122/90**, West **90/147/9**, versus 128 required. Chest/rim hides 17/25/17 raw supported core pixels in East. | More usable side surface, less rim/chest occlusion. Color cannot supply missing coverage. |
| Core South value | Coverage-eligible 2×2 exists, but its dimmest Y is **.7654298039215687 / .6475152941176471 / .7645960784313726**. Almost fully covered raw core medians also remain below .85. | Larger bright interior plus material strength; further whitening already near-white `#FFF8C5` worsens the ivory read. |
| Core West contact | Right fist covers **75 of 77** isolated raw supported core pixels; the other two are partial edges. | Move the physical contact fist off the core's lateral projection, preserving the grip and centered overhead hammer. |
| Head/chest | Every idle/walk heading has distance 1, no empty witness, and 2–6 isolated overlap pixels. | Reduce head/binding/chest depth as well as adjusting vertical separation. A Z-only flattening pass cannot address the whole cause. |
| Lower/ring | North/South all poses and West contact have distance 1. **East all poses and West idle/walk have distance=null because the visible lower group is empty.** | Separate actual projection overlap from occlusion. In all 24 team cells, the required clearance is not demonstrated; do not claim all 24 literally touch. |

The companion JSON retains unrounded pixel details. Input-metrics SHA-256: `11fdb9b63f12a63b7f6122cea76f5c56ebc669191f11fd8e6706f0367d5f29f6`. These are builder diagnostics, not a replacement critic verdict.

## Lower-ring operational mismatch and original-scope limit

The ring planes are at Z .018/.024. The lowest stone's rest bottom is Z .15: there is **.126 world units of physical vertical clearance**. A full projected annulus still passes behind the actor. Raising the lowest chip from center Z .15 to .23 moved its image about .41 pixels upward, toward that rear arc, despite increasing its real ground clearance.

The fixed waist also crosses the rear arc: its smooth ellipsoid envelope spans approximately native Y 49.02–52.32 South and 48.85–52.80 laterally; the actual saved lower/ring masks confirm overlap. Changing only the lowest chip cannot remove the waist's projection. Hiding the lower group behind a fist would exchange overlap for the already observed visibility failure.

Thus the original scope's fixed waist/rings and bounded last-chip edit are insufficient. This is not a proof that every Skymaul design is impossible under the numeric bar. It does mean another chip-only correction has no credible path. The pinned shortest-screen-gap rule remains binding; physical floating clearance is a separate diagnostic, not a substitute.

## Exact source controls proposed for root to pin

Keep camera/anchor/scale, headings, thresholds, frame numbers, clip names, budgets and preservation unchanged. All numbers below are **unrendered authoring hypotheses**. Claude should choose a coherent set rather than blindly combine every row.

| Source control | Concrete starting hypothesis / authorized range to consider |
| --- | --- |
| Head and binding | Head pivot Z **1.90–2.02**, radii X **.24–.29**, Y **.15–.19**, Z **.18–.22**. Example `(2.00; .25,.17,.18)`. Binding example local Z `-.07`, radii `(.23,.15)`, tube `.03`; refit the existing face plane. Keep the binding inside the compact head envelope. |
| Chest, core and rim | Chest example center `(0,.02,.98)`, radii `(.24,.16,.19)`. Core example center `(0,-.35,.98)`, radii `(.25,.27,.23)`; allow X `.23–.27`, Y `.24–.29`, Z `.21–.25`. Rim example center `(0,-.14,.98)`, radii `(.25,.23)`, tube `.03`. Refit TEAM inset within the same chest; preserve one seated core, existing meshes/materials. |
| Warm core material | Restore toward `#FFD76B`; allow **Skymaul-only emission .8–1.8**, starting hypothesis **1.25**, replacing the old fixed .35 restriction in a new scope. No bloom/new light/halo. Measure actual native Y; strength is not a guaranteed pass. Copper also needs a Skymaul-only color adjustment after band geometry is settled. |
| Fists and occluders | Allow arm-pivot X magnitude **.60–.67**, Y **.30–.42**, Z **1.40–1.49**. Rearward fist placement can separate it from the forward core and central lower cluster in side views. Example pivot `(±.66,.37,1.47)`, fist/grip local `(0,.08,-.42)`, fist radii `(.255,.18,.27)`. Shrink upper stones to about `(.14,.12,.13)` and narrow/reposition arm bands first; existing fist failures include upper-stone/band occlusion. Move knuckles/wrist/grip consistently. |
| Carry/contact pose | Keep physical grip parenting and matrix-composed hammer rotation. Hypothesis: carry desired body Euler `(0,-40,0)`; contact arm `(-145,0,-55)` and hammer desired body Euler `(10,-30,0)`, head-center distance `.68`. Permit carry X `-10–15`, Y `-50 to -25`; contact arm X `-150 to -130`, Z `-60 to -45`; hammer contact X `5–15`, Y `-35 to -25`; shaft/head distance `.62–.74`. These are coupled controls. Contact height/centering and carry isolation must all be rerendered. |
| Lower cluster | Permit all three stones to change, not only the last chip. Example pivot Z `.26`; waist center `(0,.01,0)`, radii `(.18,.12,.09)`; chips centers `(±.14,0,-.07)`, radii `(.08,.07,.05)`. This fits a larger projected hole more plausibly while retaining physical clearance. Reject a subpixel cluster that loses the stone identity. |

Walk needs Claude's actual pose choice at the same keys. The old X=5° body lean shifts hands forward and can consume a new side gap; a smaller lean alone also risks making the already subtle walk less readable. Permit orientation changes, but no body translation, bob, timing or mechanic changes.

## Ring profile needs an explicit expanded-scope decision

A plausible closed-ring hypothesis keeps outer radii `.97/.87`, Z `.018/.024` and 36 segments, uses inner radii **.66/.73**, and retains the six paired Ember notch positions with depth **.10**. Implement only through a **Skymaul-specific override in `pipeline.ground_rings`**; other characters stay exact. The proposed waist's nearest lateral ellipsoid envelope is about Y 51.4746 and the proposed hole's rear limit about Y 49.8756: roughly 1.6 geometric pixels before faceting, filtering, occlusion and walk rotation. This is feasibility arithmetic, not gap verification.

Do not enlarge the hole with the old `.27` notch depth: Ember TEAM's minimum outer radius is `.87-.27=.60`; an inner radius .73 would invert its quads. The .10 notch gives minimum outer radius .77. Shallower notches may weaken team identity. If deep notches/common marker geometry are fixed design invariants, this option is unavailable; preserving them would require a much smaller/lower cluster and may lose the intended floating-stone read. Claude/root must resolve that design conflict explicitly. No gate is waived by this proposal.

## Next action and unresolved proof

Use root's in-progress Claude native-image review to choose the compact-head/core balance, rearward-fist/visible-walk gesture and ring/cluster treatment. Pin those exact source choices, then build a new external candidate. Source arithmetic cannot prove native brightness, 2×2 coverage, one-pixel gaps, six-pixel hammer isolation, visible fist support, team grayscale identity or a readable walk. Reuse the same renders/masks and every-frame crop audit; retain failures and send the result to an independent critic.

Round 1 remains **164/286 met, 122 failed**. Preservation is numerically exact; only canonical→export has the 428 signed-zero token differences, and all five operation-specific after-states are byte-identical. Standalone qualification still precedes atlas, live-game, restore and release verification.
