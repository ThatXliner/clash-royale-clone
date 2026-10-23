import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const pieceRow = (id, piece, state, passRate, roundCount, gap) =>
  `| ${id} | ${piece} | focused acceptance | — | ${state} | ${passRate} | ${roundCount} | ${gap} |`;

test("progress renderer includes valid new prefixes and keeps round trajectories", (t) => {
  const root = mkdtempSync(join(tmpdir(), "render-progress-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "scripts"));
  copyFileSync(new URL("../scripts/render-progress.js", import.meta.url), join(root, "scripts/render-progress.js"));
  writeFileSync(join(root, "PLAN.md"), [
    "| ID | Piece | Independent acceptance bar | Depends on | State | Pass rate | Rounds | Current gap |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- |",
    pieceRow("ART-005", "Original art", "BUILDING", "0/0", 0, "Awaiting review"),
    pieceRow("CARDS-013", "Card expansion", "PASS", "8/8", 2, "None"),
    pieceRow("APP-004", "App flow", "QUESTION", "3/4", 1, "One issue"),
    pieceRow("PUB-003", "Publication", "PENDING", "0/0", 0, "Not started"),
    pieceRow("SKILL-CHAR-001", "Reusable skill", "BLOCKED", "0/0", 0, "Waiting on lore"),
    pieceRow("MOSS-007", "New valid prefix", "FAIL", "1/2", 1, "Needs a fix"),
    pieceRow("OPS-004", "Scoped summary", "BUILDING", "9/10 overall; 4/4 scoped", 2, "In progress"),
    "| THIS IS A NON-PIECE HEADER | unrelated |",
    "| --- | --- | --- | --- | --- | --- | ---: | --- |",
    pieceRow("BADSTATE-002", "Invalid state", "UNKNOWN", "1/1", 1, "Ignore this"),
    "| MALFORMED-003 | Missing the rest of the columns |",
  ].join("\n"));
  writeFileSync(join(root, "rounds.md"), [
    "## Round 9 — 2026-10-10",
    "",
    "PIECE: ART-005 — Original art, round 1",
    "",
    "VERDICT: PASS",
    "",
    "EVIDENCE: Fixture evidence remains recorded.",
    "",
    "BIGGEST GAP: None on the reviewed dimension.",
  ].join("\n"));

  const result = spawnSync(process.execPath, [join(root, "scripts/render-progress.js")], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(join(root, "progress.html"), "utf8");

  for (const id of ["ART-005", "CARDS-013", "APP-004", "PUB-003", "SKILL-CHAR-001", "MOSS-007"]) {
    assert.ok(html.includes(`<code>${id}</code>`), `${id} should be included`);
  }
  assert.match(html, /<code>OPS-004<\/code><\/td>\s*<td>Scoped summary<\/td>[\s\S]*?<td>9\/10 overall; 4\/4 scoped<\/td>/);
  for (const id of ["BADSTATE-002", "MALFORMED-003", "THIS IS A NON-PIECE HEADER"]) {
    assert.ok(!html.includes(id), `${id} should be excluded`);
  }
  assert.match(html, /<td class="state-building">BUILDING<\/td>\s*<td>0\/0<\/td>\s*<td>0<\/td>\s*<td>Awaiting review<\/td>/);
  assert.match(html, /<strong>R9 PASS<\/strong> · ART-005 — Original art, round 1<br>None on the reviewed dimension\./);
});
