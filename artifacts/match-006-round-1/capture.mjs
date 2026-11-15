// MATCH-006 round 1 capture: the shipped app at 390x844 (3D battlefield by
// default). Plays real hand/arena clicks plus the existing manual-step hook
// (fastForwardSegment) until a north crown tower falls, then shows the
// placement highlight before and after, and drops a card into the pocket.
//
//   GAME_BROWSER_PLAYWRIGHT=<worktree>/node_modules/playwright/index.mjs \
//     node artifacts/match-006-round-1/capture.mjs
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const ROOT = new URL("../..", import.meta.url).pathname;
const OUT = new URL(".", import.meta.url).pathname;
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  `${ROOT}node_modules/playwright/index.mjs`;
const LANE = process.env.MATCH006_LANE ?? "east";
const BRIDGE_X = LANE === "west" ? 3_500 : 14_500;

async function firstLine(stream) {
  let text = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    text += chunk;
    const end = text.indexOf("\n");
    if (end >= 0) return text.slice(0, end);
  }
  throw new Error("server exited before readiness");
}

mkdirSync(OUT, { recursive: true });
const server = spawn(process.execPath,
  [`${ROOT}tests/game-browser-journey-server.js`, `--root=${ROOT}`],
  { stdio: ["ignore", "pipe", "inherit"] });
let browser;
const errors = [];
const report = { lane: LANE, steps: [] };
try {
  const ready = JSON.parse(await firstLine(server.stdout));
  const { chromium } = await import(PLAYWRIGHT);
  browser = await chromium.launch({ headless: true, args: ["--use-angle=metal"] });
  const context = await browser.newContext({ deviceScaleFactor: 2,
    hasTouch: false, viewport: { height: 844, width: 390 } });
  const page = await context.newPage();
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto(`http://${ready.host}:${ready.port}/public/index.html`);
  await page.locator('[data-action="begin-battle"]').first().click();
  const frameElement = await page.waitForSelector("iframe.battle-frame");
  const frame = await frameElement.contentFrame();
  await frame.waitForSelector('[data-ui="arena"]');
  await frame.waitForFunction(() =>
    document.querySelector(".battle-shell")?.dataset.renderer === "three", null,
  { timeout: 20_000 });
  await frame.evaluate(async () => {
    const controller = (await import("/src/ui/arena-shell-entry.js")).arenaHudController;
    globalThis.__match006 = controller;
    controller.enterManualStepMode();
  });
  await page.waitForTimeout(400);

  const view = () => frame.evaluate(() => {
    const controller = globalThis.__match006;
    const state = controller.session.state;
    const kinds = Object.fromEntries(state.cardRuntime.cards.map((card) => [card.id, card]));
    return {
      elixir: state.elixir.sides.south.amount,
      hand: state.decks.south.hand.map((id) => ({ cost: kinds[id].cost, id, kind: kinds[id].kind })),
      tick: state.tick,
      towers: state.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })),
      zone: (() => {
        const zone = document.querySelector('[data-ui="deploy-zone"]');
        return zone && { openLanes: zone.dataset.openLanes, visible: zone.dataset.visible };
      })(),
    };
  });
  const arenaPoint = async (x, y) => {
    const box = await frame.locator('[data-ui="arena"]').boundingBox();
    return { x: box.x + (x / 18_000) * box.width, y: box.y + (1 - y / 32_000) * box.height };
  };
  const selectGround = async (minimumElixir = 0) => {
    const state = await view();
    const slot = state.hand.findIndex((card) => card.kind !== "effect" &&
      card.cost <= Math.max(state.elixir, minimumElixir));
    if (slot < 0 || state.hand[slot].cost > state.elixir) return null;
    await frame.locator('[data-ui="card-slot"]').nth(slot).click();
    return state.hand[slot];
  };
  const clickArena = async (x, y) => {
    const point = await arenaPoint(x, y);
    await page.mouse.click(point.x, point.y);
  };
  const shot = async (name) => {
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${OUT}${name}.jpg`, quality: 82, type: "jpeg" });
  };

  // Before: wait for enough elixir, select a ground card, show the zone.
  while (!(await selectGround())) {
    await frame.evaluate(() => globalThis.__match006.fastForwardSegment(30));
  }
  report.before = await view();
  await shot("before-390x844-locked");
  // Clicking deep in the rival half is rejected while no tower has fallen.
  await clickArena(BRIDGE_X, 20_000);
  report.lockedClick = await view();

  // Push one lane with real hand/arena clicks until a north crown tower falls.
  for (let round = 0; round < 200; round += 1) {
    const state = await view();
    if (state.towers.some(({ hitpoints, id }) => id.startsWith("north:lane") && hitpoints === 0)) break;
    const card = await selectGround();
    if (card) {
      await clickArena(BRIDGE_X, 14_000);
      report.steps.push({ card: card.id, tick: state.tick });
    }
    await frame.evaluate(() => globalThis.__match006.fastForwardSegment(30));
  }
  report.fallen = await view();

  // After: select a ground card; the fallen tower's pocket is lit.
  while (!(await selectGround())) {
    await frame.evaluate(() => globalThis.__match006.fastForwardSegment(15));
  }
  report.after = await view();
  await shot("after-390x844-pocket-open");
  // Drop it inside the pocket, then step so the session materializes it.
  const before = await frame.evaluate(() => globalThis.__match006.session.replay.length);
  await clickArena(BRIDGE_X, 20_000);
  await frame.evaluate(() => globalThis.__match006.fastForwardSegment(20));
  report.pocketDrop = await frame.evaluate((from) => globalThis.__match006.session.replay
    .slice(from).filter((event) => event.type === "session-deployed" && event.side === "south")
    .map((event) => ({ cardId: event.deployment.cardId, point: event.deployment.point,
      tick: event.tick })), before);
  await shot("after-390x844-pocket-drop");
  report.consoleErrors = errors;
  writeFileSync(`${OUT}capture-report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ after: report.after.zone, before: report.before.zone,
    consoleErrors: errors.length, fallenTick: report.fallen.tick,
    pocketDrop: report.pocketDrop }, null, 2));
} finally {
  await browser?.close();
  server.kill("SIGTERM");
}
