import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

test("battle typeface is bundled unchanged with its complete OFL notice", async () => {
  const provenance = JSON.parse(await readFile(
    resolve(ROOT, "docs/fonts/provenance.json"), "utf8",
  ));
  const font = await readFile(resolve(ROOT, provenance.asset));
  const license = await readFile(resolve(ROOT, provenance.licenseFile));
  const typeCss = await readFile(resolve(ROOT, "src/ui/battle-type.css"), "utf8");
  const shellHtml = await readFile(resolve(ROOT, "public/ui-arena-shell.html"), "utf8");
  const notice = await readFile(resolve(ROOT, "NOTICE"), "utf8");

  assert.equal(font.length, provenance.bytes);
  assert.equal(sha256(font), provenance.sha256);
  assert.equal(license.length, provenance.licenseBytes);
  assert.equal(sha256(license), provenance.licenseSha256);
  assert.match(license.toString("utf8"), /SIL OPEN FONT LICENSE Version 1\.1/u);
  assert.match(license.toString("utf8"), /The Barlow Project Authors/u);
  assert.match(license.toString("utf8"),
    /TERMINATION[\s\S]*DISCLAIMER[\s\S]*OTHER DEALINGS IN THE FONT SOFTWARE\.\s*$/u);
  assert.match(notice, /Barlow Condensed Bold[\s\S]*SIL Open Font License 1\.1/u);
  assert.match(notice, /not project-authored artwork or AGPL-3\.0-only\s+material/u);

  assert.match(typeCss, /font-display:\s*block/u);
  assert.match(typeCss, /font-weight:\s*700/u);
  assert.match(typeCss, /url\("\.\/fonts\/BarlowCondensed-Bold\.ttf"\)/u);
  assert.match(typeCss,
    /body\[data-app-frame="true"\]\s+\.game-ui-hud-frame\s+\.hud-card__name\s*\{/u);
  assert.doesNotMatch(shellHtml, /url\(|\.(?:ttf|otf|woff2?)\b/iu);
  assert.match(shellHtml, /href="\.\.\/src\/ui\/battle-type\.css"/u);
});
