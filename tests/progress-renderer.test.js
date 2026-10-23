import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { generateProgress, parsePlan, parseRounds, renderProgress } from "../scripts/render-progress.js";

const pieceRow = (id, piece, state, passRate, roundCount, gap) =>
  `| ${id} | ${piece} | focused acceptance | — | ${state} | ${passRate} | ${roundCount} | ${gap} |`;

const escapeHtmlText = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

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
    pieceRow("OPS-004", "Scoped summary", "BUILDING", "9/10 overall; 4/4 <focused> & \"scoped\"", 2, "In progress"),
    pieceRow("BAD-003", "Invalid state", "UNKNOWN", "1/1", 1, "Exclude me"),
    pieceRow("EMPTY-005", "Empty summary", "PENDING", "", 0, "Exclude me"),
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
  assert.match(html, /<div class="num">3<\/div><div class="label">tracked pieces<\/div>/);
  assert.match(html, /Ops &lt;review&gt; &amp; &quot;named&quot;/);
  assert.match(html, /Await &lt;evidence&gt; &amp; &quot;quotes&quot;/);
  assert.match(html, /<code>OPS-004<\/code><\/td>\s*<td>Scoped summary<\/td>[\s\S]*?<td>9\/10 overall; 4\/4 &lt;focused&gt; &amp; &quot;scoped&quot;<\/td>/);
  const parsedPieces = parsePlan(readFileSync(planPath, "utf8"));
  assert.equal(parsedPieces.find(({ id }) => id === "PUB-002").passRate, "2/2");
  assert.equal(parsedPieces.find(({ id }) => id === "OPS-004").passRate, "9/10 overall; 4/4 <focused> & \"scoped\"");
  assert.doesNotMatch(html, /BAD-003|EMPTY-005|MALFORMED-004|Exclude me/);

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
  const sourcePieceIds = [...plan.matchAll(/^\|\s*([A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*)\s*\|/gm)]
    .map((match) => match[1]);
  const sourceRoundNumbers = [...rounds.matchAll(/^## Round (\d+) — [^\r\n]+$/gm)]
    .map((match) => match[1]);

  assert.ok(sourcePieceIds.length > 0, "PLAN should contain tracked piece rows");
  assert.ok(sourceRoundNumbers.length > 0, "round history should contain numbered headings");
  assert.equal(new Set(sourcePieceIds).size, sourcePieceIds.length, "PLAN piece IDs should be unique");
  assert.equal(new Set(sourceRoundNumbers).size, sourceRoundNumbers.length, "round headings should be unique");
  assert.deepEqual(expectedPieces.map(({ id }) => id), sourcePieceIds, "the renderer parser should include every source piece row in order");
  assert.deepEqual(expectedRounds.map(({ number }) => number), sourceRoundNumbers, "the renderer parser should include every source round heading in order");

  const html = generateProgress({ outputPath });
  assert.equal(readFileSync(outputPath, "utf8"), html);
  assert.deepEqual(readFileSync(existingProgressPath), existingProgress, "the shared progress page must remain untouched");

  const renderedPieceIds = [...html.matchAll(/<tr>\s*<td><code>([^<]+)<\/code>/g)].map((match) => match[1]);
  const renderedRounds = [...html.matchAll(/<li><strong>R(\d+) ([\s\S]*?)<\/strong> · ([\s\S]*?)<br>([\s\S]*?)<\/li>/g)]
    .map(([, number, verdict, piece, gap]) => ({ number, verdict, piece, gap }));
  assert.deepEqual(renderedPieceIds, sourcePieceIds, "every source piece row should render once in source order");
  assert.deepEqual(renderedRounds, expectedRounds.map(({ number, verdict, piece, gap }) => ({
    number,
    verdict: escapeHtmlText(verdict),
    piece: escapeHtmlText(piece),
    gap: escapeHtmlText(gap),
  })), "every round should render once in source order with its full scoped metadata");
  assert.match(html, new RegExp(`<div class="num">${sourcePieceIds.length}<\\/div><div class="label">tracked pieces<\\/div>`));
  assert.match(html, new RegExp(`<div class="num">${sourceRoundNumbers.length}<\\/div><div class="label">completed rounds<\\/div>`));
});


test("renderProgress keeps its dynamic default note and accepts one explicit preserved note", () => {
  const plan = [
    "| ID | Piece | Independent acceptance bar | Depends on | State | Pass rate | Rounds | Current gap |",
    "| --- | --- | --- | --- | --- | ---: | ---: | --- |",
    pieceRow("OPS-001", "Original <piece>", "BUILDING", "0/0", 0, "Awaiting review"),
  ].join("\n");
  const rounds = [
    "## Round 1 — 2026-10-23",
    "",
    "PIECE: OPS-001 — Original <piece>, round 1",
    "VERDICT: PASS for this fixture only",
    "EVIDENCE: Fixture evidence.",
    "BIGGEST GAP: None on this fixture.",
  ].join("\n");

  const dynamicHtml = renderProgress(plan, rounds);
  assert.ok(dynamicHtml.includes('<p class="note">Active target: <strong>OPS-001 — Original &lt;piece&gt;</strong>.</p>'));

  const preservedNoteHtml = '<p class="note">Public <strong>history</strong> stays &amp; intact.</p>';
  const preservedHtml = renderProgress(plan, rounds, { preservedNoteHtml });
  assert.ok(preservedHtml.includes(preservedNoteHtml));
  assert.equal([...preservedHtml.matchAll(/<p class="note">/g)].length, 1);
});
