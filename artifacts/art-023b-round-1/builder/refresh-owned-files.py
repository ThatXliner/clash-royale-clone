from hashlib import sha256
from pathlib import Path

builder_dir = Path(__file__).resolve().parent
repo = builder_dir.parents[2]
ledger_path = builder_dir / "owned-files.sha256"
product_paths = [
    "src/ui/aether-well-art.js",
    "demo/aether-well-battle-art.html",
    "demo/aether-well-battle-art.js",
    "tests/aether-well-battle-art.test.js",
    "docs/art/aether-well-battle-art-provenance.json",
]
paths = {repo / path for path in product_paths}
paths.update(path for path in builder_dir.rglob("*") if path.is_file() and path != ledger_path and "__pycache__" not in path.parts)
lines = []
for path in sorted(paths, key=lambda item: item.relative_to(repo).as_posix()):
    data = path.read_bytes()
    lines.append(f"{sha256(data).hexdigest()} {len(data)} {path.relative_to(repo).as_posix()}")
ledger_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

for line in lines:
    digest, size, relative = line.split(" ", 2)
    data = (repo / relative).read_bytes()
    if sha256(data).hexdigest() != digest or len(data) != int(size):
        raise SystemExit(f"owned-file mismatch: {relative}")
print(f"OWNED_FILES_SHA256_PASS={len(lines)}")
