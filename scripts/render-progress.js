import { readFileSync, writeFileSync } from "node:fs";

const plan = readFileSync(new URL("../PLAN.md", import.meta.url), "utf8");
const rounds = readFileSync(new URL("../rounds.md", import.meta.url), "utf8");

const pieces = plan
  .split("\n")
  .filter((line) => /^\| (?:SIM|GUARD|ARENA|MATCH|CONTENT|BUILDING|SPELL|INTEGRATION|UI|VIS|AUDIO|RELEASE|GAME)-/.test(line))
  .map((line) => {
    const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
    return {
      id: cells[0],
      piece: cells[1],
      state: cells[4],
      passRate: cells[5],
      rounds: cells[6],
      gap: cells[7],
    };
  });

const trajectories = [...rounds.matchAll(
  /## Round (\d+) — ([^\n]+)\n\nPIECE: ([^\n]+)\n\nVERDICT: (PASS|FAIL)\n\nEVIDENCE: ([\s\S]*?)\n\nBIGGEST GAP: ([\s\S]*?)(?=\n\n(?:DISPOSITION:|## Round )|$)/g,
)].map((match) => ({
  number: match[1],
  date: match[2],
  piece: match[3],
  verdict: match[4],
  gap: match[6].replace(/\s+/g, " ").trim(),
}));

const escapeHtml = (value) => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;");

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
      <li><strong>R${round.number} ${round.verdict}</strong> · ${escapeHtml(round.piece)}<br>${escapeHtml(round.gap)}</li>`).join("");

const html = `<!doctype html>
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
    .state-pass { color: #63e6a4; } .state-building { color: #ffd166; }
    .state-question { color: #ff9f6e; } .state-blocked { color: #92a0c7; }
    .state-pending { color: #c6d2f5; } code { color: #b9d6ff; }
    .note { padding: 14px; border-left: 4px solid #63e6a4; background: #14251f; }
    li { margin: 10px 0; color: #cbd5f3; }
  </style>
</head>
<body>
  <h1>Gauntlet progress</h1>
  <p class="sub">Updated 2026-08-12 · executable game journeys required · deterministic simulation · original shipped identities and assets only</p>
  <div class="cards">
    <div class="card"><div class="num">${pieces.length}</div><div class="label">tracked pieces</div></div>
    <div class="card"><div class="num">${passed}</div><div class="label">passed</div></div>
    <div class="card"><div class="num">${trajectories.length}</div><div class="label">completed rounds</div></div>
    <div class="card"><div class="num">${question}</div><div class="label">open questions</div></div>
  </div>
  <p class="note">${active
    ? `Active target: <strong>${escapeHtml(active.id)} — ${escapeHtml(active.piece)}</strong>.`
    : `Latest pass: <strong>ARENA-002 — Ground pathfinding through bridges</strong>. Next dependency-ready target: ARENA-003 — Flying movement over terrain.`}</p>
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

writeFileSync(new URL("../progress.html", import.meta.url), html);
