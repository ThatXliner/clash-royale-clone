#!/usr/bin/env python3
"""Create an external capture-only copy of the historical six-status test."""
from __future__ import annotations

import difflib
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sys


TEST_RELATIVE = Path("tests/game-roster-troops-status.test.js")
RUNNER_RELATIVE = Path("tests/game-roster-troops-status-runner.js")
PACKAGE_RELATIVE = Path("package.json")
TARGET_SELECTOR = 'test("game roster troop status: deterministic session continuation hashes stay stable", () => {'
IMPORT_MARKER = 'import test from "node:test";'
MAKE_SESSION_LINE = "    const { session, slot } = makeSession(id);"
HASH_LINE = "    hashes.push({ id, replay: hash(session.replayBytes()), snapshot: hash(session.serialize()) });"


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_source(root: Path, relative: Path) -> bytes:
    path = root / relative
    if not path.is_file():
        raise SystemExit(f"required exact historical source missing: {path}")
    return path.read_bytes()


def module_closure(root: Path, entry: Path) -> list[Path]:
    """Follow literal relative JS imports, keeping exact executed src bytes."""
    pending = [entry]
    seen: set[Path] = set()
    import_re = re.compile(r"(?:from\s*|import\s*\()\s*['\"](\.{1,2}/[^'\"]+)['\"]")
    while pending:
        relative = pending.pop()
        if relative in seen:
            continue
        seen.add(relative)
        payload = read_source(root, relative)
        text = payload.decode("utf-8")
        for specifier in import_re.findall(text):
            target = (relative.parent / specifier).as_posix()
            normalized = Path(os.path.normpath(target))
            if normalized.suffix != ".js":
                normalized = Path(f"{normalized}.js")
            if normalized.parts[0] == "src":
                pending.append(normalized)
    return sorted(seen, key=lambda path: path.as_posix())


def instrument(source: str) -> str:
    if source.count(IMPORT_MARKER) != 1:
        raise SystemExit("expected exactly one node:test import marker")
    source = source.replace(IMPORT_MARKER,
        IMPORT_MARKER + '\nimport { writeFileSync } from "node:fs";\n' +
        'import { join } from "node:path";', 1)
    start = source.find(TARGET_SELECTOR)
    if start < 0:
        raise SystemExit("exact six-status target selector not found")
    next_test = source.find("\ntest(", start + len(TARGET_SELECTOR))
    end = len(source) if next_test < 0 else next_test
    block = source[start:end]
    if block.count(MAKE_SESSION_LINE) != 1 or block.count(HASH_LINE) != 1:
        raise SystemExit("target test shape changed; refusing non-exact instrumentation")
    block = block.replace(MAKE_SESSION_LINE,
                          "    const { session, setup, slot } = makeSession(id);", 1)
    capture = '''    const replayBytes = session.replayBytes();
    const snapshotBytes = session.serialize();
    const replayEvents = session.replay;
    const state = session.state;
    const record = {
      id,
      setup,
      battleSetup: JSON.parse(setup.battleSetup),
      rosterWitness: JSON.parse(setup.rosterWitness),
      replayBytes,
      replayObject: JSON.parse(replayBytes),
      replayEvents,
      state,
      snapshotBytes,
      snapshot: JSON.parse(snapshotBytes),
    };
    writeFileSync(join(process.env.GTC_STATUS_VIEW_DIR, `${id}.json`),
      `${JSON.stringify(record, null, 2)}\\n`);
    hashes.push({ id, replay: hash(replayBytes), snapshot: hash(snapshotBytes) });'''
    block = block.replace(HASH_LINE, capture, 1)
    return source[:start] + block + source[end:]


def main() -> int:
    if len(sys.argv) != 3:
        raise SystemExit("usage: instrument_status_test.py SOURCE_ROOT DIAGNOSTIC_ROOT")
    root = Path(sys.argv[1]).resolve()
    output = Path(sys.argv[2]).resolve()
    copy_root = output / "diagnostic-copy"
    executed = output / "executed-source"
    source_test = read_source(root, TEST_RELATIVE).decode("utf-8")
    exact_files = [PACKAGE_RELATIVE, RUNNER_RELATIVE, TEST_RELATIVE,
                   *module_closure(root, TEST_RELATIVE)]
    records = []
    for relative in dict.fromkeys(exact_files):
        payload = read_source(root, relative)
        target = executed / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(payload)
        records.append({"source_path": str(root / relative),
                        "relative_path": relative.as_posix(),
                        "copy_path": str(target), "bytes": len(payload),
                        "sha256": sha(payload), "copy_sha256": sha(target.read_bytes())})

    diagnostic_test = instrument(source_test)
    diagnostic_test_path = copy_root / TEST_RELATIVE
    diagnostic_test_path.parent.mkdir(parents=True, exist_ok=True)
    diagnostic_test_path.write_text(diagnostic_test, encoding="utf-8")
    package_copy = copy_root / PACKAGE_RELATIVE
    package_copy.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(root / PACKAGE_RELATIVE, package_copy)
    source_link = copy_root / "src"
    source_link.symlink_to(root / "src", target_is_directory=True)
    original_path = executed / "diagnostic-copy-source.js"
    original_path.write_text(source_test, encoding="utf-8")
    diff_path = output / "capture-only-instrumentation.patch"
    diff = difflib.unified_diff(source_test.splitlines(True), diagnostic_test.splitlines(True),
                                fromfile="exact-test-source", tofile="external-capture-copy")
    diff_path.write_text("".join(diff), encoding="utf-8")
    metadata = {
        "label": "external diagnostic-only test copy; repository test is unchanged",
        "source_root": str(root),
        "source_test": str(root / TEST_RELATIVE),
        "source_test_sha256": sha(source_test.encode("utf-8")),
        "diagnostic_test": str(diagnostic_test_path),
        "diagnostic_test_sha256": sha(diagnostic_test.encode("utf-8")),
        "exact_source_files": records,
        "diagnostic_copy_source_copy": str(original_path),
        "diagnostic_copy_source_sha256": sha(original_path.read_bytes()),
        "capture_only_diff": str(diff_path),
        "setup_normalization": "none in this capture step",
        "original_hash_assertions_preserved": True,
        "test_selector": TARGET_SELECTOR.removeprefix('test("').removesuffix('", () => {'),
        "diagnostic_copy_src_symlink": str(source_link),
    }
    metadata_path = output / "instrumentation.json"
    metadata_path.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(metadata_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
