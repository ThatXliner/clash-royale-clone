const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { chromium } = require("/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright");

// Independent diagnostic fixture copied from the critic's existing asset-stage
// fixture. The 13px/26px stages and plate CSS are held exactly constant; the
// causal control changes only the sprite's CSS visibility.
const HERE = __dirname;
const ROOT = path.resolve(HERE, "../../..");
const assets = {
  "buried-coil-revealed": "public/assets/buried-coil-revealed.svg",
};
const content = fs.readFileSync(path.join(ROOT, assets["buried-coil-revealed"]));
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const html = (theme) => {
  const themeClass = theme === "dark" ? "theme-dark" : "theme-light";
  const stages = [];
  for (const size of [13, 26]) for (const side of ["north", "south"]) {
    stages.push('<div class="team-stage" data-size="' + size + '" data-side="' + side + '" data-key="' + side + '-' + size + '"><span class="team-plate"></span><img class="sprite" src="/assets/buried-coil-revealed.svg" alt="" /></div>');
  }
  return '<!doctype html><html><head><meta charset="utf-8"><style>' +
    '*{box-sizing:border-box}html,body{margin:0;min-width:100%;min-height:100%;font-family:Arial,sans-serif}' +
    'body.theme-light{background:#f2eddf;color:#27251f}body.theme-dark{background:#171a21;color:#f1eee7}' +
    '.root{padding:12px 14px;display:flex;flex-direction:column;gap:4px}' +
    '.team-stage{position:relative;display:block;overflow:visible}' +
    '.team-plate{position:absolute;left:1px;bottom:0;width:11px;height:4px;border:1px solid #f4ebd6;border-radius:50%;background:var(--team-color);box-shadow:0 1px 1px #191d22}' +
    '.team-stage img{position:absolute;left:0;top:0}' +
    '.team-stage[data-size="26"]{width:26px;height:30px}' +
    '.team-stage[data-size="26"] .team-plate{left:2px;width:22px;height:8px;border-width:2px}' +
    '.team-stage[data-size="26"] img{width:26px;height:26px}' +
    '.team-stage[data-size="13"]{width:13px;height:15px}' +
    '.team-stage[data-side="north"]{--team-color:#c6452e}.team-stage[data-side="south"]{--team-color:#2e7f86}' +
    '.sprite-hidden .sprite{visibility:hidden}.plate-hidden .team-plate{display:none}' +
    '</style></head><body class="' + themeClass + '"><main class="root">' + stages.join("") + '</main></body></html>';
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html(url.searchParams.get("theme") === "dark" ? "dark" : "light"));
  } else if (url.pathname === "/assets/buried-coil-revealed.svg") {
    response.writeHead(200, { "content-type": "image/svg+xml", "content-length": content.length, "cache-control": "no-store" });
    response.end(content);
  } else { response.writeHead(404); response.end("Not found"); }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const browser = await chromium.launch({ headless: true });
  const report = {
    candidateHead: require("node:child_process").execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim(),
    candidateTree: require("node:child_process").execFileSync("git", ["rev-parse", "HEAD^{tree}"], { cwd: ROOT, encoding: "utf8" }).trim(),
    browser: await browser.version(),
    scope: "Critic-only causal diagnostic. Re-renders frozen R3 public SVG in the unchanged synthetic asset-stage geometry; sprite-hidden control changes only CSS visibility:hidden. No app/arena geometry or product file is changed.",
    svg: { path: assets["buried-coil-revealed"], bytes: content.length, sha256: sha256(content) },
    fixtureGeometry: {
      stage13: "13x15 CSS px; sprite 13x13 at left:0 top:0; plate left:1 bottom:0 width:11 height:4 border:1px solid #f4ebd6 border-radius:50%; background north #c6452e / south #2e7f86; box-shadow 0 1px 1px #191d22",
      stage26: "26x30 CSS px; sprite 26x26 at left:0 top:0; plate left:2 bottom:0 width:22 height:8 border-width:2px; same colors/border radius/shadow",
      attribution: "Synthetic critic fixture copied from fresh-render.cjs; not sourced from the product prototype or a live arena template.",
    },
    captures: [],
  };
  const viewports = [["phone", { width: 390, height: 844 }], ["desktop", { width: 1440, height: 933 }]];
  for (const [viewportName, viewport] of viewports) for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:" + address.port + "/?theme=" + theme, { waitUntil: "load" });
    await page.locator("img.sprite").evaluateAll((imgs) => Promise.all(imgs.map((img) => img.decode())));
    for (const size of [13, 26]) for (const side of ["north", "south"]) {
      const key = viewportName + "-" + theme + "-" + side + "-" + size;
      const selector = '.team-stage[data-size="' + size + '"][data-side="' + side + '"]';
      const stage = page.locator(selector);
      const geometry = await stage.evaluate((element) => {
        const r = element.getBoundingClientRect();
        const plate = element.querySelector(".team-plate").getBoundingClientRect();
        const img = element.querySelector("img").getBoundingClientRect();
        const cs = getComputedStyle(element.querySelector(".team-plate"));
        return {
          stage: [r.x, r.y, r.width, r.height],
          plate: [plate.x - r.x, plate.y - r.y, plate.width, plate.height],
          sprite: [img.x - r.x, img.y - r.y, img.width, img.height],
          teamColor: cs.backgroundColor,
          plateCss: { border: cs.border, borderRadius: cs.borderRadius, boxShadow: cs.boxShadow },
          dpr: devicePixelRatio,
        };
      });
      const states = [
        ["asset-visible-plate-on", "", ""],
        ["asset-hidden-plate-on", "sprite-hidden", ""],
        ["asset-hidden-plate-off", "sprite-hidden", "plate-hidden"],
        ["asset-visible-plate-off", "", "plate-hidden"],
      ];
      const files = {};
      for (const [state, spriteClass, plateClass] of states) {
        await stage.evaluate((element, args) => {
          element.classList.toggle("sprite-hidden", args.spriteClass === "sprite-hidden");
          element.classList.toggle("plate-hidden", args.plateClass === "plate-hidden");
        }, { spriteClass, plateClass });
        const name = "plate-control-" + key + "-" + state + ".png";
        const bytes = await stage.screenshot({ animations: "disabled", type: "png" });
        fs.writeFileSync(path.join(HERE, name), bytes);
        files[state] = { path: name, bytes: bytes.length, sha256: sha256(bytes) };
      }
      // Restore the exact production asset state for the next measurement.
      await stage.evaluate((element) => element.classList.remove("sprite-hidden", "plate-hidden"));
      report.captures.push({ key, viewportName, viewport: [viewport.width, viewport.height], theme, geometry, files });
    }
    report.captures[report.captures.length - 1].consoleErrors = errors;
    await context.close();
  }
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  fs.writeFileSync(path.join(HERE, "plate-causal-control.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ candidateHead: report.candidateHead, candidateTree: report.candidateTree, browser: report.browser, svg: report.svg, fixtureGeometry: report.fixtureGeometry, captures: report.captures.length }));
})().catch((error) => { console.error(error); process.exitCode = 1; server.close(); });
