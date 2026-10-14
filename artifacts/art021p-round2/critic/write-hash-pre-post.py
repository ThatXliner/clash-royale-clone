from pathlib import Path
import hashlib
import subprocess

root = Path(__file__).resolve().parents[3]
out = Path(__file__).resolve().parent / "hash-pre-post.txt"
base = "407fd61c83f9f962280d363e85af364041c5f223"
candidate = subprocess.check_output(["git","rev-parse","HEAD"],cwd=root,text=True).strip()
paths = [
    "demo/assets/buried-coil-revealed.png",
    "public/assets/buried-coil-revealed.webp",
    "public/assets/buried-coil-hidden.webp",
    "public/assets/buried-coil-portrait.webp",
    "docs/art/buried-coil-revealed-provenance.json",
    "src/content/visual-asset-manifest.js",
]
lines = [f"accepted_base={base}", f"candidate={candidate}", ""]
for path in paths:
    before = subprocess.check_output(["git","show",f"{base}:{path}"],cwd=root)
    after = (root / path).read_bytes()
    digest = lambda data: hashlib.sha256(data).hexdigest()
    lines.append(f"{path}")
    lines.append(f"  base:      sha256={digest(before)} bytes={len(before)}")
    lines.append(f"  candidate: sha256={digest(after)} bytes={len(after)}")
    lines.append(f"  identical: {before == after}")
out.write_text("\n".join(lines)+"\n")
print(out.read_text(),end="")

