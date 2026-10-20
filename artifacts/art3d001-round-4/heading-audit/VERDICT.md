PIECE: Copperskiff saved sprite-facing labels
VERDICT: PASS

The four stored camera labels match the direction the actor faces in the rendered atlas. The probe loaded the stored scene `ME_20261020_copperskiff_round_4_tapered_canopy`, selected the actual Copperskiff root by `card_id`, and resolved each camera through the saved `sprite_camera_contract.camera_names`. It projected the evaluated mesh centroids of `ME_20261020_copperskiff_spout_mouth.002` / `ME_20261020_copperskiff_spout_mouth_mesh.002` (bow) and `ME_20261020_copperskiff_pusher_disc.002` / `ME_20261020_copperskiff_pusher_disc_mesh.002` (stern). Pixel Y below is top-origin, so negative delta means up.

| Saved camera label | Bow (x, y) px | Stern (x, y) px | Bow − stern (dx, dy) px | Facing |
|---|---:|---:|---:|---|
| east | (40.4297, 48.4124) | (25.1773, 49.2838) | (+15.2523, −0.8715) | right / east |
| west | (23.5703, 48.4124) | (38.8227, 49.2838) | (−15.2523, −0.8715) | left / west |
| north | (32.0000, 41.9549) | (32.0000, 54.5103) | (−0.0000, −12.5554) | up / north |
| south | (32.0000, 54.8698) | (32.0000, 44.0573) | (0.0000, +10.8125) | down / south |

The saved root has forward axis `-Y`, unit scale and zero rotation; evaluated body and hull parent rotations are also zero. The four saved camera world positions/forward vectors are preserved in `projection-receipt.json`, so the signs above come from the saved camera projections plus the complete evaluated object hierarchy, with screen-Y inversion applied.

Asset: `design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/copperskiff.blend`, SHA-256 before and after `3c4b0fe72fac569a575e02ac142d8d838b74a734a95f0ba2e5f2a9fd343cffac`.

Source snapshot IDs: `source/round2_pipeline.py` SHA-256 `a544542f99b666739f75df6a2e3dc8d39bd19e957d5a193e84d8fa85f294bc89`; `source/alternatives.json` SHA-256 `510f94a8fa844cc34188d4da190dd92a441f5b1978c9ecfbd2b570f98aa6fa73`; `source/copperskiff_model.py` SHA-256 `ee2a847414de7918bd11c78faa8005de612452a6ec6911424560a73706e587b3`. These match the live `astra-round-4` source files. The selected scene's stored contract has east 270°, west 90°, north 180°, south 0°.

Image evidence: the four 64×64 builder-native images are in `design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044/comparison/tapered_canopy/native-64/`; the four fresh independent 64×64 renders are in `/Users/me/.codex/clash-qualification/20261020-model-r4-critic/run-20261020T173636Z/native-64/tapered_canopy/`; the corresponding builder raw 256×256 east, west, north, and south idle renders are in `.../comparison/tapered_canopy/raw-256/`. I visually checked these PNGs; their visible bow/propeller placement agrees with the projected signs.

Run fence: Blender 5.1.2, PID 90334, allowlisted environment recorded in the receipt, direct exit code 0 in `attempt-3-direct-exit-code.txt`, stdout/stderr preserved as `attempt-3-blender-stdout.raw.txt` and `attempt-3-blender-stderr.raw.txt`. Before/after SHA-256 listings in `attempt-3-input-before.sha256` and `attempt-3-input-after.sha256` are identical; the receipt also records `inputs_unchanged: true`. No render or save occurred. Two earlier setup failures and their raw logs/exits are retained in this directory.

This verdict covers the cardinal saved-camera label contract only; it makes no overall model-quality or integration claim.
