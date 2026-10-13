import hashlib
import json
import sys
from pathlib import Path

candidate = Path(sys.argv[1]).resolve()
output = Path(sys.argv[2]).resolve()
report_path = Path(sys.argv[3])
asset_rel = Path("game/public/assets/kilnkeeper-battle-sprite.webp")
asset = output / asset_rel
assert asset.is_file(), f"missing shipped asset from Pages output: {asset_rel}"
files = sorted(path.relative_to(output).as_posix() for path in output.rglob("*") if path.is_file())
prohibited_names = [
    "kilnkeeper-battle-sprite-v2.png",
    "kilnkeeper-battle-sprite.png",
    "kilnkeeper-portrait.png",
    "kilnkeeper-battle-sprite-provenance.json",
]
for token in prohibited_names:
    assert not any(token in path for path in files), f"unexpected source/provenance file shipped: {token}"
prohibited_dirs = {"reference", "artifacts", "demo", "docs", "node_modules"}
leaked = [path for path in files if prohibited_dirs.intersection(Path(path).parts)]
assert not leaked, f"unexpected non-shipping paths: {leaked}"
expected = (candidate / "public/assets/kilnkeeper-battle-sprite.webp").read_bytes()
actual = asset.read_bytes()
assert actual == expected, "Pages output WebP differs from candidate bytes"
result = {
    "candidate_root": str(candidate),
    "pages_output": str(output),
    "file_count": len(files),
    "release_bytes": sum((output / path).stat().st_size for path in files),
    "shipped_asset_path": asset_rel.as_posix(),
    "shipped_asset_sha256": hashlib.sha256(actual).hexdigest(),
    "shipped_asset_bytes": len(actual),
    "candidate_output_byte_identical": True,
    "source_pngs_and_provenance_omitted": True,
    "reference_demo_artifacts_docs_and_node_modules_omitted": True,
}
report_path.write_text(json.dumps(result, indent=2) + "\n")
print(json.dumps(result, indent=2))
