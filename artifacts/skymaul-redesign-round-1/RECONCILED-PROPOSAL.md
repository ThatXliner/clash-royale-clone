# Reconciled Skymaul authoring proposal

**Advisory, unbuilt and unrendered. Root must pin the round bar and grant runtime before implementation.** This supersedes the prospective Skymaul edits in `PROPOSAL.md`; that original file is unchanged. It does not supersede any accepted model, atlas or PASS record.

The design input is Claude's actual `character-refinements.md` and `deterministic-motion-notes.md`, preserved in `/Users/me/.codex/clash-qualification/20261020-claude-next-three-design-consult-attempt-1/`. Its manifest records job `job-ba4aa405cd` as timed out after the three core documents were written. Their status remains advisory. Character-note SHA-256 is `e9a12164e5c24d91a6ac45d553fdcabc194f1d0e22fd829414a124040464b47d`; motion-note SHA-256 is `91802f5ed8b77dc539daa040a016a8d5f64fd663a176c3bddf91fe29b8909ebf`, as recorded by that manifest. Missing/resumed SVG work is not input to this plan.

Model source was read from Git `59d9fda9093b058cd3025a804835629b0552eeef`. The accepted package is `design/20261020-redesign/astra-next-three-round-1/models/`; `S/` below means its `source-package/`. The source blob pins remain in the original proposal. All new work belongs in a new external candidate package, not those accepted paths.

## First coherent scope

**One Skymaul round: make a floating basalt mass, warm inset core and carried smith's hammer read as one character at native size.** Implement SK-1 shoulder carry and SK-2 centered overhead contact together with SK-3 value hierarchy and a deeper existing core, while correcting/protecting SK-5 gaps. Keep the existing fist mesh sizes initially and verify SK-4's rendered size criterion. This is a cohesive character pass, not three character rounds or a runtime integration.

| Claude item | First-round decision |
| --- | --- |
| SK-1 | Replace the waist-level hammer with a right-handed, outward-leaning shoulder carry in idle/walk. |
| SK-2 | Author frame 100 as a centered overhead pose; preserve the existing authored frame numbers and clip names. |
| SK-3 | Darker basalt, restrained top facets, copper contrast, and a deeper/front-seated `warm_core` using its existing mesh and material. Value-only alternative is documented below but cannot meet the requested side-core area. |
| SK-4 | Preserve current fist radii and knuckles first. Their source-projected boxes already exceed 3×3 px in N/S; visible opaque support remains unverified. Enlarge only if the new mask check fails, within this same character round and with gap/width checks rerun. |
| SK-5 | A gap is actual background, not a dark seam. Include head/chest shaping and explicit semantic-mask checks; preserve lower-stone clearance from the rings. |

No new names, lore, roles, mechanics, targeting, timing, scale architecture, camera fitting, runtime clocks or UI behavior. No altered saved selection to make restore comparisons pass. Root binds gameplay/facing/contact questions to canonical code separately.

## Verified baseline versus new targets

The accepted build receipt reports 1,136 actor triangles plus 288 presentation-ring triangles = **1,424 total**, 26 editable actor meshes, and **8 authored materials**. The new settings below retain primitive vertex/face counts and reuse materials; unchanged counts are expected, not yet executed. The cap remains **3,000 total evaluated scene triangles including both ring variants**, plus the separate GLB actor check and at most 8 materials including `TEAM`.

The common camera remains 50° elevation, ortho 8.025, ground pivot (32,54), 256×256 raw reduced 4:1 to native 64×64. Current geometric idle actor heights N/E/S/W are 12.1004 / 12.2002 / 11.7244 / 13.7766 px. These actor bounds include the weapon; “body-only” in the old evidence means rings hidden, not an anatomical-body-only measurement. Frame 51 heights are 12.4331 / 12.8555 / 11.2396 / 14.1097; frame 100 heights are 13.5735 / 12.1411 / 10.2473 / 16.7856. Thus Claude's proposed contact-height and gap requirements are new requirements, not properties established by R1.

Current minimum projected scene margin is 4.1662750244140625 px; current minimum native alpha-clear margin is 4 px. Existing code guards only 2 px. The candidate must raise `S/scripts/pipeline.py:17,354–355` and `S/scripts/render_saved.py:49–50` to **4 px**, under a newly pinned bar. Do not alter the accepted files or their recorded bar.

A small read-only geometry audit projected the saved canonical vertices through their saved local transforms and camera transforms. It used the saved `canonical-state.json` (1,160,072 bytes), not Blender or a new render. Values below are displayed rounded; the source coordinates were not rounded or normalized. These boxes do **not** measure occlusion, antialiasing, color or opaque pixel support.

| Existing group | N/S idle source-projected box | Other checked poses / views | Consequence |
| --- | --- | --- | --- |
| Each bare fist | 3.315 × 3.978 px | N/S frames 1/51/100: width 3.288–3.352, height 3.492–4.069 px | Do not automatically grow fists. Render visible masks first. Adding knuckles does not enlarge idle bounds. |
| `warm_core` | South 2.185 × 1.405 px | E/W 0.683 × 2.177 px, before occlusion | Values alone cannot create a 2×2 bright side patch. Even the frontal 2×2 bright patch is not established. |

The fist audit walked `objects`/`integer_frame_local_poses` parent transforms, projected the actual `meshes[*].vertices` into the saved orthographic camera, and used `64 / 8.025` px per camera-plane unit. All involved parent-inverse and delta transforms are identity. This is a reproducible geometric diagnostic, not a replacement for native renders.

Review-sheet headings are **N/E/S/W**; atlas columns are **E/N/S/W**. North is the back view, south the front. Every new receipt must name the actual facing rather than infer it from a column number.

## Exact source edit map: hammer and authored poses

`S/scripts/skymaul.py:18–37` establishes handedness: `hammer` is parented to `right_arm`. The right-arm pivot is body-local `(.53, -.045, 1.28)`; its fist center is arm-local `(0, -.03, -.42)`. Current hammer pivot `(0, -.08, -.40)`, shaft from `(0,.08,.07)` to `(0,-.49,.07)`, and head center `(0,-.56,.07)` put the shaft along local **−Y**. A local X rotation therefore is not an independent world-space “raise hammer” setting; it composes with right-arm rotation.

Re-author the same three meshes around a grip-centered **+Z shaft axis**. This is an explicit authoring change, not an export-time reparent/recenter operation:

| Source parameter | R1 | Proposed first candidate |
| --- | --- | --- |
| `hammer` pivot location, parent unchanged | `(0,-.08,-.40)` | `(0,-.03,-.42)`, exactly the fist center |
| `smith_hammer_handle` start / end | `(0,.08,.07)` / `(0,-.49,.07)` | `(0,0,-.08)` / `(0,0,.74)`; radius `.055` unchanged |
| `smith_hammer_head` and `hammer_copper_collar` center | `(0,-.56,.07)` | `(0,0,.82)` |
| Head six-point outline / thickness | Existing X/Z outline / `.26` | Unchanged initially |
| Collar four-point outline / thickness | Existing X/Z outline / `.28` | Unchanged initially |

The shaft now passes through its grip pivot. It stays attached to the same fist throughout arm motion. Do not apply the original proposal's extra `.15` lateral pivot shift or its thicker head on top of this design.

Keep `model_common.FRAMES` exactly: idle 1/11/21/31, walk 41/51/61/71, attack 90/96/100/106. Native samples stay **1, 51, 100**. All degrees below are proposed authored pose data, not runtime timing or verified images.

| Pose keys | Body | Right arm XYZ degrees | Desired hammer XYZ degrees **relative to body**, not arm |
| --- | --- | --- | --- |
| Idle 1/11/21/31 | location `(0,0,0)`, rotation `(0,0,0)` | `(0,0,0)` at all keys | `(-6,27,0)` at all keys |
| Walk 41/51/61/71 | no Z bob; X `5`, Z `(0,4,0,-4)` | X `(0,-8,0,8)`, Y `0`, Z `5` | `(-6,27,0)` at all keys |
| Attack 90 | location `(0,0,0)`, rotation `(0,0,0)` | `(0,0,0)` | `(-6,27,0)` |
| Attack 96 | no translation; X `-2`, Z `-3` | `(-55,0,-25)` | `(-18,8,0)` |
| **Attack 100 / contact** | **no translation or body rotation** | **`(-90,0,-42)`** | **`(-15,-18,0)`** |
| Attack 106 | no translation; X `1`, Z `0` | `(-20,0,-5)` | `(-8,22,0)` |

Use the existing `angles` helper for body/arm values. For the hammer, set the local Euler rotation from the composition below, after setting the arm rotation. It removes the ambiguity between arm-local and body-local angles without a per-heading pose:

```python
desired = Euler(tuple(math.radians(v) for v in hammer_body_xyz), 'XYZ').to_matrix()
arm = c['rig']['right_arm'].rotation_euler.to_matrix()
c['rig']['hammer'].rotation_euler = (arm.inverted() @ desired).to_euler('XYZ')
```

This requires `math` and `mathutils.Euler` in the future `skymaul.py` copy. It is authoring-time composition. `reset_pose` still runs first; `remember_rest` and the existing NLA key writer remain authoritative. Never add degree offsets to a reset Euler and assume they compose in world axes.

With unchanged right-arm pivot, the proposed idle shaft points approximately `(0.452,0.105,0.886)` in body coordinates: outward, slightly back, upward. At frame 100 the fist center is approximately `(.249,-.357,1.310)` and the hammer-head center approximately `(.004,-.145,2.063)` before any view projection. These are geometric estimates, not rendered acceptance; the centered contact is a real 3D pose, not a special north/south sprite.

Remove Skymaul's existing idle/walk body-Z arrays at `:46,49` and attack translation array at `:55`. No added hover bob or impact lunge. Keep the left-arm walk X/Z values initially; reduce lower-stone walk X swing from `-s*12` to `-s*8`, and keep lower stones at rest in idle. The selected cells remain distinct through posture and hammer placement. No changes to simulation contact or authored frame numbering are permitted to compensate for art.

**Projection risk:** a head beside the body can add screen height in one lateral view at 50°. Keeping its world-space top below Z=2 does not prove a native height limit. The `.82` head-center distance and carry angles are first-candidate settings. If the pinned native envelope fails, adjust the actual grip/shaft/head pose or geometry and rerender; never crop, rescale, move the camera or silently redefine the measured actor.

## Basalt, core and floating mass

Use a Skymaul-only palette override in the candidate `palette.json`, read by `model_common.materials`. Do not change shared `amber` or other tokens for Brassbolt/Reedsting. The override may supply settings, not new material names. Proposed starting sRGB values: `stone #424A4D`, `stone_light #78817F`, `amber #FFD76B`; copper remains `#B87938`. Keep existing roughness/metallic settings and amber emission `0.35`; add no bloom, light, halo or emissive effect. Native display values must be measured after the unchanged lighting/AgX/exposure pipeline.

In `skymaul.py`, assign `face_plane`, both upper stones, all knuckles and `floating_lower_left` to existing `stone` rather than `stone_light`. Use `stone` as the hammer head's base material. Reuse `stone_light` only on the angular head's top-cap polygons and the hammer's upper facet; these may be second material slots on the same meshes, but do not create a ninth material. For the current primitive topology the head top cap consists of polygons incident to vertex 0; the hammer prism's horizontal upper side is face index 5. Confirm these topology identities in the future source check before assigning indices.

### Core options

| Option | Exact geometry | Scope and risk |
| --- | --- | --- |
| A: values only | Keep `warm_core` radii `(.137,.045,.137)` and original depth | Less geometry work but cannot meet Claude's 2×2 bright side-read goal. It is a deliberately narrower SK-3 bar, not the recommended complete character pass. |
| **B: deeper, front-seated existing core — recommended** | `warm_core`: center `(0,-.40,1.10)`, radii `(.18,.18,.17)`, same 10 segments / 4 rings. `chest_core_rim`: center `(0,-.285,1.10)`, X/Z radii `(.20,.18)`, tube width `.043`, same topology/material. | Gives the core enough geometric depth for a side patch while its rear remains seated into the chest. Actual 2×2 bright support still requires rendering. Risk: a protruding lantern/orb, excessive frontal dominance or intrusion into a floating gap. Keep it faceted, encased by copper, and visibly part of the chest. |

Option B does not claim that a 2×2 geometric box produces four bright pixels. The native alpha and grayscale gate below is the acceptance check. Do not fake the read with a second side core, painted overlay, per-view light or billboard.

### Gap edits and preservation

Proposed first-candidate rest edits, coupled to core option B:

| Source object | Proposed setting | Purpose / risk |
| --- | --- | --- |
| `head` pivot Z / `angular_head` Z radius | `1.68 → 1.73` / `.32 → .27` | Keep world top Z=2.00 while lifting the bottom face. X/Y radii remain `.39/.29`. Risk: a flattened head; original angular identity must survive. |
| `chest_stone` center Z / Z radius | `1.12 → 1.08` / `.34 → .24` | Open the neck gap without raising the whole actor. X/Y radii remain `.38/.28`. Core/rim top is close to the new chest top. Risk: loss of stone mass. |
| Fists, knuckles, wrist bands | Original dimensions and local centers | Their sizes already have plausible 3×3 source support. Avoid increasing mass before checking visible pixels. |
| Arm pivots | Original positions initially | If N/S fist/chest clearance fails, permitted first correction is symmetric outward movement up to `.06` units per arm; rerun actor width and contact centering. Do not enlarge the whole character. |
| `floating_waist`, lower chips, ring geometry | Original rest geometry initially | Removing body bob and reducing lower-stone swing protects clearance. If the lowest chip alone fails, a bounded option is its local Z `-.47 → -.39` and Z radius `.10 → .08`; do not lift the ring or ground anchor. |

These parameters are unrendered starting points. They open object-space separation; they do not prove a one-pixel gap after projection. The same round may adjust these named gap controls to meet the pinned native checks. If more anatomy or scale changes become necessary, return the failed evidence and revise the scope rather than weaken the checks.

## Proposed executable native bar

**All new numeric thresholds below are proposed design gates.** Claude did not measure them on R1. They are neither historical reference stats nor facts established by the old PASS. Root must select/pin them before the future build. Do not retrofit a passing threshold after seeing the candidate.

Run the existing saved-Blend color/team-mask/body-only/portrait passes, plus a small Skymaul semantic-mask pass under the same saved cameras. New masks are diagnostic renders, not new shipping assets. Mask helpers must restore all materials, visibility, poses, view settings and cameras exactly and remove their temporary materials before state comparison.

| Check | North | East | South | West |
| --- | --- | --- | --- | --- |
| Idle 1 / walk 51 hammer head outside other actor silhouette | ≥6 supported px | ≥6 supported px | ≥6 supported px | ≥6 supported px |
| Contact 100 | Centered overhead head relative to head stone | Head above head stone and ahead of carry | Centered overhead head relative to head stone | Head above head stone and ahead of carry |
| Warm core | Back view; no core required | Contiguous 2×2 bright visible patch, option B | Contiguous 2×2 bright visible patch, option B | Contiguous 2×2 bright visible patch, option B |
| Fist size | Each visible fist has ≥3×3 support box | Report visibility; no artificial rear-fist display | Each visible fist has ≥3×3 support box | Report visibility; no artificial rear-fist display |
| Floating gaps, idle/walk | Record as diagnostic | Head/chest and near visible fist/chest ≥1 clear px | Head/chest and each fist/chest ≥1 clear px | Head/chest and near visible fist/chest ≥1 clear px |
| Lower stones / ring | ≥1 clear px | ≥1 clear px | ≥1 clear px | ≥1 clear px |

The E/W gap wording is an explicit operational refinement of Claude's “each fist”: a correctly occluded far fist must not be drawn through the torso to satisfy a metric. Root should pin this interpretation, not leave it implicit. All groups and occluded counts remain in the receipt.

Executable definitions:

1. **Hammer:** render `H` = isolated head+collar alpha, excluding shaft; `B` = all other actor meshes, rings excluded. Count `(H >= 128) & (B < 16)` after the same 4:1 filter. Require ≥6 pixels, a largest 4-connected component ≥4 pixels and a support box at least 2×2. Record handle+head support separately so a long shaft cannot masquerade as a recognizable block head. Use both teams' color cells for the visual verdict.
2. **Contact:** visible semantic-mask centroids must put the hammer head within 1 native px horizontally of the head stone in N/S, with the hammer top at least 1 px above the head-stone top. In E/W, hammer support must sit above the head stone and move forward by at least 1 px from carry in the correct screen direction. A global upward movement from the idle screen position is not required: depth projection can move one shoulder-carry corner higher than the centered overhead pose. The critic must still see the intended overhead contact, not just changed pixels.
3. **Core and values:** obtain depth-occluded material/object coverage masks. On actor pixels with coverage and full alpha ≥128, measure display grayscale `Y'=(.2126R+.7152G+.0722B)/255`, after the existing render transform. Proposed median targets: stone `.25–.40`, copper `.55–.65`, core `>=.85`; core is the brightest actor region. Exclude rings and the selected top-facet material from the base-stone sample. For the 2×2 core gate all four adjacent pixels must have visible core coverage ≥128 and `Y'>=.85`, not merely a 2×2 bounding box. Retain sample counts, P10/median/P90 and the masks. Empty coverage fails; no enlarged crop or blur can substitute.
4. **Fists:** use visible, depth-tested support from fist+knuckles+wrist-band, threshold 128. In N/S each support box must be at least 3×3 and its largest 4-connected component at least 6 pixels; record pixel count and a visible inset in the native sheet. If it fails despite the geometric box, first fix occlusion/pose. A bounded enlargement option is fist radii `(.24,.25,.26) → (.255,.26,.27)` and knuckle radii `(.085,.08,.11) → (.090,.085,.115)`, with bands repositioned only as needed for fit. That is part of this character scope only if required; rerun gaps and width. “Larger than the head” is not independently proved by a 3×3 box.
5. **Gaps:** head group includes its copper binding; chest includes the core, rim and TEAM inset; fist includes knuckles and wrist band; lower group includes all three lower stones. No dark painted seam counts. On the native actor-alpha image, require an actual pixel below alpha 16 between the specified visible group boundaries; record the coordinate and a 1× labeled mask crop. Require at least one empty-pixel step on the shortest separation between the group support masks (Chebyshev boundary distance ≥2), and verify that other actor geometry does not fill that step. Report overlap/occlusion explicitly. Ring clearance uses the actual current team's ring mask.
6. **Envelope:** no per-view scale/fit/crop/mirror and no change to the placement scale. Proposed native actor-alpha-16 height cap is 14 px at idle and 15 at walk, with contact at most 2 px taller than the same-heading idle and at most 16 px. Count the weapon in these bounds. Keep the roughly 13 px body target and report geometric bounds alongside raster bounds. These are proposed new bounds, not an assertion that the unrendered carry fits them. Keep N/S width near the accepted 15 px native envelope; a proposed first bar is at most 16 px, with lateral width less than N/S. Root must pin this one-pixel width allowance explicitly if used.
7. **Crop/team/identity:** every native cell and projected scene retains ≥4 px clear margins; heading probes and pivot remain exact under the existing camera tolerances; River/Ember read in color and grayscale; no reference asset import. A separate critic compares native 1× cells and the original painted portrait identity. The painted product portrait stays unchanged. Do not change the existing portrait camera simply to hide a difficult carrying-side occlusion; an optional free-side study would be supplemental and separately declared.
8. **Pose separation:** compute alpha-XOR with rings excluded as `count(idle_mask XOR pose_mask) / count(idle_mask OR pose_mask)`, threshold 16, and report the masks. Claude's 10% walk / 20% contact numbers are unmeasured starting points. Recommend reporting them as diagnostics in this first round, while requiring visible idle/walk/contact recognition from the blind critic; adopt them as hard gates only if root explicitly pins that exact definition. Different denominators are not interchangeable.

The additional masks are a small, bounded authoring verification tool: all four headings, sampled frames 1/51/100, relevant groups only. Evaluate numeric projected crop bounds at every integer frame 1–106 as well, so interpolation cannot hide an off-cell pose between rendered samples. This does not qualify runtime motion. Root allocates their runtime. No such pass has run during this preparation.

## Preservation and implementation ownership

Future source ownership is limited to the candidate `skymaul.py`, the Skymaul-only palette override and its loader, margin checks, and the bounded evidence/mask writer. Do not edit Brassbolt/Reedsting generators in this round. Keep the original accepted source/binaries/atlases and all input manifests immutable.

Create a **new candidate canonical state after intentional modeling edits**. Compare that exact unrounded state against post-export, post-save, fresh-load, mask-restoration and final-render states. Retain complete JSON on success as well as failure, including every local vertex, topology record, material input, pivot, visibility setting and local transform at integer frames 1–106. Also retain exact source/output digests.

The old `assert_exact` used numeric equality, so `+0.0 == -0.0` could pass while serialized hashes changed. Preserve and report both results: numerical equality with no rounding/normalization, and byte/digest identity separately. Never rewrite signed zeros or use epsilon comparisons to make a preservation failure disappear. Complete pre/post state files make future sign-only differences directly auditable instead of relying on reconstruction. Diagnostic temporary materials and hidden meshes must be fully restored before comparison.

A successful new standalone model would still require a separate accepted atlas packing round. It would not accept live rendering, gameplay-facing binding, motion, restore behavior or full-cast coverage. Claude's suggested “compare with no selection” is not a valid shortcut for a future restore test; retain the user's actual saved selection and full HUD state.

## Subsequent character work

- **Brassbolt:** follow Claude's horizontal signature: prod beyond the N/S body, higher chest carry, visible amber fletching, brass/narrower hood trim, two ear points, then crouch and the exact 1/51/100 pose contrast. Reconcile material reuse carefully: `bone` still supplies muzzle and string, so changing trim alone does not make it unused. No code expansion in this Skymaul round.
- **Reedsting:** follow the vertical signature: two existing materials on the stave, thin tips/thicker grip, upper bow tip above the hood, lighter mask and moderate projecting snout, clean lining hem, then upright/forward-tip/full-draw pose keys. The old grip-to-wrap offset remains a source issue to solve coherently with those arm/bow poses. Do not apply the original proposal's uniform bow thickening or dark-lip-only approach unchanged.

Only this Markdown file was created for reconciliation. No model source, model artifact, root/index/ref, runtime, build or render was changed or run.
