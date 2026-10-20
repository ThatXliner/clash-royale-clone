"""Reconstruct provenance from completed raw/native files and frozen audit receipts."""
from pathlib import Path
import hashlib
import json
import re
from PIL import Image

ROOT = Path("/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment")
RUN = ROOT / "run-20261020T180144Z"
REPO = Path("/Users/me/.codex/worktrees/9456/clash-royale-clone")
ATTEMPT = REPO / "design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044"
BLEND = ATTEMPT / "comparison/tapered_canopy/copperskiff.blend"
GLB = ATTEMPT / "comparison/tapered_canopy/copperskiff.glb"
MODEL_SOURCE = REPO / "design/20261020-redesign/astra-round-4/copperskiff_model.py"
HEADING_DIR = Path("/Users/me/.codex/clash-qualification/20261020-sprite-heading-audit")
HEADING = HEADING_DIR / "projection-receipt.json"
HEADING_RUN = HEADING_DIR


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_int(path):
    return int(Path(path).read_text(encoding="utf-8").strip())


def read_lines(path):
    return Path(path).read_text(encoding="utf-8").splitlines()


def hash_listing(path):
    result = {}
    for line in read_lines(path):
        digest, filename = line.split("  ", 1)
        result[filename] = digest
    return result

raw_images = []
for path in sorted((RUN / "raw-256").glob("*.png")):
    match = re.fullmatch(r"(river|ember)-(north|east|south|west)-(idle|contact)-256\.png", path.name)
    if not match:
        raise RuntimeError(f"Unexpected raw image name: {path.name}")
    with Image.open(path) as image:
        image.load()
        if image.size != (256, 256) or image.mode != "RGBA" or image.format != "PNG":
            raise RuntimeError(f"Unexpected raw image encoding at {path}: {image.format} {image.mode} {image.size}")
        image_record = {
            "team": match.group(1),
            "direction": match.group(2),
            "pose": match.group(3),
            "path": str(path),
            "sha256": sha256(path),
            "bytes": path.stat().st_size,
            "dimensions": list(image.size),
            "mode": image.mode,
            "format": image.format,
        }
        raw_images.append(image_record)
if len(raw_images) != 16:
    raise RuntimeError(f"Expected exactly 16 raw sprites; found {len(raw_images)}")
if len({(r["team"], r["direction"], r["pose"]) for r in raw_images}) != 16:
    raise RuntimeError("Raw sprite matrix does not contain 16 unique team/direction/pose combinations")

pre_hashes = hash_listing(RUN / "inputs-sha256-prelaunch.txt")
post_hashes = hash_listing(RUN / "inputs-sha256-postrun.txt")
blend_hash = sha256(BLEND)
glb_hash = sha256(GLB)
source_hash = sha256(MODEL_SOURCE)
exe_pre = Path(RUN / "blender-executable-prelaunch.sha256").read_text(encoding="utf-8").split()[0]
exe_post = Path(RUN / "blender-executable-postrun.sha256").read_text(encoding="utf-8").split()[0]
frozen_expected = len(read_lines(ATTEMPT / "frozen-sha256.txt"))
frozen_pre_output = read_lines(RUN / "frozen-delivery-check-prelaunch.txt")
frozen_post_output = read_lines(RUN / "frozen-delivery-check-postrun.txt")

native = json.loads((RUN / "native-evidence-receipt.json").read_text(encoding="utf-8"))
heading = json.loads(HEADING.read_text(encoding="utf-8"))
heading_signs = [{
    "saved_camera_label": item["saved_camera_label"],
    "bow_minus_stern_native64_top_origin_pixels": item["bow_minus_stern_native64_top_origin_pixels"],
    "projected_facing": item["facing_from_dominant_projected_axis"],
    "matches_saved_camera_label": item["contract_matches_camera_label"],
} for item in heading["bow_stern_projections"]]

stdout = (RUN / "blender-stdout.raw.txt").read_text(encoding="utf-8", errors="replace")
rendered_event_count = sum(1 for line in stdout.splitlines() if line.startswith("rendered "))
blender_exit = read_int(RUN / "blender-direct-exit-code.txt")
post_exit = read_int(RUN / "postprocess-direct-exit-code.txt")

receipt = {
    "status": "reconstructed evidence receipt; 16 raw renders completed; Blender post-render JSON serialization failed",
    "scope": "selected frozen R4 tapered_canopy Copperskiff only; 2 teams x 4 saved camera labels x idle/contact",
    "run_directory": str(RUN),
    "raw_render_process": {
        "blender_version": "5.1.2",
        "pid": read_int(RUN / "blender-pid.txt"),
        "direct_exit_code": blender_exit,
        "argv_file": str(RUN / "blender-argv.txt"),
        "environment_file": str(RUN / "blender-environment.txt"),
        "stdout_raw": str(RUN / "blender-stdout.raw.txt"),
        "stderr_raw": str(RUN / "blender-stderr.raw.txt"),
        "rendered_event_count": rendered_event_count,
        "raw_sprite_count": len(raw_images),
        "raw_sprites": raw_images,
        "post_render_failure": "Blender completed all 16 writes, then json.dumps(receipt) raised TypeError: Object of type Scene is not JSON serializable for stored_scene_names. The process therefore exited 1 and did not write fresh-render-receipt.json.",
    },
    "native_derivation": {
        "status": native["status"],
        "postprocess_pid": read_int(RUN / "postprocess-pid.txt"),
        "direct_exit_code": post_exit,
        "stdout_raw": str(RUN / "postprocess-stdout.raw.txt"),
        "stderr_raw": str(RUN / "postprocess-stderr.raw.txt"),
        "native_receipt": str(RUN / "native-evidence-receipt.json"),
        "native_receipt_sha256": sha256(RUN / "native-evidence-receipt.json"),
        "native_sprite_count": native["native_sprite_count"],
        "native_sheet": native["native_sheet"],
        "arena_context_sheet": native["arena_context_sheet"],
        "contact_pixel_differences": native["contact_pixel_differences"],
        "visible_alpha_bounds_threshold_16": [{
            "team": item["team"], "direction": item["direction"], "pose": item["pose"],
            **item["native_64"]["alpha_bounds_threshold_16"],
        } for item in native["renders"]],
    },
    "saved_camera_projection_audit": {
        "status": heading["status"],
        "receipt_path": str(HEADING),
        "receipt_sha256": sha256(HEADING),
        "blender_version": heading["blender_version"],
        "blender_pid": heading["blender_pid"],
        "direct_exit_code": read_int(HEADING_RUN / "attempt-3-direct-exit-code.txt"),
        "stdout_raw": str(HEADING_RUN / "attempt-3-blender-stdout.raw.txt"),
        "stderr_raw": str(HEADING_RUN / "attempt-3-blender-stderr.raw.txt"),
        "blend_sha256_before": heading["blend_sha256_before"],
        "blend_sha256_after": heading["blend_sha256_after"],
        "inputs_unchanged": heading["inputs_unchanged"],
        "scene": heading["scene"],
        "stored_camera_contract": heading["scene_sprite_camera_contract"],
        "placement_forward_axis": heading["placement_forward_axis_property"],
        "hull_forward_world": heading["hull_forward_world"],
        "measured_idle_heading_signs": [item for item in heading_signs if item["saved_camera_label"]],
    },
    "integrity_fences": {
        "frozen_manifest_entry_count": frozen_expected,
        "frozen_precheck_line_count": sum(1 for line in frozen_pre_output if line.endswith(": OK")),
        "frozen_postcheck_line_count": sum(1 for line in frozen_post_output if line.endswith(": OK")),
        "frozen_precheck_failed": any("FAILED" in line or "No such file" in line for line in frozen_pre_output),
        "frozen_postcheck_failed": any("FAILED" in line or "No such file" in line for line in frozen_post_output),
        "all_hashed_inputs_identical_pre_post": pre_hashes == post_hashes,
        "blend_sha256": blend_hash,
        "glb_sha256": glb_hash,
        "model_source_sha256": source_hash,
        "blender_executable_sha256_prelaunch": exe_pre,
        "blender_executable_sha256_postrun": exe_post,
        "blender_executable_hash_identical": exe_pre == exe_post,
        "blender_pid": read_int(RUN / "blender-pid.txt"),
    },
    "prior_preserved_setup_failure": {
        "run_directory": str(ROOT / "run-20261020T180055Z"),
        "blender_pid": read_int(ROOT / "run-20261020T180055Z/blender-pid.txt"),
        "direct_exit_code": read_int(ROOT / "run-20261020T180055Z/blender-direct-exit-code.txt"),
        "failure": "The first audit script tried to project the copperskiff_body Empty as a mesh; no render occurred.",
    },
}
output = RUN / "reconstructed-render-evidence-receipt.json"
output.write_text(json.dumps(receipt, indent=2) + "\n", encoding="utf-8")
print(json.dumps({
    "receipt": str(output),
    "raw_sprite_count": len(raw_images),
    "all_raw_rgba_256": all(item["format"] == "PNG" and item["mode"] == "RGBA" and item["dimensions"] == [256, 256] for item in raw_images),
    "blender_exit": blender_exit,
    "postprocess_exit": post_exit,
    "input_hashes_unchanged": pre_hashes == post_hashes,
    "blender_hash_unchanged": exe_pre == exe_post,
    "measured_idle_heading_signs": heading_signs,
}, indent=2))
