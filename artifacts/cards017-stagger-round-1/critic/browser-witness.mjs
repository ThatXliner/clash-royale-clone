import assert from "node:assert/strict";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const outputDir = here;
const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const chromePath = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const deck = ["coilblade", "briar-band", "mossguard", "copperskiff",
  "skymaul", "brassbolt", "reedsting", "cinderlings"];
const viewports = [
  { height: 1280, name: "phone-720x1280", width: 720 },
  { height: 900, name: "desktop-1440x900", width: 1440 },
];

assert.ok(existsSync(playwrightPath), `Playwright exists at ${playwrightPath}`);
assert.ok(existsSync(chromePath), `Chrome exists at ${chromePath}`);
mkdirSync(outputDir, { recursive: true });

async function firstLine(stream) {
  let buffered = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    buffered += chunk;
    const newline = buffered.indexOf("\n");
    if (newline >= 0) return buffered.slice(0, newline);
  }
  throw new Error("browser journey server exited before readiness");
}

async function clickCenter(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  assert.ok(box, `${selector} has a visible browser box`);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

async function clickArenaPoint(page) {
  const box = await page.locator('[data-ui="arena"]').boundingBox();
  assert.ok(box, "arena has a visible browser box");
  await page.mouse.click(box.x + box.width / 2, box.y + box.height * 0.76);
}

const server = spawn(process.execPath, [join(root, "tests/game-browser-journey-server.js"),
  `--root=${root}`], { stdio: ["ignore", "pipe", "pipe"] });
let browser;
const results = [];
try {
  const ready = JSON.parse(await firstLine(server.stdout));
  const { chromium } = await import(playwrightPath);
  browser = await chromium.launch({ executablePath: chromePath, headless: true });

  for (const viewport of viewports) {
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: viewport.height, width: viewport.width } });
    const page = await context.newPage();
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => pageErrors.push(String(error)));

    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?app-frame=1`,
      { waitUntil: "domcontentloaded" });
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    const setup = await page.evaluate((deckIds) => {
      return import("/src/ui/arena-shell-entry.js").then(({ arenaHudController: controller }) => {
        globalThis.__cards017CriticController = controller;
        controller.replaceDeck(deckIds);
        const resumed = controller.resume();
        const manual = controller.enterManualStepMode();
        return {
          deck: JSON.parse(controller.session.serialize()).setup.deck,
          hand: [...controller.session.state.decks.south.hand],
          manual,
          resumed,
          tick: controller.session.state.tick,
        };
      });
    }, deck);
    assert.equal(setup.resumed, true, `${viewport.name}: app session resumes`);
    assert.equal(setup.manual, true, `${viewport.name}: browser enters deterministic manual stepping`);
    assert.ok(setup.hand.includes("briar-band"), `${viewport.name}: Briar is in the player hand`);

    const slot = '[data-ui="card-slot"][data-card-id="briar-band"]';
    await page.locator(slot).scrollIntoViewIfNeeded();
    await clickCenter(page, slot);
    const selected = await page.locator(
      '[data-ui="hud-hand"] [data-card-id="briar-band"]',
    ).getAttribute("data-selected");
    if (selected !== "true") {
      const debug = await page.evaluate(() => {
        const controller = globalThis.__cards017CriticController;
        return {
          cardSlots: [...document.querySelectorAll('[data-ui="card-slot"]')].map((node) => ({
            id: node.dataset.cardId,
            rect: node.getBoundingClientRect().toJSON(),
            selected: node.dataset.selected,
          })),
          hand: controller.session.state.decks.south.hand,
          input: controller.input ?? null,
          pageState: controller.state,
          replay: controller.session.replay.slice(-4),
          selectedHud: document.querySelector(
            '[data-ui="hud-hand"] [data-card-id="briar-band"]',
          )?.outerHTML,
        };
      });
      writeFileSync(join(outputDir, `${viewport.name}-selection-debug.json`),
        `${JSON.stringify(debug, null, 2)}\n`);
      await page.screenshot({ path: join(outputDir, `${viewport.name}-selection-debug.png`) });
    }
    assert.equal(selected, "true", `${viewport.name}: physical input selects Briar Band`);
    await clickArenaPoint(page);
    await page.evaluate(() => globalThis.__cards017CriticController.stepMany(1));

    const boundaries = [];
    for (let member = 0; member < 6; member += 1) {
      if (member > 0) {
        await page.evaluate(() => globalThis.__cards017CriticController.stepMany(6));
      }
      const boundary = await page.evaluate(() => {
        const controller = globalThis.__cards017CriticController;
        const units = controller.session.state.battle.units.filter(({ cardId, side }) =>
          cardId === "briar-band" && side === "south");
        const markers = [...document.querySelectorAll(".combat-marker[data-kind][data-side='south']")]
          .filter(({ dataset }) => dataset.kind === "briar-runner" ||
            dataset.kind === "briar-darter");
        return {
          archetypes: units.map(({ archetypeId }) => archetypeId),
          domMarkerCount: markers.length,
          domKinds: markers.map(({ dataset }) => dataset.kind),
          simulationTick: controller.session.state.tick,
          uiTick: controller.state.sessionTick,
          unitCount: units.length,
        };
      });
      assert.equal(boundary.unitCount, member + 1,
        `${viewport.name}: exactly ${member + 1} south members are born at boundary ${member}`);
      assert.equal(boundary.domMarkerCount, member + 1,
        `${viewport.name}: DOM renders exactly the born south members at boundary ${member}`);
      assert.deepEqual(boundary.archetypes.slice(0, 3),
        Array(member + 1).fill("briar-runner").slice(0, 3),
        `${viewport.name}: first component retains its local member indices`);
      assert.equal(boundary.uiTick, boundary.simulationTick,
        `${viewport.name}: visible projection is current with the simulation`);
      if ([0, 1, 5].includes(member)) {
        const screenshot = `${viewport.name}-tick-${boundary.simulationTick}.png`;
        await page.screenshot({ path: join(outputDir, screenshot) });
        boundary.screenshot = screenshot;
      }
      boundaries.push(boundary);
    }
    assert.deepEqual(boundaries.map(({ unitCount }) => unitCount), [1, 2, 3, 4, 5, 6]);
    assert.deepEqual(boundaries.map(({ simulationTick }) => simulationTick), [1, 7, 13, 19, 25, 31]);
    const southDeploy = await page.evaluate(() => globalThis.__cards017CriticController.session.replay
      .find(({ side, type }) => side === "south" && type === "session-deployed"));
    assert.ok(southDeploy, `${viewport.name}: the app committed the physical deployment`);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(pageErrors, []);

    results.push({
      consoleErrors,
      deployment: southDeploy,
      hand: setup.hand,
      pageErrors,
      screenshots: boundaries.filter(({ screenshot }) => screenshot).map(({ screenshot }) => ({
        file: screenshot,
        sha256: createHash("sha256").update(readFileSync(join(outputDir, screenshot))).digest("hex"),
      })),
      viewport: { height: viewport.height, name: viewport.name, width: viewport.width },
      boundaries,
    });
    await context.close();
  }

  const evidence = {
    commit: "c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb",
    source: "public/ui-arena-shell.html via tests/game-browser-journey-server.js",
    result: "PASS",
    witness: "trusted pointer input deploys Briar Band; live browser DOM and GameSession show one additional member every six ticks",
    results,
  };
  writeFileSync(join(outputDir, "browser-witness.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} finally {
  try { await browser?.close(); } catch {}
  if (server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([once(server, "exit"), new Promise((resolvePromise) =>
      setTimeout(resolvePromise, 2_000))]);
  }
}
