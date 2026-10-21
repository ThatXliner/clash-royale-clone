# Skymaul core round 4 — source-only audit and proposed scope

Round3 failed its whole-core visibility gate. The sealed round3 artifact and all114 mask differences remain unchanged; R545 stays FAIL and root will record R547 for round3. No round4 model/source authoring, save, render or export has occurred. This folder contains only this audit and `PROPOSAL.json`.

The existing actual Claude complete proposal requires a fully uncovered core with the established identity. Parent confirmed that this supplies design intent for an implementation-only geometry correction; another Claude job is not required. Root must still pin the new BAR, exact ownership and parameter before authoring.

## Smallest proposed change

Change only Skymaul `chest_core_rim` local-Y center from source `-.10` to `-.08` at `source-package/scripts/skymaul.py:164`. Both objects remain parented to `upper_cluster`. The core mesh, rim mesh vertices/topology, all materials, core placement, actor pose, camera and every other object remain unchanged. This is a single relative-depth field, not a hole enlargement or a core redesign.

Old stored Y is `-0.10000000149011612`. Proposed source Y `-0.08` predicts float32 `-0.07999999821186066`; exact predicted serialized delta is `0.020000003278255463`. The allowed fullstate path would be `/objects/ME_SBR_R1_skymaul_chest_core_rim/transform/location/1`. All20 mesh records and the other35 object records should remain numerically and canonically byte-exact. Metadata should stay external.

## Why this addresses the measured geometry

The copper rim is a12×6 toroidal band with major radii(.23,.20), tube radius.04, oriented onY. Its nearest local vertex Y is `-0.03464101627469063`; with the old center its nearest Y is `-0.13464102149009705`. The warm core has38 vertices/48 polygons: three12-sided layers at Y−.12,−.32,−.55 plus a front tip at−.57 and back center at−.12. Its farthest rear Y is `-0.11999999731779099`.

The rim therefore intrudes `0.01464102417230606` ahead of the core's rear plane. The proposed stored center puts the entire rim at Y>=`-0.11464101076126099`, behind the entire core by at least `0.005358986556529999`. The fixed portrait ray points toward positiveY (`0.806541671206544`). Along any such ray, a rim intersection must then be deeper than every core intersection by at least `0.006644401334543863`. This is a geometry-bound argument for eliminating rim occlusion in the pinned view. It does not substitute for actual rendering or prove that no different object blocks any core sample.

Using only the saved round3 JSON, triangle intersection arithmetic excluding the rim finds the core first at all112 previously recorded pixel centers that hit the core. The remaining2 centers lie at the antialiased edge and have no center core hit. No Blender or renderer was invoked for this calculation. The114 original mask differences and the110 actual rim-first centers remain historical facts, not rescored results.

The proposed rim motion is bounded above by `0.15950158377674137` native pixels before projection. Even that small shift can change antialiasing, copper coverage or lighting. Native pixel identity is not promised; the exact286 gates must pass again. The narrowest core-value median is `0.8557211764705881` in west walk against.85. The lowest copper median is `0.5675023529411765` against.55. Palette and lighting changes are outside this correction.

## Entire core versus front face

The failed core rays intersect rear-shoulder polygons0–3,10,11. They do not hit front-cap polygons24–35. Existing semantic membership identifies the entire `warm_core` object. Isolated support includes whichever surface of that whole mesh is frontmost on each ray, with ordinary self-occlusion already resolved by rendering.

A front-cap-only mask would ignore the actual failed shoulder and weaken the requirement. Do not rename, split, hide, delete, recolor or remove that shoulder from the core's semantic membership. Keep the original whole-object visible/isolated mask comparison and alpha>=128 support definition. A face-subset diagnostic can help explain the geometry but cannot replace the whole-core gate. The source plan leaves all core vertices and all face memberships unchanged.

## Owned source and preservation plan

After a root pin/grant, use a new external Skymaul source overlay that records the single center literal and a small derivative author driver. Use the sealed R3 saved model as input; do not regenerate all characters or modify shared `band_mesh`, `model_common`, `pipeline`, palette or pose functions. Existing driver/dependency sources can remain read-only with recorded hashes. No bulk model copy is needed.

Capture the loaded R3 fullstate, author only the rim center, and require its complete unrounded difference to match the one allowed path. Capture a fresh authored baseline before export. Export a new actor GLB from that authored model with the unchanged original clip/NLA settings; the old copied GLB is invalid for R4. Preserve the new authored baseline exactly through export, save, fresh load and render. Compare all camera data, meshes, materials, object properties, lights, animation tracks and106-frame poses. Record signed-zero tokens separately; never normalize or hide drift. Compare unowned records against sealed R3 and audit per-node GLB geometry/transform/animation data, since whole-GLB bytes should change.

Keep the exact pinned R3 portrait transform and intrinsics (`2.6500000953674316`, `0.12999999523162842`, `0.20800000429153442`). Preserve all286 native thresholds,848 crop rows>=4px,106 fixed-rest frames, original clips/right-arm ownership, native camera/ring state, palette and all other character source. Actual portrait masks, projection, containment, lightest-region and painted identity must be rendered and independently judged. A failed result opens a new pinned round; this proposal does not authorize post-render tuning.

A hole/radius change or core offset would affect more vertices or projected identity and is unnecessary under the simple depth bound. Those are alternatives only if root explicitly re-pins scope after evidence; they are not preauthorized fallback edits.

`PROPOSAL.json` contains exact bounds, source hashes, polygon ownership counts, the one-field allowlist, mask rationale, export/preservation plan and risks. HUD retains runtime ownership. No Blender/Node/Chrome was launched, and protected user Blender GUI63639 was untouched.
