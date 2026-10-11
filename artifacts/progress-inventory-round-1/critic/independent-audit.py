from __future__ import annotations

import hashlib
import html
import json
import re
import shutil
import subprocess
import tempfile
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = Path(__file__).resolve().parent
FROZEN_SCRIPT_COMMIT = "fb06624889a379a0bb5e9ffb72b02225900910ac"
FROZEN_PLAN_COMMIT = "8ba1c38420644b9befd8fa7ffe194b20abacf3c2"


def git_show(rev_path: str) -> bytes:
    return subprocess.run(
        ["git", "show", rev_path], cwd=ROOT, check=True, stdout=subprocess.PIPE
    ).stdout


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def valid_plan_rows(plan: str) -> list[dict[str, str]]:
    id_pattern = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*$")
    states = {"PENDING", "BUILDING", "FAIL", "PASS", "QUESTION", "BLOCKED"}
    rows = []
    for line in plan.splitlines():
        if not (line.startswith("|") and line.endswith("|")):
            continue
        cells = [cell.strip() for cell in line.split("|")[1:-1]]
        if (
            len(cells) != 8
            or not id_pattern.fullmatch(cells[0])
            or not cells[1]
            or cells[4] not in states
            or not re.fullmatch(r"\d+/\d+", cells[5])
            or not re.fullmatch(r"\d+", cells[6])
        ):
            continue
        rows.append(dict(zip(("id", "piece", "acceptance", "depends", "state", "passRate", "roundCount", "gap"), cells)))
    return rows


class ProgressParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_tbody = False
        self.in_row = False
        self.in_cell = False
        self.in_ol = False
        self.in_li = False
        self.rows: list[list[str]] = []
        self.row: list[str] = []
        self.cell: list[str] = []
        self.items: list[str] = []
        self.item: list[str] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        if tag == "tbody":
            self.in_tbody = True
        elif tag == "tr" and self.in_tbody:
            self.in_row = True
            self.row = []
        elif tag == "td" and self.in_row:
            self.in_cell = True
            self.cell = []
        elif tag == "ol":
            self.in_ol = True
        elif tag == "li" and self.in_ol:
            self.in_li = True
            self.item = []
        elif tag == "br" and self.in_li:
            self.item.append(" ")

    def handle_endtag(self, tag: str) -> None:
        if tag == "td" and self.in_cell:
            self.row.append("".join(self.cell))
            self.in_cell = False
        elif tag == "tr" and self.in_row:
            self.rows.append(self.row)
            self.in_row = False
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "li" and self.in_li:
            self.items.append(clean("".join(self.item)))
            self.in_li = False
        elif tag == "ol":
            self.in_ol = False

    def handle_data(self, data: str) -> None:
        if self.in_cell:
            self.cell.append(data)
        if self.in_li:
            self.item.append(data)


def expected_trajectories(rounds: str) -> list[str]:
    pattern = re.compile(
        r"## Round (\d+) — ([^\n]+)\n\nPIECE: ([^\n]+)\n\n"
        r"VERDICT: (PASS|FAIL)\n\nEVIDENCE: ([\s\S]*?)\n\n"
        r"BIGGEST GAP: ([\s\S]*?)(?=\n\n(?:DISPOSITION:|## Round )|$)"
    )
    result = []
    for match in pattern.finditer(rounds):
        result.append(clean(f"R{match[1]} {match[4]} · {match[3]} {match[6]}"))
    return result


def run_generator(script: bytes, plan: str, rounds: str) -> tuple[str, subprocess.CompletedProcess[str]]:
    root = Path(tempfile.mkdtemp(prefix="progress-inventory-audit-"))
    (root / "scripts").mkdir()
    (root / "scripts" / "render-progress.js").write_bytes(script)
    (root / "PLAN.md").write_text(plan, encoding="utf-8")
    (root / "rounds.md").write_text(rounds, encoding="utf-8")
    result = subprocess.run(
        ["node", str(root / "scripts" / "render-progress.js")],
        cwd=root,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )
    generated = (root / "progress.html").read_text(encoding="utf-8") if result.returncode == 0 else ""
    return generated, result


frozen_script = git_show(f"{FROZEN_SCRIPT_COMMIT}:scripts/render-progress.js")
plan_bytes = git_show(f"{FROZEN_PLAN_COMMIT}:PLAN.md")
rounds_bytes = git_show(f"{FROZEN_PLAN_COMMIT}:rounds.md")
plan = plan_bytes.decode("utf-8")
rounds = rounds_bytes.decode("utf-8")
real_progress = (ROOT / "progress.html").read_bytes()
real_progress_before = sha(real_progress)

# Run the named repository test exactly as requested and preserve its full output.
test_result = subprocess.run(
    ["node", "--test", "tests/render-progress.test.js"],
    cwd=ROOT,
    text=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.STDOUT,
)
(EVIDENCE / "render-progress-test.txt").write_text(test_result.stdout, encoding="utf-8")

expected_rows = valid_plan_rows(plan)
generated, generated_result = run_generator(frozen_script, plan, rounds)
(EVIDENCE / "generated-progress.html").write_text(generated, encoding="utf-8")
parser = ProgressParser()
parser.feed(generated)
rendered_rows = [dict(zip(("id", "piece", "state", "passRate", "roundCount", "gap"), row)) for row in parser.rows]
expected_render_rows = [
    {key: row[key] for key in ("id", "piece", "state", "passRate", "roundCount", "gap")}
    for row in expected_rows
]
row_matches = rendered_rows == expected_render_rows
expected_ids = [row["id"] for row in expected_rows]
rendered_ids = [row["id"] for row in rendered_rows]
expected_trajectory = expected_trajectories(rounds)
trajectory_matches = parser.items == expected_trajectory
num_values = [int(value) for value in re.findall(r'<div class="num">(\d+)</div>', generated)]
state_counts = Counter(row["state"] for row in expected_rows)
categories = ("CARDS", "ART", "APP", "PUB", "SKILL", "PROGRESS", "RELEASE-GUARD")
category_rows = {
    category: [row["id"] for row in expected_rows if row["id"].startswith(category + "-")]
    for category in categories
}

# Probe the frozen renderer directly with one structurally malformed row and a valid unknown prefix.
probe_plan = "\n".join([
    "| ID | Piece | Independent acceptance bar | Depends on | State | Pass rate | Rounds | Current gap |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- |",
    "| MOSS-007 | Unknown prefix | focused acceptance | — | FAIL | 1/2 | 1 | Needs a fix |",
    "| SHORT-004 | Missing gap cell | focused acceptance | — | PASS | 1/1 | 1 |",
    "| MALFORMED-003 | Missing the rest of the columns |",
    "| BADSTATE-005 | Invalid state | focused acceptance | — | UNKNOWN | 1/1 | 1 | Ignore this |",
])
probe_rounds = "## Round 1 — 2026-10-10\n\nPIECE: MOSS-007 — Unknown prefix\n\nVERDICT: PASS\n\nEVIDENCE: Probe.\n\nBIGGEST GAP: None.\n"
probe_html, probe_result = run_generator(frozen_script, probe_plan, probe_rounds)
probe_parser = ProgressParser()
probe_parser.feed(probe_html)
probe_ids = [row[0] for row in probe_parser.rows]

real_progress_after = sha((ROOT / "progress.html").read_bytes())
script_current = (ROOT / "scripts" / "render-progress.js").read_bytes()
test_current = (ROOT / "tests" / "render-progress.test.js").read_bytes()
script_frozen_test = git_show(f"{FROZEN_SCRIPT_COMMIT}:tests/render-progress.test.js")

report = {
    "piece": "PROGRESS-001",
    "frozenInputs": {
        "scriptCommit": FROZEN_SCRIPT_COMMIT,
        "planAndRoundsCommit": FROZEN_PLAN_COMMIT,
        "scriptSha256": sha(frozen_script),
        "planSha256": sha(plan_bytes),
        "roundsSha256": sha(rounds_bytes),
        "workingScriptMatchesFrozen": script_current == frozen_script,
        "workingTestMatchesFrozen": test_current == script_frozen_test,
    },
    "test": {
        "command": "node --test tests/render-progress.test.js",
        "exitCode": test_result.returncode,
        "passed": test_result.returncode == 0,
        "outputFile": "render-progress-test.txt",
    },
    "independentFullInventory": {
        "generatorExitCode": generated_result.returncode,
        "generatorStdout": generated_result.stdout,
        "generatorStderr": generated_result.stderr,
        "validPlanRowCount": len(expected_rows),
        "renderedTableRowCount": len(rendered_rows),
        "uniqueExpectedIdCount": len(set(expected_ids)),
        "uniqueRenderedIdCount": len(set(rendered_ids)),
        "duplicateExpectedIds": sorted(key for key, count in Counter(expected_ids).items() if count > 1),
        "missingIds": [piece_id for piece_id in expected_ids if piece_id not in rendered_ids],
        "unexpectedIds": [piece_id for piece_id in rendered_ids if piece_id not in expected_ids],
        "rowsAndRenderedValuesMatchExactly": row_matches,
        "stateCounts": dict(sorted(state_counts.items())),
        "categoryCounts": {category: len(ids) for category, ids in category_rows.items()},
        "categoryIds": category_rows,
        "summaryNumbers": num_values,
        "summaryNumbersMatchTrackedPassedRoundsQuestions": num_values == [
            len(expected_rows), state_counts.get("PASS", 0), len(expected_trajectory), state_counts.get("QUESTION", 0)
        ],
        "roundTrajectoryCount": len(expected_trajectory),
        "renderedRoundTrajectoryCount": len(parser.items),
        "roundTrajectoriesMatchExactly": trajectory_matches,
        "roundTrajectoryFirst": parser.items[0] if parser.items else None,
        "roundTrajectoryLast": parser.items[-1] if parser.items else None,
        "allRenderedRows": rendered_rows,
        "generatedHtmlSha256": sha(generated.encode("utf-8")),
        "generatedHtmlBytes": len(generated.encode("utf-8")),
        "generatedHtmlFile": "generated-progress.html",
    },
    "manualProbe": {
        "generatorExitCode": probe_result.returncode,
        "expectedVisibleIds": ["MOSS-007"],
        "renderedIds": probe_ids,
        "unknownPrefixIncluded": "MOSS-007" in probe_ids,
        "structuralInvalidRowExcluded": "SHORT-004" not in probe_ids and "MALFORMED-003" not in probe_ids,
        "invalidStateExcluded": "BADSTATE-005" not in probe_ids,
        "noSourceTestAdded": True,
    },
    "realProgressHtml": {
        "sha256Before": real_progress_before,
        "sha256After": real_progress_after,
        "unchanged": real_progress_before == real_progress_after,
    },
    "verdict": "PASS" if (
        test_result.returncode == 0
        and generated_result.returncode == 0
        and row_matches
        and trajectory_matches
        and probe_result.returncode == 0
        and probe_ids == ["MOSS-007"]
        and real_progress_before == real_progress_after
    ) else "FAIL",
}


(EVIDENCE / "audit-report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
summary = {
    "verdict": report["verdict"],
    "testPassed": report["test"]["passed"],
    "validRows": report["independentFullInventory"]["validPlanRowCount"],
    "renderedRows": report["independentFullInventory"]["renderedTableRowCount"],
    "stateCounts": report["independentFullInventory"]["stateCounts"],
    "categoryCounts": report["independentFullInventory"]["categoryCounts"],
    "rounds": report["independentFullInventory"]["roundTrajectoryCount"],
    "rowsExact": row_matches,
    "trajectoriesExact": trajectory_matches,
    "probe": report["manualProbe"],
    "realProgressUnchanged": report["realProgressHtml"]["unchanged"],
}
print(json.dumps(summary, indent=2))
