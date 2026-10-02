import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { createPlayableRoster } from "../src/content/playable-roster.js";
import { buildRelease } from "../scripts/build-release.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_SHELL_ARTIFACTS ??
  new URL("../artifacts/app-001-round-1/", import.meta.url).pathname;

async function serverAddress(stream) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("app shell test server stopped before it was ready");
}

function format(number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number);
}

function expectedStats(entity) {
  return {
    Count: String(entity.count),
    Health: entity.hitpoints === null ? "Not available" : format(entity.hitpoints),
    Damage: entity.damage === null ? "Not available" : `${format(entity.damage)} per attack`,
    "Hit speed": entity.hitSpeedTicks === null
      ? "Not available" : `${format(entity.hitSpeedTicks / 60)} s`,
    Range: entity.rangeMillitiles === null
      ? "Not available" : `${format(entity.rangeMillitiles / 1_000)} tiles`,
    Targets: entity.targetMode === "ground-and-air" ? "ground and air" : entity.targetMode,
    Moves: entity.movementMillitilesPerSecond === null
      ? "Not available" : `${format(entity.movementMillitilesPerSecond / 1_000)} tiles/s`,
  };
}

async function renderedProfiles(page) {
  return page.locator("[data-card-detail] .unit-profile").evaluateAll((profiles) =>
    profiles.map((profile) => Object.fromEntries(
      [...profile.querySelectorAll(".stat-cell")].map((cell) => [
        cell.querySelector("span").textContent,
        cell.querySelector("strong").textContent,
      ]),
    )),
  );
}

async function cardFrameTick(frame) {
  return frame.evaluate(async () => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    return arenaHudController.state.sessionTick;
  });
}

async function cardFrameDeployment(frame, cardId) {
  return frame.evaluate(async (expectedId) => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    const event = arenaHudController.session.replay.find(({ side, type, deployment }) =>
      side === "south" && type === "session-deployed" &&
      deployment.cardId === expectedId);
    return event ?? null;
  }, cardId);
}

async function cardFrameDiagnostics(frame) {
  return frame.evaluate(async () => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    const arena = document.querySelector('[data-ui="arena"]');
    return {
      arena: arena?.getBoundingClientRect().toJSON(),
      input: arenaHudController.input,
      pointers: globalThis.__appBattlePointerEvidence ?? [],
      state: arenaHudController.state,
      feedback: arenaHudController.placementFeedback,
    };
  });
}

async function cardFrameLayout(frame) {
  return frame.evaluate(() => {
    const boxes = (selector) => [...document.querySelectorAll(selector)].map((node) => {
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        visible: style.display !== "none" && style.visibility !== "hidden" &&
          bounds.width > 0 && bounds.height > 0,
        width: bounds.width,
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      cardSlots: boxes('[data-ui="card-slot"]'),
      hand: boxes('[data-ui="hud-hand"] .hud-card'),
      next: boxes('[data-ui="hud-next"] .hud-card'),
      elixir: boxes('[data-ui="hud-elixir"]'),
      timer: boxes('[data-ui="hud-timer"]'),
      arena: boxes('[data-ui="arena"]'),
    };
  });
}

async function waitForCardFrameTick(frame, minimum = 1) {
  let tick = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    tick = await cardFrameTick(frame);
    if (tick >= minimum) return tick;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return tick;
}

test("player shell renders roster-derived cards and launches a paused shared battle frame", {
  timeout: 120_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "app-shell-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const manifest = JSON.parse(await readFile(join(releaseRoot, "release-manifest.json"), "utf8"));
  assert.deepEqual(manifest.entrypoints, ["public/index.html"]);
  assert.ok(manifest.files.some(({ path }) => path === "public/ui-arena-shell.html"),
    "the directly mounted arena remains part of the shipped release");

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const address = await serverAddress(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  const failures = [];
  const requests = new Set();
  page.on("pageerror", (error) => failures.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  page.on("requestfailed", (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 200 && response.status() < 400) {
      requests.add(url.pathname.slice(1));
    }
  });

  try {
    await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "Moss & Ember — Card battler");
    assert.equal(await page.locator(".app-nav [data-nav-to]").count(), 4);
    assert.equal(await page.locator("#how-to-title").innerText(), "How to play");
    const guide = await page.locator(".how-to-list").innerText();
    for (const phrase of ["elixir", "click or tap", "eight cards", "four-card hand", "crowns"]) {
      assert.match(guide.toLocaleLowerCase("en"), new RegExp(phrase, "u"));
    }
    assert.equal(await page.locator("[data-deck-size]").first().innerText(), "8");
    assert.equal(await page.locator("[data-average-cost]").first().innerText(), "3.13");
    assert.equal(await page.locator("[data-home-deck] [data-card-id]").count(), 8);
    await page.screenshot({ path: join(ARTIFACTS, "phone-home-720x1280.png"), fullPage: true });

    const cardsTab = page.locator('[data-nav-to="cards"]');
    await cardsTab.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 8);
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Coilblade");

    for (const card of createPlayableRoster()) {
      const cardButton = page.locator(`[data-card-grid] [data-card-id="${card.id}"]`);
      await cardButton.click();
      assert.equal(await page.locator("[data-card-detail] h2").innerText(), card.displayName);
      assert.equal(await page.locator("[data-card-detail] .detail-cost").innerText(), String(card.cost));
      const profiles = await renderedProfiles(page);
      assert.deepEqual(profiles, card.entities.map(expectedStats), `${card.displayName} runtime facts`);
      assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), card.entities.length);
      if (card.id === "briar-band") {
        const components = await page.locator("[data-card-detail] .unit-profile h3").allInnerTexts();
        assert.deepEqual(components, ["3 × Briar Runner", "3 × Briar Darter"]);
        assert.match(await page.locator("[data-card-detail] .detail-description").innerText(),
          /Briar Darters fire ranged attacks/u);
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction((id) => document.activeElement?.dataset?.cardId === id, card.id);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.cardId), card.id,
        `${card.displayName} remains keyboard reachable after closing details`);
    }

    await page.locator('[data-card-search]').fill("Stonehauler");
    assert.match(await page.locator("[data-card-empty]").innerText(), /not playable in a standard match yet/u);
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 0);
    await page.locator('[data-card-search]').fill("");
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    assert.equal(await page.locator("[data-deck-cards] [data-card-id]").count(), 8);
    assert.match(await page.locator("[data-view-active]").getAttribute("data-view-active"), /deck/u);
    await page.screenshot({ path: join(ARTIFACTS, "phone-deck-720x1280.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.locator('[data-nav-to="cards"]').click();
    await page.locator('[data-card-grid] [data-card-id="briar-band"]').click();
    assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), 2);
    await page.screenshot({ path: join(ARTIFACTS, "desktop-card-details-1440x900.png"), fullPage: true });

    await page.setViewportSize({ width: 720, height: 1280 });
    await page.locator('[data-nav-to="home"]').click();
    await page.locator('[data-nav-to="cards"]').click();
    await page.locator('[data-card-grid] [data-card-id="briar-band"]').click();
    assert.equal((await page.locator("[data-card-detail] .detail-back").innerText()).replace(/\s+/gu, " ").trim(), "← Cards");
    assert.equal(await page.locator("[data-card-detail] .stat-cell").count(), 14);
    await page.evaluate(() => window.scrollTo(0, 0));
    const phoneDetail = await page.locator("[data-card-detail]").evaluate((detail) => ({
      bottom: detail.getBoundingClientRect().bottom,
      top: detail.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }));
    assert.ok(phoneDetail.top >= 0 && phoneDetail.bottom <= phoneDetail.viewportHeight,
      `phone card details fit in the viewport: ${JSON.stringify(phoneDetail)}`);
    await page.screenshot({ path: join(ARTIFACTS, "phone-card-details-720x1280.png"), fullPage: true });
    await page.locator("[data-card-detail] .detail-back").click();
    await page.locator('[data-nav-to="home"]').click();
    await page.locator('[data-nav-to="battle"]').click();
    const frame = page.frameLocator("[data-battle-frame-slot] iframe");
    await frame.locator('[data-ui="arena"]').waitFor({ state: "attached", timeout: 8_000 });
    const frameBox = await page.locator("[data-battle-frame-slot] iframe").boundingBox();
    assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0,
      `battle iframe is laid out: ${JSON.stringify(frameBox)}`);
    await frame.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
    await page.waitForFunction(() => document.querySelector("[data-battle-frame-slot] iframe") !== null);
    const child = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(child, "Battle mounts the real arena entry inside the shell");
    const battleViewport = await child.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      shell: document.querySelector(".battle-shell")?.getBoundingClientRect().toJSON(),
    }));
    assert.deepEqual([battleViewport.width, battleViewport.height], [720, 1280],
      `Battle keeps its original input coordinate space inside a uniformly scaled frame: ${JSON.stringify({ frameBox, battleViewport })}`);
    assert.equal(await child.locator('[data-ui="card-slot"]').count(), 4,
      "the arena keeps four physical card targets");
    assert.equal(await child.locator('[data-ui="hud-hand"] .hud-card').count(), 4,
      "all four cards are mirrored in the player hand");
    const controlLayout = await cardFrameLayout(child);
    const controlBoxes = [...controlLayout.cardSlots, ...controlLayout.hand,
      ...controlLayout.next, ...controlLayout.elixir, ...controlLayout.timer,
      ...controlLayout.arena];
    assert.ok(controlBoxes.every((box) => box.visible && box.left >= 0 && box.top >= 0 &&
      box.left + box.width <= controlLayout.viewport.width + 1 &&
      box.top + box.height <= controlLayout.viewport.height + 1),
    `all four cards, next, elixir, timer, and field fit in the scaled 720x1280 frame: ${JSON.stringify({ controlLayout, frameBox })}`);
    assert.equal(await child.locator("[data-ui='deck-choice-open']").getAttribute("hidden") !== null, true,
      "the product battle uses the standard eight-card lineup");
    const runningTick = await waitForCardFrameTick(child);
    assert.ok(runningTick > 0, "Home enters and resumes the real Battle session");
    await page.screenshot({ path: join(ARTIFACTS, "phone-battle-720x1280.png") });
    const cardId = await child.locator('[data-ui="card-slot"]').first().getAttribute("data-card-id");
    await child.locator('[data-ui="card-slot"]').first().click();
    assert.equal(await child.locator(`[data-ui="hud-hand"] [data-card-id="${cardId}"]`)
      .getAttribute("data-selected"), "true",
    "a trusted card-slot click selects a card through the scaled iframe");
    await child.evaluate(() => {
      globalThis.__appBattlePointerEvidence = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__appBattlePointerEvidence.push({
          clientX: event.clientX,
          clientY: event.clientY,
          isTrusted: event.isTrusted,
        });
      }, true);
    });
    const arenaBox = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(arenaBox);
    await page.mouse.click(arenaBox.x + arenaBox.width / 2,
      arenaBox.y + arenaBox.height * 0.79);
    let deployed = null;
    for (let attempt = 0; attempt < 120 && deployed === null; attempt += 1) {
      deployed = await cardFrameDeployment(child, cardId);
      if (deployed === null) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(deployed, `a trusted arena click deploys from the scaled hand into the south field: ${JSON.stringify(await cardFrameDiagnostics(child))}`);
    assert.equal(deployed.deployment.cardId, cardId);
    assert.ok(deployed.deployment.point.y < 15_000,
      "scaled pointer coordinates preserve the legal south-side placement");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const smallFrameBox = await page.locator("[data-battle-frame-slot] iframe").boundingBox();
    const smallLayout = await cardFrameLayout(child);
    assert.deepEqual([smallLayout.viewport.width, smallLayout.viewport.height], [720, 1280],
      "small phones retain the source arena coordinate space");
    assert.ok(smallFrameBox && smallFrameBox.width > 0 && smallFrameBox.height > 0 &&
      smallFrameBox.width <= 390 && smallFrameBox.height <= 660,
    `the full arena scales to the 390x844 available area: ${JSON.stringify(smallFrameBox)}`);
    const smallControlBoxes = [...smallLayout.cardSlots, ...smallLayout.hand,
      ...smallLayout.next, ...smallLayout.elixir, ...smallLayout.timer,
      ...smallLayout.arena];
    assert.ok(smallControlBoxes.every((box) => box.visible && box.left >= 0 && box.top >= 0 &&
      box.left + box.width <= 720 + 1 && box.top + box.height <= 1280 + 1),
    `all battle controls remain visible on a 390x844 phone: ${JSON.stringify({ smallLayout, smallFrameBox })}`);
    await page.screenshot({ path: join(ARTIFACTS, "phone-small-battle-390x844.png") });
    await page.setViewportSize({ width: 720, height: 1280 });
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.waitForTimeout(100);
    const pausedTick = await cardFrameTick(child);
    assert.ok(pausedTick >= runningTick, "leaving Battle keeps the same session state");
    await page.waitForTimeout(100);
    assert.equal(await cardFrameTick(child), pausedTick, "leaving Battle pauses the shared session");
    await page.locator('[data-nav-to="battle"]').click();
    await page.waitForTimeout(220);
    assert.ok(await cardFrameTick(child) > pausedTick, "Deck returns to the same resumed Battle session");

    assert.deepEqual(failures, []);
    for (const path of requests) {
      assert.ok(manifest.files.some((file) => file.path === path),
        `successful browser request is included in the release manifest: ${path}`);
    }
    writeFileSync(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify({
      cardIds: createPlayableRoster().map(({ id }) => id),
      release: { entrypoints: manifest.entrypoints, fileCount: manifest.fileCount },
      deployment: {
        cardId: deployed.deployment.cardId,
        point: deployed.deployment.point,
        trustedInput: true,
      },
      requestPaths: [...requests].sort(),
      battleFrame: { box: frameBox, smallBox: smallFrameBox, viewport: battleViewport },
      viewports: [{ width: 720, height: 1280 }, { width: 390, height: 844 }, { width: 1440, height: 900 }],
      result: "passed",
    }, null, 2)}\n`);
  } finally {
    await page.close();
    await browser.close();
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
});
