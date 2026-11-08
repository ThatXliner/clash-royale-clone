// Renders the tower-state / alignment harness at full 720x1280 frame size.
// Usage: node capture-states.mjs <out.png> <query> [baseUrl]
// Serve the repository root first, e.g. `node tests/game-browser-journey-server.js --port=4199`.
import { chromium } from "playwright";

const [out, query = "state=mixed", base = "http://127.0.0.1:4199"] = process.argv.slice(2);
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
page.on("pageerror", (error) => problems.push(error.message));
await page.goto(`${base}/artifacts/r3d-001-round-1/builder/states.html?${query}`);
await page.waitForSelector("body[data-ready]");
await page.waitForTimeout(1500);
await page.screenshot({ path: out });
process.stdout.write(`${JSON.stringify({ out, problems })}\n`);
await browser.close();
