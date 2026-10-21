# Portrait preview framing addendum — before render/build

The actor-only fixed restlift1.40 is intentional and required by the pinned native floatingread. Native cameras, groundpivot32/54, ringworldlocations and placementscale remain immutable.

For the NONSHIPPING standalone diagnostic portrait only, translate BOTH original portrait camera location and target upward by exactly the same constant actor restlift. Preserve camera-relative-to-actor geometry, orientation, ortho2.65, focal/intrinsic settings and originalrelative targetZ1.0. This is a fixedcoordinate translation compensating the declaredrestoffset, not per-view fitting/zoom/crop or pose adjustment. Record exact before/after camera states and reason. All productpaintedportraitassets stay unchanged. Native rendered camera/pivot/crop comparisons unchanged. The addendum precedes any round2Blenderexecution; originalround1 source/bar unchanged. Include this metadata in candidate provenance so previewframe change is explicit.
