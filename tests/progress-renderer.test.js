import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateProgress, parsePlan, parseRounds } from "../scripts/render-progress.js";

const pieceRow = (id, piece, state, passRate, roundCount, gap) =>
  `| ${id} | ${piece} | focused acceptance | — | ${state} | ${passRate} | ${roundCount} | ${gap} |`;

function temporaryDirectory(t) {
  const directory = mkdtempSync(join(tmpdir(), "progress-renderer-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("temporary fixtures preserve wrapped names, scoped verdicts, ordering, gaps, and escaping", (t) => {
  const directory = temporaryDirectory(t);
  const planPath = join(directory, "PLAN.md");
  const roundsPath = join(directory, "rounds.md");
  const outputPath = join(directory, "generated-progress.html");
  writeFileSync(planPath, [
    "| ID | Piece | Independent acceptance bar | Depends on | State | Pass rate | Rounds | Current gap |",
    "| --- | --- | --- | --- | --- | ---: | ---: | --- |",
    pieceRow("OPS-001", "Ops <review> & \"named\"", "BUILDING", "0/0", 0, "Await <evidence> & \"quotes\""),
    pieceRow("PUB-002", "Published view", "PASS", "2/2", 1, "None"),
    pieceRow("BAD-003", "Invalid state", "UNKNOWN", "1/1", 1, "Exclude me"),
    "| MALFORMED-004 | Missing the remaining columns |",
  ].join("\n"));
  writeFileSync(roundsPath, [
    "# Gauntlet Rounds",
    "",
    "## Round 9 — 2026-10-14",
    "",
    "PIECE: Multi-line <piece>",
    "  name & \"scope\"",
    "VERDICT: PASS for reference evidence;",
    "  GAME-001HSS remains BLOCKED",
    "EVIDENCE: fixture only",
    "BIGGEST GAP: Keep <shared> profiles, \"ordering\" & activation.",
    "",
    "## Round 8 — 2026-10-13",
    "",
    "PIECE: OPS-001 — Escaping <dashboard> & \"reports\"",
    "",
    "VERDICT: FAIL",
    "",
    "EVIDENCE: fixture only",
    "",
    "BIGGEST GAP: Render <detail> & \"quotes\" safely.",
    "",
    "## Round 7 — 2026-10-12",
    "",
    "PIECE: Adjacent metadata title",
    "VERDICT: PASS on fixture evidence only; runtime remains QUESTION",
    "EVIDENCE: fixture only",
    "BIGGEST GAP: Tail <gap> stays.",
    "Evidence: citation is not part of the gap",
  ].join("\n"));

  const html = generateProgress({ planPath, roundsPath, outputPath });
  assert.equal(readFileSync(outputPath, "utf8"), html);
  assert.match(html, /<div class="num">2<\/div><div class="label">tracked pieces<\/div>/);
  assert.match(html, /Ops &lt;review&gt; &amp; &quot;named&quot;/);
  assert.match(html, /Await &lt;evidence&gt; &amp; &quot;quotes&quot;/);
  assert.doesNotMatch(html, /BAD-003|MALFORMED-004|Exclude me/);

  const first = html.indexOf("R9 PASS for reference evidence; GAME-001HSS remains BLOCKED");
  const second = html.indexOf("R8 FAIL");
  const third = html.indexOf("R7 PASS on fixture evidence only; runtime remains QUESTION");
  assert.ok(first >= 0 && first < second && second < third, "rounds should retain source order and full verdict scope");
  assert.ok(html.includes("· Multi-line &lt;piece&gt; name &amp; &quot;scope&quot;<br>Keep &lt;shared&gt; profiles, &quot;ordering&quot; &amp; activation."));
  assert.ok(html.includes("· OPS-001 — Escaping &lt;dashboard&gt; &amp; &quot;reports&quot;<br>Render &lt;detail&gt; &amp; &quot;quotes&quot; safely."));
  assert.ok(html.includes("· Adjacent metadata title<br>Tail &lt;gap&gt; stays."));
  assert.doesNotMatch(html, /citation is not part of the gap/);
  assert.match(html, /<style>[\s\S]*<\/style>/);
  assert.doesNotMatch(html, /<link\s|<script\s+src=/i);
});

test("actual tracked plan and round history render once to a temporary output", (t) => {
  const directory = temporaryDirectory(t);
  const outputPath = join(directory, "generated-progress.html");
  const plan = readFileSync(new URL("../PLAN.md", import.meta.url), "utf8");
  const rounds = readFileSync(new URL("../rounds.md", import.meta.url), "utf8");
  const existingProgressPath = new URL("../progress.html", import.meta.url);
  const existingProgress = readFileSync(existingProgressPath);
  const expectedPieces = parsePlan(plan);
  const expectedRounds = parseRounds(rounds);

  assert.equal(expectedPieces.length, 261);
  assert.equal(expectedRounds.length, 463);
  assert.equal(new Set(expectedRounds.map(({ number }) => number)).size, 463);

  const html = generateProgress({ outputPath });
  assert.equal(readFileSync(outputPath, "utf8"), html);
  assert.deepEqual(readFileSync(existingProgressPath), existingProgress, "the shared progress page must remain untouched");

  const renderedPieceIds = [...html.matchAll(/<tr>\s*<td><code>([^<]+)<\/code>/g)].map((match) => match[1]);
  const renderedRoundIds = [...html.matchAll(/<li><strong>R(\d+) /g)].map((match) => match[1]);
  assert.deepEqual(renderedPieceIds, expectedPieces.map(({ id }) => id));
  assert.deepEqual(renderedRoundIds, expectedRounds.map(({ number }) => number));
  assert.equal(new Set(renderedPieceIds).size, 261);
  assert.equal(new Set(renderedRoundIds).size, 463);
  assert.ok(html.includes("R325 PASS for reference evidence; GAME-001HSS remains BLOCKED"));
  assert.ok(html.includes("GAME-001HTS — Shared troop status, heal and visibility mechanics, round 4"));
  assert.match(html, /<div class="num">261<\/div><div class="label">tracked pieces<\/div>/);
  assert.match(html, /<div class="num">463<\/div><div class="label">completed rounds<\/div>/);
});
