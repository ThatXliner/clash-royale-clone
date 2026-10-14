from pathlib import Path
import hashlib
import json
import subprocess
from PIL import Image

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
BASE = "407fd61c83f9f962280d363e85af364041c5f223"
REVEALED = "buried-coil-revealed-battle-sprite"
DOC_PATH = "docs/art/buried-coil-revealed-provenance.json"
SOURCE_PATH = "demo/assets/buried-coil-revealed.png"
SHIP_PATH = "public/assets/buried-coil-revealed.webp"
PROVENANCE = json.loads((ROOT / DOC_PATH).read_text())
RUN_RECORD = json.loads((OUT.parent / "builder/generation-and-failure-record.json").read_text())
PROMPT = (OUT.parent / "builder/final-imagegen-prompt.txt").read_text().rstrip("\n")

def sha(data):
    return hashlib.sha256(data).hexdigest()

def git_file(rev, path):
    return subprocess.check_output(["git", "show", f"{rev}:{path}"], cwd=ROOT)

def image_facts(path):
    image = Image.open(path)
    rgba = image.convert("RGBA")
    alpha = rgba.getchannel("A")
    bbox = alpha.getbbox()
    return {
        "format": image.format,
        "dimensions": [image.width, image.height],
        "alphaExtrema": list(alpha.getextrema()),
        "alphaVisibleBBoxHalfOpen": list(bbox) if bbox else None,
    }

source_bytes = (ROOT / SOURCE_PATH).read_bytes()
ship_bytes = (ROOT / SHIP_PATH).read_bytes()
source_meta = PROVENANCE["generated_source"]
ship_meta = PROVENANCE["shipped_output"]
input_meta = PROVENANCE["generation_settings"]["input_images"][0]
input_evidence = OUT.parent / "builder/refinement-pass-2-source.png"
input_evidence_bytes = input_evidence.read_bytes()
tool_output_path = Path(source_meta["tool_output_path"])
tool_output_exists = tool_output_path.is_file()
tool_output_sha = sha(tool_output_path.read_bytes()) if tool_output_exists else None

base_module = OUT / "visual-asset-manifest-base.js"
base_module.write_bytes(git_file(BASE, "src/content/visual-asset-manifest.js"))
base_import = base_module.as_uri()
current_import = (ROOT / "src/content/visual-asset-manifest.js").as_uri()
node_code = (
    "const old=await import(process.argv[1]);"
    "const cur=await import(process.argv[2]);"
    "console.log(JSON.stringify({base:old.createVisualAssetManifest(),current:cur.createVisualAssetManifest()}));"
)
manifest_raw = subprocess.check_output(
    ["node", "--input-type=module", "-e", node_code, base_import, current_import], cwd=ROOT
)
manifest_pair = json.loads(manifest_raw)
base_manifest = manifest_pair["base"]
current_manifest = manifest_pair["current"]
base_assets = {item["id"]: item for item in base_manifest["assets"]}
current_assets = {item["id"]: item for item in current_manifest["assets"]}
changed_records = []
for asset_id in sorted(set(base_assets) | set(current_assets)):
    old = base_assets.get(asset_id)
    new = current_assets.get(asset_id)
    if old != new:
        changed_records.append({"id": asset_id, "old": old, "new": new})
preserved_asset_checks = []
for asset_id, old in base_assets.items():
    if asset_id == REVEALED:
        continue
    new = current_assets.get(asset_id)
    path = ROOT / "public" / old["path"]
    actual = path.read_bytes()
    preserved_asset_checks.append({
        "id": asset_id,
        "baseRecordUnchanged": old == new,
        "candidateBytesMatchManifest": sha(actual) == new["sha256"] and len(actual) == new["byteLength"],
        "candidateMatchesBaseGitBlob": sha(actual) == sha(git_file(BASE, f"public/{old['path']}")),
    })

reencoded = OUT / "reencoded-from-final-source.webp"
encoder = subprocess.run(
    ["cwebp", "-q", "88", "-m", "6", "-mt", "-resize", "512", "512",
     str(ROOT / SOURCE_PATH), "-o", str(reencoded)],
    text=True, capture_output=True
)
(OUT / "cwebp-reencode.log").write_text(encoder.stdout + encoder.stderr)
reencoded_bytes = reencoded.read_bytes() if encoder.returncode == 0 else b""

portrait_path = "public/assets/buried-coil-portrait.webp"
hidden_path = "public/assets/buried-coil-hidden.webp"
preserved_target_assets = {}
for path in (portrait_path, hidden_path):
    data = (ROOT / path).read_bytes()
    baseline = git_file(BASE, path)
    preserved_target_assets[path] = {
        "sha256": sha(data),
        "bytes": len(data),
        "byteIdenticalToBaseCommit": data == baseline,
    }

checks = {
    "sourceShaMatchesProvenance": sha(source_bytes) == source_meta["sha256"],
    "sourceBytesMatchProvenance": len(source_bytes) == source_meta["bytes"],
    "sourceDimensionsMatchProvenance": image_facts(ROOT / SOURCE_PATH)["dimensions"] == [
        source_meta["dimensions"]["width"], source_meta["dimensions"]["height"]],
    "shippedShaMatchesProvenance": sha(ship_bytes) == ship_meta["sha256"],
    "shippedBytesMatchProvenance": len(ship_bytes) == ship_meta["bytes"],
    "shippedDimensionsMatchProvenance": image_facts(ROOT / SHIP_PATH)["dimensions"] == [
        ship_meta["dimensions"]["width"], ship_meta["dimensions"]["height"]],
    "sourceUnderOneMiB": len(source_bytes) <= 1_048_576,
    "shippedUnderOneMiB": len(ship_bytes) <= 1_048_576,
    "inputArtifactMatchesRecordedGenerationInput": sha(input_evidence_bytes) == input_meta["sha256"],
    "toolOutputPathMatchesFinalSource": tool_output_sha == sha(source_bytes) if tool_output_exists else None,
    "promptFileMatchesProvenance": PROMPT == PROVENANCE["prompt"],
    "licenseIsAgpl": PROVENANCE["license"] == "AGPL-3.0-only",
    "authorsToolAndModeRecorded": bool(PROVENANCE.get("authorship") and PROVENANCE.get("tool_source") and PROVENANCE.get("generation_mode")),
    "cwebpReencodeExact": encoder.returncode == 0 and reencoded_bytes == ship_bytes,
    "manifestCountsStable": len(base_assets) == len(current_assets),
    "onlyRevealedManifestRecordChanged": [item["id"] for item in changed_records] == [REVEALED],
    "onlyByteLengthAndShaChanged": bool(changed_records) and {
        key for key in changed_records[0]["old"] if changed_records[0]["old"][key] != changed_records[0]["new"][key]
    } == {"byteLength", "sha256"},
    "allNonRevealedManifestAssetsPreserved": all(
        row["baseRecordUnchanged"] and row["candidateBytesMatchManifest"] and row["candidateMatchesBaseGitBlob"]
        for row in preserved_asset_checks
    ),
    "portraitAndHiddenByteEqualBase": all(row["byteIdenticalToBaseCommit"] for row in preserved_target_assets.values()),
}
report = {
    "acceptedBase": BASE,
    "candidate": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    "assetSource": {"sha256": sha(source_bytes), "bytes": len(source_bytes), **image_facts(ROOT / SOURCE_PATH)},
    "assetOutput": {"sha256": sha(ship_bytes), "bytes": len(ship_bytes), **image_facts(ROOT / SHIP_PATH)},
    "inputEvidence": {"file": str(input_evidence.relative_to(ROOT)), "sha256": sha(input_evidence_bytes), "recordedSha256": input_meta["sha256"]},
    "imagegenToolOutput": {"exists": tool_output_exists, "sha256": tool_output_sha},
    "license": PROVENANCE["license"],
    "tool": {"source": PROVENANCE["tool_source"], "mode": PROVENANCE["generation_mode"]},
    "cwebp": {
        "version": subprocess.check_output(["cwebp", "-version"], text=True).strip(),
        "returncode": encoder.returncode,
        "reencodedSha256": sha(reencoded_bytes) if reencoded_bytes else None,
        "exactByteMatch": encoder.returncode == 0 and reencoded_bytes == ship_bytes,
    },
    "manifest": {
        "baseCount": len(base_assets), "candidateCount": len(current_assets),
        "changedRecords": changed_records,
        "preservedNonRevealedRecordCount": len(preserved_asset_checks),
        "preservedTargetAssets": preserved_target_assets,
        "allNonRevealedAssetsPreserved": all(
            row["baseRecordUnchanged"] and row["candidateBytesMatchManifest"] and row["candidateMatchesBaseGitBlob"]
            for row in preserved_asset_checks
        ),
    },
    "checks": checks,
    "allChecksPass": all(value for value in checks.values() if value is not None),
}
report_path = OUT / "asset-provenance-audit.json"
report_path.write_text(json.dumps(report, indent=2) + "\n")
print(json.dumps(report, indent=2))

