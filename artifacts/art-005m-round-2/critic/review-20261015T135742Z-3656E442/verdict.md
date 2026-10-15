PIECE: ART-005M
VERDICT: FAIL
EVIDENCE: Independent decode confirms a 1254×1254 RGBA atlas with 16 equal 313.5px source rects. PNG/WebP visible RGBA pixels match exactly, but the WebP is 1,151,374 bytes (102,798 over the 1 MiB limit). All 16 foot-contact anchors are unassigned. One actual Chrome render of the frozen preview at 13×13 CSS px per frame exited 0 and is saved as `actual-browser-13css-frame.png`; at that size the walk and melee poses are still difficult to distinguish and warm bright edge pixels remain visible. The full alpha silhouette is measured, but a 13px body height is not independently proven.
BIGGEST GAP: The output WebP is 102,798 bytes over the required 1 MiB asset bound, so it cannot pass asset admission.
Scope: asset only; no gameplay or historical parity claim.
Browser window release: no native window was acquired; headless Chrome exited 0 after the single capture.
