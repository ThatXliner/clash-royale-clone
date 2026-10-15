#!/usr/bin/env python3
"""Verify and record the CARDS023K-on-HBR assembly without running tests."""

from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
OUT = Path(__file__).resolve().parent
MAIN = "950c2b8780521234aa6ab08af677f4892794eebb"
HBR = "44e69d6b5fe0aad9a55f958bb8ce460fe877aa28"
HBR_LAYER = "22fc972fcba5357957ffacfe43c59662f95344b2"
K23 = "95cce2f7a154ab7137d679fcf07092e03cfc7f70"
K23_LAYER = "d87319857f48534a1d207fc3610c1f4ecdb3de99"
OLD_BASE = "ff562bd3027f40509f0e5e7e6f9848d98faf6346"
SCOPE = ["src", "tests", "scripts", "dist", "package.json", "package-lock.json"]
HBR_PATHS = [
    "src/content/cards/buildings-resource.js",
    "src/content/session-card-catalog.js",
    "src/sim/session-building-profile-receipts.js",
    "src/sim/session-building-runtime.js",
    "tests/game-building-policy.test.js",
    "tests/game-building-runtime.test.js",
    "tests/game-roster-buildings.test.js",
]
K23_PATHS = [
    "src/content/editable-deck.js",
    "src/rl/environment.js",
    "tests/cards023k-aether-well.test.js",
    "tests/editable-deck.test.js",
    "tests/rl-environment.test.js",
]
MAIN_UNCHANGED = [
    "artifacts/publication-91b99fb/github-pages-run.json",
    "artifacts/publication-91b99fb/live-http-receipt.json",
]


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True,
                          stdout=subprocess.PIPE).stdout


def tree(revision, prefixes):
    raw = git("ls-tree", "-r", "-z", "--full-tree", revision, "--", *prefixes)
    entries = {}
    for record in raw.split(b"\0"):
        if not record:
            continue
        metadata, name = record.split(b"\t", 1)
        mode, kind, oid = metadata.decode("ascii").split(" ")
        entries[name.decode("utf-8")] = {"mode": mode, "kind": kind, "oid": oid}
    return entries


def file_delta(before, after):
    result = []
    for path in sorted(before.keys() | after.keys()):
        left, right = before.get(path), after.get(path)
        if left == right:
            continue
        status = "A" if left is None else "D" if right is None else "M"
        result.append({"path": path, "status": status,
                       "before": None if left is None else left["oid"],
                       "after": None if right is None else right["oid"]})
    return result


def blob_bytes(revision, path):
    entry = tree(revision, [path]).get(path)
    if entry is None:
        raise AssertionError(f"{revision} has no tracked blob at {path}")
    return git("cat-file", "blob", entry["oid"])


def write_json(name, value):
    (OUT / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def main():
    head = git("rev-parse", "HEAD").decode().strip()
    if head != K23_LAYER:
        raise AssertionError(f"expected exact candidate source commit {K23_LAYER}, got {head}")

    main_tree = tree(MAIN, SCOPE)
    candidate_tree = tree(head, SCOPE)
    main_delta = file_delta(main_tree, candidate_tree)
    allowed = set(HBR_PATHS) | set(K23_PATHS)
    actual_changed = {entry["path"] for entry in main_delta}
    if actual_changed != allowed:
        raise AssertionError(f"unexpected source/test delta vs main: {sorted(actual_changed ^ allowed)}")

    checksum_rows = []
    identity_checks = []
    for role, source_revision, paths in [
        ("HBR", HBR, HBR_PATHS),
        ("CARDS023K", K23, K23_PATHS),
    ]:
        source_tree = tree(source_revision, paths)
        for path in paths:
            expected = source_tree.get(path)
            actual = candidate_tree.get(path)
            if expected is None or actual != expected:
                raise AssertionError(f"{role} blob differs from its frozen source: {path}")
            content = git("cat-file", "blob", actual["oid"])
            checksum_rows.append({
                "role": role,
                "path": path,
                "sourceRevision": source_revision,
                "blobOid": actual["oid"],
                "sha256": hashlib.sha256(content).hexdigest(),
            })
            identity_checks.append({"role": role, "path": path,
                                     "matchesSourceBlob": True,
                                     "blobOid": actual["oid"]})

    src_delta = file_delta(tree(MAIN, ["src"]), tree(head, ["src"]))
    test_delta = file_delta(tree(MAIN, ["tests"]), tree(head, ["tests"]))
    if {entry["path"] for entry in src_delta} != {
        path for path in allowed if path.startswith("src/")
    }:
        raise AssertionError("production source outside the explicit six source paths changed")
    if {entry["path"] for entry in test_delta} != {
        path for path in allowed if path.startswith("tests/")
    }:
        raise AssertionError("tests outside the explicit five test paths changed")

    for prefix in ["scripts", "dist", "package.json", "package-lock.json"]:
        if tree(MAIN, [prefix]) != tree(head, [prefix]):
            raise AssertionError(f"main {prefix} changed in the candidate")

    main_artifacts = tree(MAIN, ["artifacts"])
    candidate_artifacts = tree(head, ["artifacts"])
    lost_or_changed_artifacts = [
        path for path, entry in main_artifacts.items()
        if candidate_artifacts.get(path) != entry
    ]
    if lost_or_changed_artifacts:
        raise AssertionError(f"existing main artifacts changed: {lost_or_changed_artifacts[:12]}")
    for path in MAIN_UNCHANGED:
        if candidate_artifacts.get(path) != main_artifacts.get(path):
            raise AssertionError(f"accepted publication stamp changed: {path}")

    old_tree = tree(OLD_BASE, [])
    main_full_tree = tree(MAIN, [])
    old_delta = file_delta(old_tree, main_full_tree)
    with (OUT / "baseline-vs-ff562.name-status.tsv").open("w") as stream:
        for entry in old_delta:
            stream.write(f"{entry['status']}\t{entry['path']}\t"
                         f"{entry['before'] or '-'}\t{entry['after'] or '-'}\n")
    (OUT / "baseline-vs-ff562.stat.txt").write_bytes(
        git("diff", "--stat", "--no-renames", OLD_BASE, MAIN))
    (OUT / "baseline-vs-ff562.raw.txt").write_bytes(
        git("diff", "--raw", "--no-abbrev", "--no-renames", OLD_BASE, MAIN))

    counts = Counter(entry["status"] for entry in old_delta)
    write_json("candidate-source-delta.json", {
        "mainCommit": MAIN,
        "candidateSourceCommit": head,
        "baselineCommit": HBR_LAYER,
        "changedPathCount": len(main_delta),
        "changedPaths": main_delta,
        "hbrLayerPaths": HBR_PATHS,
        "cards023kPaths": K23_PATHS,
        "scriptsDistAndPackageEqualMain": True,
        "allOtherSourceAndTestsEqualMain": True,
        "allMainArtifactsPreserved": True,
        "retainedPublicationStamps": MAIN_UNCHANGED,
    })
    write_json("blob-checksum-ledger.json", {
        "candidateSourceCommit": head,
        "mainCommit": MAIN,
        "frozenHbrSourceCommit": HBR,
        "frozenCards023kSourceCommit": K23,
        "entries": checksum_rows,
        "allSourceBlobsMatched": True,
    })
    write_json("baseline-vs-ff562.summary.json", {
        "oldBase": OLD_BASE,
        "currentMain": MAIN,
        "changedPathCount": len(old_delta),
        "statusCounts": dict(sorted(counts.items())),
        "allChangedPathsRecorded": True,
        "fullPathAndBlobLedger": "baseline-vs-ff562.name-status.tsv",
        "rawGitBlobDelta": "baseline-vs-ff562.raw.txt",
        "diffStat": "baseline-vs-ff562.stat.txt",
    })
    write_json("source-fence.json", {
        "baselineRevision": MAIN,
        "candidateRevision": head,
        "scope": SCOPE,
        "filesBefore": len(main_tree),
        "filesAfter": len(candidate_tree),
        "changedPaths": main_delta,
        "productionSourceUnownedChanges": [],
        "testUnownedChanges": [],
        "scriptsDistPackageChanges": [],
    })
    write_json("source-fence-before.json", main_tree)
    write_json("source-fence-after.json", candidate_tree)
    write_json("artifact-preservation.json", {
        "mainRevision": MAIN,
        "candidateSourceCommit": head,
        "mainArtifactFileCount": len(main_artifacts),
        "candidateArtifactFileCount": len(candidate_artifacts),
        "allMainArtifactBlobsPreserved": True,
        "changedOrMissingMainArtifacts": [],
        "newArtifactsAtCandidateSourceCommit": sorted(
            set(candidate_artifacts) - set(main_artifacts)),
        "retainedPublicationStamps": [
            {"path": path, "blobOid": candidate_artifacts[path]["oid"]}
            for path in MAIN_UNCHANGED
        ],
    })
    print(json.dumps({
        "candidateSourceCommit": head,
        "changedMainPaths": len(main_delta),
        "oldBaselineDiffPaths": len(old_delta),
        "oldBaselineStatusCounts": dict(sorted(counts.items())),
        "hbrBlobsMatched": len(HBR_PATHS),
        "cards023kBlobsMatched": len(K23_PATHS),
    }, sort_keys=True))


if __name__ == "__main__":
    main()
