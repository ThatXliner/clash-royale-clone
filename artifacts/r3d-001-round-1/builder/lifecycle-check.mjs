// Builder lifecycle probe for the shipped Battle screen:
//  1. repeated Home/Deck/Cards/Battle navigation and a deck change (remount)
//     keep exactly one battlefield canvas and one live WebGL context;
//  2. with WebGL disabled the arena falls back to the DOM renderer;
//  3. `?renderer=dom` never creates a canvas.
// Usage: node lifecycle-check.mjs [baseUrl]
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:4173/public/index.html";
const results = {};

async function open(browser, query = "") {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const problems = [];
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  await page.goto(`${base}${query}`);
  await page.click('.app-nav [data-nav-to="battle"]');
  const frame = await (await page.waitForSelector("iframe.battle-frame")).contentFrame();
  await frame.waitForSelector('[data-ui="arena"]');
  await page.waitForTimeout(2500);
  return { frame, page, problems };
}

const rendererState = (frame) => frame.evaluate(() => ({
  canvases: document.querySelectorAll('[data-ui="battlefield-3d"] canvas').length,
  contextLost: [...document.querySelectorAll('[data-ui="battlefield-3d"] canvas')]
    .map((canvas) => canvas.getContext("webgl2")?.isContextLost() ?? null),
  renderer: document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer ?? null,
  towerMarkersVisible: [...document.querySelectorAll(".combat-marker--tower")]
    .filter((node) => getComputedStyle(node).visibility !== "hidden").length,
}));

const gpu = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
{
  const { frame, page, problems } = await open(gpu);
  const states = [await rendererState(frame)];
  for (let round = 0; round < 4; round += 1) {
    for (const view of ["home", "deck", "cards", "battle"]) {
      await page.click(`.app-nav [data-nav-to="${view}"]`);
      await page.waitForTimeout(250);
    }
  }
  states.push(await rendererState(frame));
  // Change the deck, which remounts the battle graph inside the same frame.
  await page.click('.app-nav [data-nav-to="deck"]');
  await page.click("[data-replace-slot='0']");
  await page.click("[data-replacement-card-id]");
  await page.click('.app-nav [data-nav-to="battle"]');
  await page.waitForTimeout(2000);
  states.push(await rendererState(frame));
  results.navigationAndRemount = { problems, states };
  await page.close();
}
{
  const { frame, page, problems } = await open(gpu, "?renderer=dom");
  results.domQuery = { problems, state: await rendererState(frame) };
  await page.close();
}
await gpu.close();

const noGpu = await chromium.launch({ args: ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] });
{
  const { frame, page, problems } = await open(noGpu);
  results.webglUnavailable = { problems, state: await rendererState(frame) };
  await page.close();
}
await noGpu.close();
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
