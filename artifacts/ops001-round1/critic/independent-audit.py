from html.parser import HTMLParser
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = Path(__file__).resolve().parent
PLAN = (ROOT / "PLAN.md").read_text(encoding="utf-8")
ROUNDS = (ROOT / "rounds.md").read_text(encoding="utf-8")
HTML = (ARTIFACTS / "generated-default.html").read_text(encoding="utf-8")

VALID_ID = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*$")
VALID_STATES = {"PENDING", "BUILDING", "FAIL", "PASS", "QUESTION", "BLOCKED"}
PASS_RATE = re.compile(r"^\d+/\d+$")

# Parse the Markdown table rows directly in Python; the renderer's JS exports
# are not used as the source oracle.
source_pieces = []
for line_number, line in enumerate(PLAN.splitlines(), 1):
    if not line.lstrip().startswith("|") or not line.rstrip().endswith("|"):
        continue
    cells = [cell.strip() for cell in line.strip().split("|")[1:-1]]
    if len(cells) != 8:
        continue
    piece_id, name, _bar, _deps, state, pass_rate, round_count, gap = cells
    if not (
        VALID_ID.fullmatch(piece_id)
        and name
        and state in VALID_STATES
        and PASS_RATE.fullmatch(pass_rate)
        and round_count.isdigit()
    ):
        continue
    source_pieces.append({
        "id": piece_id,
        "name": name,
        "state": state,
        "pass_rate": pass_rate,
        "round_count": round_count,
        "gap": gap,
        "line": line_number,
    })

# Split on raw numbered headings, then collect colon-labelled metadata lines
# and their wrapped continuations without calling the renderer parser.
lines = ROUNDS.splitlines()
heading_re = re.compile(r"^## Round (\d+) — ([^\r\n]+)$")
heading_indices = [i for i, line in enumerate(lines) if heading_re.fullmatch(line)]
source_rounds = []
wrapped_piece_names = 0
adjacent_piece_verdict = 0
known_fields = ("PIECE", "VERDICT", "EVIDENCE", "BIGGEST GAP", "DISPOSITION", "Evidence")
for ordinal, start in enumerate(heading_indices):
    match = heading_re.fullmatch(lines[start])
    number, date = match.groups()
    end = heading_indices[ordinal + 1] if ordinal + 1 < len(heading_indices) else len(lines)
    segment = lines[start + 1:end]
    fields = {}
    active = None
    for raw_line in segment:
        line = raw_line.lstrip()
        labelled = next((key for key in known_fields if line.startswith(key + ":")), None)
        if labelled is not None:
            fields[labelled] = [line.split(":", 1)[1].strip()]
            active = labelled
        elif active is not None:
            fields[active].append(raw_line.strip())
    normalize = lambda values: " ".join(" ".join(values).split())
    for required in ("PIECE", "VERDICT", "BIGGEST GAP"):
        if required not in fields or not normalize(fields[required]):
            raise AssertionError(f"Round {number} missing {required}")
    if sum(bool(value) for value in fields["PIECE"]) > 1:
        wrapped_piece_names += 1
    for left, right in zip(segment, segment[1:]):
        if left.lstrip().startswith("PIECE:") and right.lstrip().startswith("VERDICT:"):
            adjacent_piece_verdict += 1
    source_rounds.append({
        "number": number,
        "date": date,
        "piece": normalize(fields["PIECE"]),
        "verdict": normalize(fields["VERDICT"]),
        "gap": normalize(fields["BIGGEST GAP"]),
    })

class RenderedHTML(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_tbody = False
        self.row = None
        self.cell = None
        self.cell_class = None
        self.table_rows = []
        self.in_li = False
        self.li_parts = None
        self.round_items = []
        self.in_num = False
        self.num_parts = None
        self.summary_numbers = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = (attrs.get("class") or "").split()
        if tag == "tbody":
            self.in_tbody = True
        elif tag == "tr" and self.in_tbody:
            self.row = {"cells": [], "classes": []}
        elif tag == "td" and self.row is not None:
            self.cell = []
            self.cell_class = attrs.get("class", "")
        elif tag == "li":
            self.in_li = True
            self.li_parts = []
        elif tag == "br" and self.in_li:
            self.li_parts.append(" ")
        elif tag == "div" and "num" in classes:
            self.in_num = True
            self.num_parts = []

    def handle_data(self, data):
        if self.cell is not None:
            self.cell.append(data)
        if self.in_li and self.li_parts is not None:
            self.li_parts.append(data)
        if self.in_num and self.num_parts is not None:
            self.num_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "td" and self.cell is not None and self.row is not None:
            self.row["cells"].append(" ".join("".join(self.cell).split()))
            self.row["classes"].append(self.cell_class)
            self.cell = None
            self.cell_class = None
        elif tag == "tr" and self.row is not None:
            self.table_rows.append(self.row)
            self.row = None
        elif tag == "tbody":
            self.in_tbody = False
        elif tag == "li" and self.in_li:
            self.round_items.append(" ".join("".join(self.li_parts).split()))
            self.in_li = False
            self.li_parts = None
        elif tag == "div" and self.in_num:
            self.summary_numbers.append("".join(self.num_parts).strip())
            self.in_num = False
            self.num_parts = None

parsed = RenderedHTML()
parsed.feed(HTML)
parsed.close()

expected_piece_rows = [
    [p["id"], p["name"], p["state"], p["pass_rate"], p["round_count"], p["gap"]]
    for p in source_pieces
]
actual_piece_rows = [row["cells"] for row in parsed.table_rows]
if actual_piece_rows != expected_piece_rows:
    first_difference = next((i for i, (a, b) in enumerate(zip(actual_piece_rows, expected_piece_rows)) if a != b), None)
    raise AssertionError(f"Piece rows differ at index {first_difference}; rendered={len(actual_piece_rows)} source={len(expected_piece_rows)}")
if len({piece["id"] for piece in source_pieces}) != len(source_pieces):
    raise AssertionError("Source PLAN contains duplicate valid piece IDs")
for source, rendered in zip(source_pieces, parsed.table_rows):
    expected_class = "state-" + source["state"].lower()
    if rendered["classes"][2] != expected_class:
        raise AssertionError(f"State class mismatch for {source['id']}: {rendered['classes'][2]!r}")

expected_round_items = [
    f"R{r['number']} {r['verdict']} · {r['piece']} {r['gap']}"
    for r in source_rounds
]
if parsed.round_items != expected_round_items:
    first_difference = next((i for i, (a, b) in enumerate(zip(parsed.round_items, expected_round_items)) if a != b), None)
    raise AssertionError(f"Round items differ at index {first_difference}; rendered={len(parsed.round_items)} source={len(expected_round_items)}")
if len({round_record["number"] for round_record in source_rounds}) != len(source_rounds):
    raise AssertionError("Raw numbered round headings are not unique")

state_counts = {}
for piece in source_pieces:
    state_counts[piece["state"]] = state_counts.get(piece["state"], 0) + 1
expected_summary = [str(len(source_pieces)), str(state_counts.get("PASS", 0)), str(len(source_rounds)), str(state_counts.get("QUESTION", 0))]
if parsed.summary_numbers != expected_summary:
    raise AssertionError(f"Summary counts differ: rendered={parsed.summary_numbers} expected={expected_summary}")

for number in ("325", "323", "319"):
    expected = next(round_record for round_record in source_rounds if round_record["number"] == number)
    if expected["verdict"] not in parsed.round_items[[r["number"] for r in source_rounds].index(number)]:
        raise AssertionError(f"Scoped verdict for R{number} was stripped")

external_refs = re.findall(r"<(?:link\b|script\b[^>]*\bsrc\s*=)", HTML, re.IGNORECASE)
if external_refs:
    raise AssertionError(f"External file references in output: {external_refs}")
if not re.search(r"<style>[\s\S]*?</style>", HTML, re.IGNORECASE):
    raise AssertionError("No embedded stylesheet found")

sensitive_chars = {ch: sum(value.count(ch) for value in (
    [field for p in source_pieces for field in (p['id'], p['name'], p['gap'])]
    + [field for r in source_rounds for field in (r['piece'], r['verdict'], r['gap'])]
)) for ch in ("<", ">", "&", '"')}
entity_counts = {token: HTML.count(token) for token in ("&lt;", "&gt;", "&amp;", "&quot;")}

report = {
    "source_piece_count": len(source_pieces),
    "rendered_piece_count": len(actual_piece_rows),
    "source_plan_gap_count": len(source_pieces),
    "nonempty_plan_gap_count": sum(bool(piece["gap"]) for piece in source_pieces),
    "source_round_heading_count": len(source_rounds),
    "rendered_round_item_count": len(parsed.round_items),
    "source_round_gap_count": len(source_rounds),
    "nonempty_round_gap_count": sum(bool(round_record["gap"]) for round_record in source_rounds),
    "unique_piece_ids": len({p['id'] for p in source_pieces}),
    "unique_round_numbers": len({r['number'] for r in source_rounds}),
    "source_state_counts": state_counts,
    "rendered_summary_numbers": parsed.summary_numbers,
    "source_round_order_first_last": [source_rounds[0]['number'], source_rounds[-1]['number']],
    "wrapped_piece_name_count": wrapped_piece_names,
    "adjacent_piece_verdict_count": adjacent_piece_verdict,
    "scoped_verdicts": {
        number: next(r['verdict'] for r in source_rounds if r['number'] == number)
        for number in ("325", "323", "319")
    },
    "source_text_sensitive_character_counts": sensitive_chars,
    "escaped_entity_counts_in_html": entity_counts,
    "self_contained_output": not external_refs,
    "all_plan_cells_match_source": True,
    "all_round_numbers_verdicts_pieces_and_gaps_match_source": True,
    "all_state_classes_match": True,
}
(ARTIFACTS / "independent-audit.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
print(json.dumps(report, indent=2))
