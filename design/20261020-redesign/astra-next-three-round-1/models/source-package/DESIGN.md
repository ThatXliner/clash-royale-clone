# Skymaul, Brassbolt, Reedsting — editable model source preparation

Status: SOURCE ONLY. No Blender process, model export, render, or independent art review has run for this package. The generator is a reviewable proposal, not an accepted model or runtime asset.

The immutable input pin is `90efeb43555d35569a9bb66fab7ea8de83aa5045`. `input-manifest.json` records every captured Git blob, byte count, and SHA-256. Physical repository files are not used as canon. No `reference/` source is opened, copied, or bundled. No stats, lore, runtime, UI, or existing model are edited.

## Canon and medium translation

The painted atlas is authoritative for identity. `card-portrait-art.js` maps Skymaul to cell 3 (top right), Brassbolt to cell 4 (bottom left), and Reedsting to cell 5 (bottom row, second). The source atlas has 1774×887 pixels, so cell edges are fractional at 443.5 px; the study page uses exact CSS percentage positioning rather than inventing integer crop boundaries. The atlas's SHA-256 is `16307a59bde57889e11bcd7b86b54d69ba9985eae6ef436d9703e528fba58e4f`.

### Skymaul

Preserve the floating, separated dark stone masses, oversized angular head, bronze/copper bands, warm circular chest core, and broad detached fists visible in cell 3. The face is a blank carved rock plane, not a human face or a helmet. The stone arms and copper bands are explicit in the unchanged lore. Three suspended lower stones preserve the portrait's airborne read; there are no feet, wings, or added mount.

**[addition: lore-backed hammer]** The painted pose does not show a held hammer. The lore explicitly says the wanderer carries the first valley smith's hammer, and the existing vector read has a broad maul head. This model places a chunky two-faced stone smith's hammer, banded in copper, in the actor's right fist. It has a short wood handle, a silhouette-wide head, and no spikes. This is an additive carrying pose, not a rewritten identity.

**[addition: presentation team zone]** A broad TEAM inset on the lower chest band follows the current vector torso zone. It does not recolor the copper arm bands or the warm core. A small shoulder chip is offset to one side so opposite headings remain asymmetric.

### Brassbolt

Preserve the small warm-brown animal muzzle, dark nose, two pointed ears, deep green hood, tan hood edging, compact torso, diagonal leather belt, and broad horizontal brass crossbow visible in cell 4. The model must not become a generic human ranger. The crossbow has a long stock, two visibly opposed curved limbs, a string, a brass hinge, and one amber-fletched bolt along the actor's forward −Y axis. The bow and muzzle project ahead of the body, while the quiver sits behind one shoulder.

**[addition: hidden-side continuation]** The rear hood folds, sole shapes, and quiver fastening are simple continuations of the portrait's cloth/leather construction. They introduce no new lore. **[addition: lore-backed amber fletching]** Three broad amber fins make the lore's amber bolt feathers visible in the study view. A TEAM front tunic panel preserves the current vector torso team zone; the hood stays green.

### Reedsting

Preserve the long pale wooden mask, warm small eyes inside dark sockets, peaked reed/leaf hood, layered green shoulder leaves, bark limbs, and tall slender curved bow visible in cell 5. The bow stays a vertical long arc, distinct from Brassbolt's horizontal crossbow. A second leaf tip and the quiver are deliberately offset, and the bow is held on the actor's left side. The same source-backed identity appears in all four headings without image mirroring.

**[addition: lore-backed lining marks]** Three light stitch marks on the inner hood lip carry the exact existing lore's counted crossings. They are study-view detail, not a native identity gate. **[addition: presentation team zone]** A broad TEAM chest sash is taken from the current vector torso zone. Reed green remains the hood's dominant color.

## Shared source contract

Claude's committed Round 4 art direction and character handoff guide the Riverworks Diorama planes, warm key/cool fill/copper rim, separate TEAM material, −Y forward axis, Z=0 ground anchor, and 60 fps authoring. Their headers call them proposals; the character handoff describes only Coilblade, Mossguard, and Copperskiff. It is not approval for these additions.

The native contract comes from the later executed standalone model reviews: 50° camera pitch, one 8.025 orthographic scale, 256×256 RGBA raw renders reduced by an alpha-weighted 4× area filter to 64×64, and a fixed ground anchor at (32,54). Camera labels must be derived from the actual projected actor-forward −Y axis. The generator uses the same physical model for all headings. No per-view resize, fit, crop, or mirroring is allowed.

Each actor has its own editable mesh collection, transform pivots, per-character `.blend`, and `.glb`. Geometry is authored directly in pivot-local coordinates. Export never moves a joint or parent to the origin. The strict preservation receipt retains unrounded local vertex values, topology, pivots, material node inputs, and sampled animation transforms before export, after export, after saved-scene load, and after rendering. A mismatch stops the run; no rounding or float normalization can make a mutation pass.

Each character uses at most eight authored materials including a material named exactly `TEAM`. Team rings use a solid round River perimeter and a six-cut Ember perimeter; they are native geometry in a separate presentation collection, excluded from actor GLB and counted separately in receipts; the 3,000-triangle cap also includes both ring variants in each saved character scene. Ring visibility and material state must restore exactly after each pass. Identity geometry has a hard cap of 3,000 evaluated triangles. No image texture or reference model is imported into Blender.

The proposed poses use the established art key ranges: idle 1/11/21/31, walk 41/51/61/71, attack 90/96/100/106, with contact at 100. Skymaul's walk clip is a hover sway. These are authored visual samples only; no new gameplay timing, movement speed, reach, or damage is asserted. The native study captures idle 1, walk 51, contact 100 for both teams and all four headings. The 12-column motion proposal is not a runtime implementation and this package does not integrate it.

## Gates still unexecuted

- Blender parses the generator and produces editable scenes/GLBs with the expected clip names.
- Every actor remains ≤3,000 evaluated triangles and ≤8 materials; all external image/texture references are absent.
- Strict local geometry/pivot/material/animation equality survives GLB export, save/reload, team recoloring, mask passes, and restored scene state.
- Actual forward projection yields north/up, east/right, south/down, west/left with the common anchor and camera.
- Every native cell keeps at least 2 px alpha-clear crop margin; body height is near 13 px without per-character camera scaling.
- Idle/walk/contact are visibly distinct, not merely byte-different; identity silhouette, grayscale team rings, and portrait continuity pass an independent blind critique.
- Final runtime integration, rendered phone/desktop screenshots, restore, reduced motion, and complete motion acceptance remain outside this source-only package.
