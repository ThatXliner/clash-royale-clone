import { existsSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const pieceIdPattern = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-\d+[A-Z0-9]*$/;
const pieceStates = new Set(["PENDING", "BUILDING", "FAIL", "PASS", "QUESTION", "BLOCKED"]);
const fieldPattern = /^\s*(PIECE|VERDICT|EVIDENCE|BIGGEST GAP|DISPOSITION|Evidence):\s*(.*)$/;

export function parsePlan(plan) {
  return plan
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      if (
        cells.length !== 8
        || !pieceIdPattern.test(cells[0])
        || !cells[1]
        || !pieceStates.has(cells[4])
        || !cells[5]
        || !/^\d+$/.test(cells[6])
      ) return null;
      return {
        id: cells[0],
        piece: cells[1],
        state: cells[4],
        passRate: cells[5],
        rounds: cells[6],
        gap: cells[7],
      };
    })
    .filter(Boolean);
}

function parseRoundFields(body) {
  const fields = new Map();
  let activeField;
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(fieldPattern);
    if (match) {
      activeField = match[1];
      fields.set(activeField, match[2]);
    } else if (activeField) {
      fields.set(activeField, `${fields.get(activeField)} ${line.trim()}`);
    }
  }
  return Object.fromEntries([...fields].map(([key, value]) => [key, value.replace(/\s+/g, " ").trim()]));
}

export function parseRounds(rounds) {
  const headings = [...rounds.matchAll(/^## Round (\d+) — ([^\r\n]+)\r?$/gm)];
  return headings.map((heading, index) => {
    const bodyStart = heading.index + heading[0].length;
    const bodyEnd = headings[index + 1]?.index ?? rounds.length;
    const fields = parseRoundFields(rounds.slice(bodyStart, bodyEnd));
    for (const name of ["PIECE", "VERDICT", "EVIDENCE", "BIGGEST GAP"]) {
      if (!fields[name]) throw new Error(`Round ${heading[1]} is missing ${name} metadata`);
    }
    return {
      number: heading[1],
      date: heading[2],
      piece: fields.PIECE,
      verdict: fields.VERDICT,
      gap: fields["BIGGEST GAP"],
    };
  });
}

const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

const findNoteElements = (html) => [...html.matchAll(/<p class="note">[\s\S]*?<\/p>/g)];
const countNoteStarts = (html) => [...html.matchAll(/<p class="note">/g)].length;

function validatePreservedNoteHtml(noteHtml) {
  const notes = findNoteElements(noteHtml);
  if (notes.length !== 1 || countNoteStarts(noteHtml) !== 1 || notes[0][0] !== noteHtml) {
    throw new TypeError('preservedNoteHtml must be exactly one complete <p class="note"> element');
  }
  return noteHtml;
}

function readExistingNoteHtml(outputPath) {
  if (!existsSync(outputPath)) return undefined;
  const existingHtml = readFileSync(outputPath, "utf8");
  const notes = findNoteElements(existingHtml);
  const starts = countNoteStarts(existingHtml);
  if (notes.length !== 1 || starts !== 1) {
    throw new Error(`Existing progress output must contain exactly one complete <p class="note"> element (found ${notes.length} complete and ${starts} opening tags)`);
  }
  return notes[0][0];
}

export function renderProgress(plan, rounds, { preservedNoteHtml } = {}) {
  const pieces = parsePlan(plan);
  const trajectories = parseRounds(rounds);
  const passed = pieces.filter(({ state }) => state === "PASS").length;
  const active = pieces.find(({ state }) => state === "BUILDING");
  const question = pieces.filter(({ state }) => state === "QUESTION").length;
  const rows = pieces.map((piece) => `
      <tr>
        <td><code>${escapeHtml(piece.id)}</code></td>
        <td>${escapeHtml(piece.piece)}</td>
        <td class="state-${piece.state.toLowerCase()}">${escapeHtml(piece.state)}</td>
        <td>${escapeHtml(piece.passRate)}</td>
        <td>${escapeHtml(piece.rounds)}</td>
        <td>${escapeHtml(piece.gap)}</td>
      </tr>`).join("");
  const roundItems = trajectories.map((round) => `
      <li><strong>R${round.number} ${escapeHtml(round.verdict)}</strong> · ${escapeHtml(round.piece)}<br>${escapeHtml(round.gap)}</li>`).join("");
  const noteMarkup = preservedNoteHtml === undefined
    ? `<p class="note">${active
      ? `Active target: <strong>${escapeHtml(active.id)} — ${escapeHtml(active.piece)}</strong>.`
      : `Latest review: <strong>${escapeHtml(trajectories[0]?.piece ?? "None")} — ${escapeHtml(trajectories[0]?.verdict ?? "PENDING")}</strong>. Full game completion remains unproven.`}</p>`
    : validatePreservedNoteHtml(preservedNoteHtml);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Original Card Battler — Gauntlet Progress</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #0b1020; color: #edf2ff; }
    body { margin: 0 auto; max-width: 1500px; padding: 32px 20px 64px; }
    h1 { margin-bottom: 6px; } .sub { color: #aebadd; margin-top: 0; }
    .cards { display: grid; grid-template-columns: repeat(auto-fit,minmax(170px,1fr)); gap: 12px; margin: 24px 0; }
    .card { background: #151d35; border: 1px solid #2b385f; border-radius: 12px; padding: 14px; }
    .num { font-size: 28px; font-weight: 750; } .label { color: #aebadd; font-size: 13px; }
    .table-wrap { overflow-x: auto; border: 1px solid #273453; border-radius: 12px; }
    table { width: 100%; border-collapse: collapse; background: #11182c; font-size: 14px; }
    th,td { text-align: left; vertical-align: top; border-bottom: 1px solid #273453; padding: 9px 8px; }
    th { position: sticky; top: 0; background: #19223c; }
    .state-fail { color: #ff8585; } .state-pass { color: #63e6a4; } .state-building { color: #ffd166; }
    .state-question { color: #ff9f6e; } .state-blocked { color: #92a0c7; }
    .state-pending { color: #c6d2f5; } code { color: #b9d6ff; }
    .note { padding: 14px; border-left: 4px solid #63e6a4; background: #14251f; }
    li { margin: 10px 0; color: #cbd5f3; }
  </style>
</head>
<body>
  <h1>Gauntlet progress</h1>
  <p class="sub">Updated ${escapeHtml(trajectories.at(-1)?.date ?? "No completed rounds")} · executable game journeys required · deterministic simulation · original shipped identities and assets only</p>
  <div class="cards">
    <div class="card"><div class="num">${pieces.length}</div><div class="label">tracked pieces</div></div>
    <div class="card"><div class="num">${passed}</div><div class="label">passed</div></div>
    <div class="card"><div class="num">${trajectories.length}</div><div class="label">completed rounds</div></div>
    <div class="card"><div class="num">${question}</div><div class="label">open questions</div></div>
  </div>
  ${noteMarkup}
  <h2>Every piece</h2>
  <div class="table-wrap">
    <table>
      <thead><tr><th>ID</th><th>Piece</th><th>State</th><th>Tests</th><th>Rounds</th><th>Current gap / result</th></tr></thead>
      <tbody>${rows}
      </tbody>
    </table>
  </div>
  <h2>Round trajectory</h2>
  <ol>${roundItems}
  </ol>
</body>
</html>
`;
}

export function generateProgress({
  planPath = new URL("../PLAN.md", import.meta.url),
  roundsPath = new URL("../rounds.md", import.meta.url),
  outputPath = new URL("../progress.html", import.meta.url),
} = {}) {
  const preservedNoteHtml = readExistingNoteHtml(outputPath);
  const html = renderProgress(readFileSync(planPath, "utf8"), readFileSync(roundsPath, "utf8"), { preservedNoteHtml });
  writeFileSync(outputPath, html);
  return html;
}

if (process.argv[1] && existsSync(resolve(process.argv[1]))
  && realpathSync(resolve(process.argv[1])) === fileURLToPath(import.meta.url)) {
  generateProgress({ outputPath: process.argv[2] ?? new URL("../progress.html", import.meta.url) });
}
