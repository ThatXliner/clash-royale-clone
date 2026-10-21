# ART-3D-SKY-002 — Claude-directed Skymaul revision, round 1

Status BUILDING, 0/0, round 1. Original accepted R1 stays intact.

Pinned before candidate authoring. Design basis is the copied RECONCILED-PROPOSAL.md, including core option B and its exact executable definitions. All proposed gates in that document are adopted here EXCEPT pose alpha-XOR remains diagnostic, with visible pose recognition mandatory. North gaps are diagnostic; east/west require the visible near fist, not an artificially exposed rear fist. At most16px N/S width, lateral width less than N/S; idle height<=14px, walk<=15px, contact<=idle+2 and<=16px. No camera fitting/rescaling. Bright core visible2x2 E/S/W, hammer isolated head six pixels in every idle/walk heading, semantic fist/gap/contact/value checks as defined. Existing common camera/pivot/heading/team/triangle/material invariants remain. New crop minimum4px, not retroactive change to old R1 bar.

Allowed candidate source: Skymaul generator, Skymaul-only palette overrides/loader, crop guards, bounded semantic-mask/evidence writer. Preserve all old accepted files, other characters and runtime. No mechanics, card, timing, dependency or UI source edits. Complete candidate canonical JSON before and after export/save/reload/mask/render; numeric-exact and byte equality reported separately, no normalization/epsilon. Build and critic separate. A source or setup failure is not a critic round. Render failure retains actual raw evidence and does not weaken the bar.

This qualifies standalone character art only. Subsequent atlas, actual live-game integration, normal/reduced exact restore and release tests remain required before shipping the redesign. Claude’s character/motion docs are available; remaining page sketches wait for9pm quota reset.
