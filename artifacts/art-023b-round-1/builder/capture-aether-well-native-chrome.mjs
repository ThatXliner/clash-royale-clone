import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { extname, resolve } from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const outputDir = resolve(root, "artifacts/art-023b-round-1/builder/native-capture-05/captures");
const chromePath = process.env.GAME_BROWSER_CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const allowlisted = new Map([
  ["/demo/aether-well-battle-art.html", "demo/aether-well-battle-art.html"],
  ["/demo/aether-well-battle-art.js", "demo/aether-well-battle-art.js"],
  ["/src/ui/aether-well-art.js", "src/ui/aether-well-art.js"],
  ["/public/assets/moss-ember-arena-painted.webp", "public/assets/moss-ember-arena-painted.webp"],
]);
const expectedColors = { north: "#C6452E", south: "#2E7F86" };
const viewports = [
  { name: "phone-390x844", width: 390, height: 844 },
  { name: "desktop-1440x933", width: 1440, height: 933 },
];
const bodySizes = [13, 26];
const tones = ["light", "dark"];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://127.0.0.1").pathname;
  const relativePath = allowlisted.get(pathname);
  if (!relativePath) {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("not found");
    return;
  }
  try {
    const content = await readFile(resolve(root, relativePath));
    const type = extname(relativePath) === ".html"
      ? "text/html; charset=utf-8"
      : extname(relativePath) === ".js"
        ? "text/javascript; charset=utf-8"
        : "image/webp";
    response.writeHead(200, { "content-type": type, "cache-control": "no-store" });
    response.end(content);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(String(error));
  }
});

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function browserMainPid(nodePid) {
  const lines = execFileSync("ps", ["-axo", "pid=,ppid=,command="], { encoding: "utf8" }).split("\n");
  for (const line of lines) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!match || Number(match[2]) !== nodePid) continue;
    if (!match[3].includes("--user-data-dir=") || match[3].includes("--type=")) continue;
    if (match[3].includes("Google Chrome")) return Number(match[1]);
  }
  return null;
}

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});
await mkdir(outputDir, { recursive: true });

let browser;
let context;
try {
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const chromeVersion = execFileSync(chromePath, ["--version"], { encoding: "utf8" }).trim();
  console.log(`CAPTURE_NODE_PID=${process.pid}`);
  console.log(`CAPTURE_HTTP_PORT=${address.port}`);
  console.log(`CAPTURE_CHROME=${chromePath}`);
  console.log(`CAPTURE_CHROME_VERSION=${chromeVersion}`);
  console.log(`CAPTURE_PLAYWRIGHT_VERSION=${process.env.npm_package_version || "1.58.2"}`);
  console.log("CAPTURE_PREFIX=artifacts/art-023b-round-1/builder/native-capture-05/captures/aether-well");
  browser = await chromium.launch({ executablePath: chromePath, headless: true, timeout: 60000 });
  const browserPid = browserMainPid(process.pid);
  if (!browserPid) throw new Error("Could not identify the launched native Chrome main PID");
  console.log(`CAPTURE_CHROME_PID=${browserPid}`);
  context = await browser.newContext({ deviceScaleFactor: 1, viewport: viewports[0], colorScheme: "light", reducedMotion: "no-preference" });
  const page = await context.newPage();
  const cases = [];

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const tone of tones) {
      for (const bodyCssPixels of bodySizes) {
        await page.emulateMedia({ colorScheme: tone, reducedMotion: "no-preference" });
        const url = `${baseUrl}/demo/aether-well-battle-art.html?body=${bodyCssPixels}&tone=${tone}`;
        await page.goto(url, { waitUntil: "load" });
        await page.waitForFunction(() => document.documentElement.dataset.fixtureReady === "true");
        await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));

        const measurement = await page.evaluate(() => {
          const shell = document.querySelector(".battle-shell");
          const arena = document.querySelector("[data-art-host]");
          const shellRect = shell.getBoundingClientRect();
          const arenaRect = arena.getBoundingClientRect();
          const units = [...arena.querySelectorAll(".arena-unit")].map((placement) => {
            const svg = placement.querySelector("svg");
            const rect = svg.getBoundingClientRect();
            const artBounds = svg.getBBox();
            const artScaleX = rect.width / 32;
            const artScaleY = rect.height / 32;
            return {
              team: placement.dataset.team,
              shellScale: Number(placement.dataset.shellScale),
              svgCssRect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              artBoundsViewBox: { x: artBounds.x, y: artBounds.y, width: artBounds.width, height: artBounds.height },
              artCssRect: {
                x: rect.x + artBounds.x * artScaleX,
                y: rect.y + artBounds.y * artScaleY,
                width: artBounds.width * artScaleX,
                height: artBounds.height * artScaleY,
              },
              bodyBoundsUnits: svg.dataset.bodyBoundsUnits,
              bodyCssPixels: rect.height * artBounds.height / 32,
              side: svg.dataset.side,
              teamColor: svg.dataset.teamColor,
              renderer: svg.dataset.renderer,
              motion: svg.dataset.motion,
            };
          });
          return {
            viewport: { width: innerWidth, height: innerHeight },
            devicePixelRatio,
            shellCssRect: { x: shellRect.x, y: shellRect.y, width: shellRect.width, height: shellRect.height },
            shellScale: Number(shell.style.transform.match(/scale\(([^)]+)\)/)?.[1]),
            arenaCssRect: { x: arenaRect.x, y: arenaRect.y, width: arenaRect.width, height: arenaRect.height },
            arenaDimensions: { width: Number(arena.dataset.arenaWidth), height: Number(arena.dataset.arenaHeight) },
            tone: arena.dataset.tone,
            targetBodyCssPixels: Number(arena.dataset.targetBodyCssPixels),
            units,
          };
        });
        if (measurement.devicePixelRatio !== 1) throw new Error(`Expected DPR 1, got ${measurement.devicePixelRatio}`);
        if (measurement.arenaDimensions.width !== 540 || measurement.arenaDimensions.height !== 960) throw new Error("Fixture arena did not report 540x960 source geometry");
        const arena = measurement.arenaCssRect;
        if (arena.x < 0 || arena.y < 0 || arena.x + arena.width > viewport.width || arena.y + arena.height > viewport.height) {
          throw new Error(`${viewport.name} scaled arena escapes viewport bounds: ${JSON.stringify(arena)}`);
        }
        if (measurement.units.length !== 2) throw new Error(`Expected two team units, got ${measurement.units.length}`);
        for (const unit of measurement.units) {
          const roundedBody = Number(unit.bodyCssPixels.toFixed(4));
          if (unit.teamColor !== expectedColors[unit.team]) throw new Error(`${unit.team} team color mismatch: ${unit.teamColor}`);
          if (unit.side !== unit.team || unit.motion !== "static" || unit.renderer !== "native-svg") throw new Error(`Unexpected ${unit.team} rendering identity`);
          if (Math.abs(unit.artBoundsViewBox.y - 2.575) > 0.0001 || Math.abs(unit.artBoundsViewBox.height - 25.425) > 0.0001) {
            throw new Error(`${unit.team} SVG art bounds changed: ${JSON.stringify(unit.artBoundsViewBox)}`);
          }
          const body = unit.artCssRect;
          if (body.x < arena.x || body.y < arena.y || body.x + body.width > arena.x + arena.width || body.y + body.height > arena.y + arena.height) {
            throw new Error(`${unit.team} visible SVG body escapes arena: ${JSON.stringify(body)}`);
          }
          if (body.x < 0 || body.y < 0 || body.x + body.width > viewport.width || body.y + body.height > viewport.height) {
            throw new Error(`${unit.team} visible SVG body escapes viewport: ${JSON.stringify(body)}`);
          }
          if (Math.abs(roundedBody - bodyCssPixels) > 0.01) {
            throw new Error(`${viewport.name}/${tone}/${bodyCssPixels}px ${unit.team} visible body measured ${roundedBody}px; exceeded 0.01px layout tolerance`);
          }
        }
        if (measurement.units[0].teamColor === measurement.units[1].teamColor) throw new Error("North/south team identities collapsed to the same color");

        const filename = `aether-well-${viewport.name}-${tone}-${bodyCssPixels}px.png`;
        const screenshot = await page.screenshot({ path: resolve(outputDir, filename), animations: "disabled" });
        const firstHash = sha256(screenshot);
        const repeatedHash = sha256(await page.screenshot({ animations: "disabled" }));
        if (firstHash !== repeatedHash) throw new Error(`Same-parameter capture changed for ${filename}`);
        await page.emulateMedia({ colorScheme: tone, reducedMotion: "reduce" });
        await page.evaluate(() => new Promise((resolveFrame) => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
        const reducedHash = sha256(await page.screenshot({ animations: "disabled" }));
        if (firstHash !== reducedHash) throw new Error(`Reduced-motion capture changed for ${filename}`);
        cases.push({
          filename: `artifacts/art-023b-round-1/builder/native-capture-05/captures/${filename}`,
          viewport,
          tone,
          bodyCssPixels,
          measurement,
          sha256: firstHash,
          repeatedSameParametersSha256: repeatedHash,
          reducedMotionSha256: reducedHash,
          sameParametersStable: firstHash === repeatedHash,
          reducedMotionStable: firstHash === reducedHash,
        });
        console.log(`CAPTURED=${filename} sha256=${firstHash} measuredBodies=${measurement.units.map(({ team, bodyCssPixels: body }) => `${team}:${body.toFixed(4)}px`).join(",")}`);
      }
    }
  }

  const sourcePaths = [
    "src/ui/aether-well-art.js",
    "demo/aether-well-battle-art.html",
    "demo/aether-well-battle-art.js",
    "tests/aether-well-battle-art.test.js",
  ];
  const sourceFingerprints = {};
  for (const sourcePath of sourcePaths) {
    sourceFingerprints[sourcePath] = sha256(await readFile(resolve(root, sourcePath)));
  }
  const result = {
    capture: "ART-023B native Chrome battle-art fixture",
    baseCommit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    sourceFingerprints,
    browser: { executable: chromePath, version: chromeVersion, pid: browserPid, playwrightVersion: "1.58.2" },
    deviceScaleFactor: 1,
    cssLayoutQuantizationToleranceCssPixels: 0.01,
    fixture: { arena: "540x960 source pixels", shell: "720x1280 source pixels", allowlistedRequests: [...allowlisted.keys()] },
    requiredCases: cases.length,
    cases,
    deterministicAll: cases.every(({ sameParametersStable }) => sameParametersStable),
    reducedMotionAll: cases.every(({ reducedMotionStable }) => reducedMotionStable),
  };
  if (cases.length !== 8 || !result.deterministicAll || !result.reducedMotionAll) throw new Error("Capture matrix incomplete or unstable");
  await writeFile(resolve(outputDir, "capture-manifest.json"), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`CAPTURE_MANIFEST=${JSON.stringify(result)}`);
  console.log("CAPTURE_MATRIX_PASS=8/8; DPR=1; body=13/26; teams=north/south; tones=light/dark; viewports=390x844/1440x933; reduced-motion=stable; repeated=same-bytes");
} finally {
  if (context) await context.close();
  if (browser) await browser.close();
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  console.log("CAPTURE_BROWSER_AND_SERVER_CLOSED=true");
}
