# Stormkite battle model source

This source bundle preserves Astra's original editable Blender model, its Python model builder, the atlas packer, the Blender build receipt and the complete frame-level provenance record. The packed atlas itself ships at `public/assets/stormkite-battle-sprite.png`.

The saved Blender model and builder were authored against source commit `3df9a311ca839823b28c7dce99c6bd2d913c72bf`, using Blender 5.1.2. The 16 raw 256 px renders and 16 reduced 64 px cells were produced in Astra's scratch build directory rather than copied into this source bundle; their individual hashes, clear margins, alpha bounds and pose-difference measurements remain in `stormkite-battle-sprite-provenance.json`.

The arena atlas uses a fixed 4 × 4 layout, 64 px cells and pivot `(32, 54)`. Columns are east, north, south and west; rows are ember idle/contact followed by river idle/contact. The contact pose is a static presentation cue selected from a canonical same-tick projectile contact record. It does not add attack timing, movement, collision or an effect to the simulation.
