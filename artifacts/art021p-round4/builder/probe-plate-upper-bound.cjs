const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const crypto = require("node:crypto");
const { chromium } = require("/Users/me/.codex/worktrees/9456/clash-royale-clone/node_modules/playwright");

const root = path.resolve(__dirname, "../../..");
const asset = fs.readFileSync(path.join(root, "public/assets/buried-coil-revealed.svg"));
const html = `<!doctype html><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;min-width:100%;min-height:100%;font-family:Arial,sans-serif}
body{background:#f2eddf}.team-stage{position:relative;display:block;overflow:visible}
.team-plate{position:absolute;left:1px;bottom:0;width:11px;height:4px;border:1px solid #f4ebd6;border-radius:50%;background:#c6452e;box-shadow:0 1px 1px #191d22}
.team-stage[data-size="13"]{width:13px;height:15px}.team-stage[data-side="north"]{--team-color:#c6452e}
.team-stage img{position:absolute;left:0;top:0;width:13px;height:13px;display:block;object-fit:fill;image-rendering:auto;transform:none;filter:none;visibility:hidden}
</style><div class="team-stage" data-size="13" data-side="north"><span class="team-plate"></span><img src="/buried-coil-revealed.svg" alt=""></div>`;
const server = http.createServer((req, res) => {
  if (new URL(req.url, "http://127.0.0.1").pathname === "/") {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(html);
  } else if (new URL(req.url, "http://127.0.0.1").pathname === "/buried-coil-revealed.svg") {
    res.writeHead(200, { "content-type": "image/svg+xml", "content-length": asset.length, "cache-control": "no-store" });
    res.end(asset);
  } else { res.writeHead(404); res.end(); }
});

(async () => {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: "load" });
  await page.locator("img").evaluate((image) => image.decode());
  const geometry = await page.locator(".team-stage").evaluate((stage) => {
    const rect = (element) => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
    return {
      stage: rect(stage),
      plate: rect(stage.querySelector(".team-plate")),
      image: rect(stage.querySelector("img")),
      plateColor: getComputedStyle(stage.querySelector(".team-plate")).backgroundColor,
      imageVisibility: getComputedStyle(stage.querySelector("img")).visibility,
      imageNaturalSize: [stage.querySelector("img").naturalWidth, stage.querySelector("img").naturalHeight],
      dpr: devicePixelRatio,
    };
  });
  const file = path.join(__dirname, "plate-north-13-hidden-sprite-upper-bound.png");
  await page.locator(".team-stage").screenshot({ path: file, animations: "disabled" });
  const result = {
    browser: await browser.version(),
    viewport: [390, 844],
    renderMethod: "Same R3/R4 13px team-stage and plate CSS; candidate <img> retains natural and CSS geometry but is hidden solely to measure the plate-only upper bound.",
    geometry,
    screenshot: path.basename(file),
    screenshotSha256: crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"),
    consoleErrors: errors,
  };
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(__dirname, "plate-upper-bound.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
})().catch((error) => { server.close(); console.error(error); process.exit(1); });
