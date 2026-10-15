from hashlib import sha256
from pathlib import Path
import json

builder_dir = Path(__file__).resolve().parent
repo = builder_dir.parents[2]
provenance_path = repo / "docs/art/aether-well-battle-art-provenance.json"
provenance = json.loads(provenance_path.read_text(encoding="utf-8"))
for entry in provenance["sourceFiles"]:
    content = (repo / entry["path"]).read_bytes()
    entry["bytes"] = len(content)
    entry["sha256"] = sha256(content).hexdigest()
provenance_path.write_text(json.dumps(provenance, indent=2) + "\n", encoding="utf-8")

reloaded = json.loads(provenance_path.read_text(encoding="utf-8"))
for entry in reloaded["sourceFiles"]:
    content = (repo / entry["path"]).read_bytes()
    actual = sha256(content).hexdigest()
    if len(content) != entry["bytes"] or actual != entry["sha256"]:
        raise SystemExit(f"provenance mismatch: {entry['path']}")
print(f"PROVENANCE_SOURCE_CHECK_PASS={len(reloaded['sourceFiles'])}")
for entry in reloaded["sourceFiles"]:
    print(f"{entry['path']} bytes={entry['bytes']} sha256={entry['sha256']}")
