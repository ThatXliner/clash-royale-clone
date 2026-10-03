import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { createPlayableRoster } from "../src/content/playable-roster.js";
import { projectSessionTroopBattleCard } from "../src/content/session-troop-roster.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { buildRelease } from "../scripts/build-release.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_SHELL_ARTIFACTS ??
  new URL("../artifacts/app-001-round-1/", import.meta.url).pathname;
const WORKSPACE_ROOT = new URL("..", import.meta.url).pathname;
const ARENA_CONTROLLER_MODULE = "src/ui/arena-shell-entry.js";
const EXPECTED_CARD_PORTRAIT_CELLS = Object.freeze([
  Object.freeze(["coilblade", "0"]),
  Object.freeze(["mossguard", "1"]),
  Object.freeze(["copperskiff", "2"]),
  Object.freeze(["skymaul", "3"]),
  Object.freeze(["brassbolt", "4"]),
  Object.freeze(["reedsting", "5"]),
  Object.freeze(["briar-band", "6"]),
  Object.freeze(["cinderlings", "7"]),
  Object.freeze(["stonehauler", null]),
]);
const CARD_PORTRAIT_SCREENSHOTS = Object.freeze([
  "desktop-card-portraits-1440x933.png",
  "desktop-card-details-1440x933.png",
  "phone-card-portraits-390x844.png",
  "phone-card-portraits-full-390x844.png",
]);

async function screenshotEvidence(name) {
  const artifactPath = join(ARTIFACTS, name);
  const bytes = await readFile(artifactPath);
  return {
    path: relative(WORKSPACE_ROOT, artifactPath),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

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

async function cardFrameTick(frame, moduleUrl) {
  return frame.evaluate(async (entryUrl) => {
    const { arenaHudController } = await import(entryUrl);
    return arenaHudController.state.sessionTick;
  }, moduleUrl);
}

async function cardFrameDeployment(frame, cardId, moduleUrl) {
  return frame.evaluate(async ({ expectedId, entryUrl }) => {
    const { arenaHudController } = await import(entryUrl);
    const event = arenaHudController.session.replay.find(({ side, type, deployment }) =>
      side === "south" && type === "session-deployed" &&
      deployment.cardId === expectedId);
    return event ?? null;
  }, { expectedId: cardId, entryUrl: moduleUrl });
}

async function cardFrameDiagnostics(frame, moduleUrl) {
  return frame.evaluate(async (entryUrl) => {
    const { arenaHudController } = await import(entryUrl);
    const arena = document.querySelector('[data-ui="arena"]');
    return {
      arena: arena?.getBoundingClientRect().toJSON(),
      input: arenaHudController.input,
      pointers: globalThis.__appBattlePointerEvidence ?? [],
      state: arenaHudController.state,
      feedback: arenaHudController.placementFeedback,
    };
  }, moduleUrl);
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

async function waitForCardFrameTick(frame, moduleUrl, minimum = 1) {
  let tick = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    tick = await cardFrameTick(frame, moduleUrl);
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
  const manifestBytes = await readFile(join(releaseRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  assert.deepEqual(manifest.entrypoints, ["public/index.html"]);
  assert.ok(manifest.standaloneModules.includes("src/rl/environment.js"),
    "the configured RL module remains a standalone release entry");
  assert.ok(manifest.standaloneModules.includes(ARENA_CONTROLLER_MODULE),
    "the live arena controller is preserved as a standalone release module");
  assert.ok(manifest.files.some(({ path }) => path === "public/ui-arena-shell.html"),
    "the directly mounted arena remains part of the shipped release");

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const address = await serverAddress(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const arenaControllerUrl = new URL(`/${ARENA_CONTROLLER_MODULE}`, origin).href;
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  let cardPortraitEvidence = null;
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
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 9);
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Coilblade");

    for (const card of [...createPlayableRoster(), projectSessionTroopBattleCard("stonehauler")]) {
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
      if (card.id === "stonehauler") {
        assert.equal(await page.locator("[data-card-detail] .unit-profile > p").innerText(),
          "Targets structures. Attack type and whether it flies are not listed.");
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction((id) => document.activeElement?.dataset?.cardId === id, card.id);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.cardId), card.id,
        `${card.displayName} remains keyboard reachable after closing details`);
    }

    await page.locator('[data-card-search]').fill("Stonehauler");
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 1);
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").getAttribute("data-card-id"), "stonehauler");
    await page.locator('[data-card-search]').fill("Bulwark");
    assert.match(await page.locator("[data-card-empty]").innerText(), /not in the playable collection yet/u);
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 0);
    await page.locator('[data-card-search]').fill("");
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    assert.equal(await page.locator("[data-deck-cards] [data-card-id]").count(), 8);
    assert.match(await page.locator("[data-view-active]").getAttribute("data-view-active"), /deck/u);
    await page.screenshot({ path: join(ARTIFACTS, "phone-deck-720x1280.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 933 });
    await page.locator('[data-nav-to="cards"]').click();
    const desktopPortraits = await page.locator("[data-card-grid] .card-art-image").evaluateAll(
      async (images) => {
        await Promise.all(images.map((image) => image.decode()));
        return images.map((image) => {
          const card = image.closest("[data-card-id]");
          const bounds = image.closest(".card-art-window").getBoundingClientRect();
          return {
            cardId: card?.dataset.cardId,
            cell: image.dataset.portraitCell ?? null,
            src: new URL(image.currentSrc || image.src, document.baseURI).pathname,
            decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
            naturalSize: [image.naturalWidth, image.naturalHeight],
            windowSize: [bounds.width, bounds.height],
          };
        });
      },
    );
    assert.deepEqual(desktopPortraits.map(({ cardId, cell }) => [cardId, cell]),
      EXPECTED_CARD_PORTRAIT_CELLS, "all nine collection cards map to their intended painted portraits");
    assert.ok(desktopPortraits.every(({ decoded, naturalSize, windowSize }) => decoded &&
      naturalSize[0] > 0 && naturalSize[1] > 0 && windowSize[0] > 0 && windowSize[1] > 0),
    `every collection portrait decodes and has a visible art window: ${JSON.stringify(desktopPortraits)}`);
    const manifestFileForUrl = (src) => manifest.files.find(({ path }) => path === src.slice(1));
    const manifestAtlasSource = manifest.files.find(({ path }) =>
      path === "public/assets/card-portraits-painted.webp");
    const manifestStonehaulerSource = manifest.files.find(({ path }) =>
      path === "public/assets/stonehauler-painted.webp");
    assert.ok(manifestAtlasSource && manifestStonehaulerSource,
      "both production portrait source files are registered in the release manifest");
    const atlasOutputs = desktopPortraits.slice(0, 8).map(({ src }) => manifestFileForUrl(src));
    assert.ok(atlasOutputs.every((file) => file !== undefined),
      `each atlas URL resolves to its exact manifest-listed production output: ${JSON.stringify(desktopPortraits.map(({ src }) => src))}`);
    assert.ok(atlasOutputs.every((file) => file.size === manifestAtlasSource.size &&
      file.sha256 === manifestAtlasSource.sha256),
    "every emitted atlas URL retains the exact registered portrait bytes");
    const stonehaulerOutput = manifestFileForUrl(desktopPortraits[8].src);
    assert.ok(stonehaulerOutput && stonehaulerOutput.size === manifestStonehaulerSource.size &&
      stonehaulerOutput.sha256 === manifestStonehaulerSource.sha256,
    "Stonehauler's emitted URL retains its exact registered portrait bytes");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440,
      "the desktop collection does not overflow horizontally");
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[0]), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const phonePortraits = await page.locator("[data-card-grid] .card-art-image").evaluateAll(
      async (images) => {
        await Promise.all(images.map((image) => image.decode()));
        return images.map((image) => ({
          cardId: image.closest("[data-card-id]")?.dataset.cardId,
          decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
          window: image.closest(".card-art-window").getBoundingClientRect().toJSON(),
        }));
      },
    );
    assert.deepEqual(phonePortraits.map(({ cardId }) => cardId),
      EXPECTED_CARD_PORTRAIT_CELLS.map(([cardId]) => cardId),
    "all nine portrait wells remain present on a 390px phone");
    assert.ok(phonePortraits.every(({ decoded, window }) => decoded &&
      window.width > 0 && window.height > 0 && window.right <= 390),
    `all nine portraits remain decoded and inside the phone viewport: ${JSON.stringify(phonePortraits)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390,
      "the phone collection does not overflow horizontally");
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[2]) });
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[3]), fullPage: true });

    cardPortraitEvidence = {
      mapping: desktopPortraits.map(({ cardId, cell, src, decoded, naturalSize }) => ({
        cardId, cell, src, decoded, naturalSize,
      })),
      desktop: { viewport: { width: 1440, height: 933 }, horizontalOverflow: false },
      phone: { viewport: { width: 390, height: 844 }, horizontalOverflow: false },
      assetManifest: {
        sources: { atlas: manifestAtlasSource, stonehauler: manifestStonehaulerSource },
        outputs: { atlas: atlasOutputs[0], stonehauler: stonehaulerOutput },
      },
    };

    await page.setViewportSize({ width: 1440, height: 933 });
    await page.locator('[data-card-grid] [data-card-id="briar-band"]').click();
    assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), 2);
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[1]), fullPage: true });
    cardPortraitEvidence.screenshots = await Promise.all(
      CARD_PORTRAIT_SCREENSHOTS.map(screenshotEvidence));

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
    assert.equal(new URL(child.url()).pathname, "/public/ui-arena-shell.html",
      "Battle runs the packaged HTML entry, not a source-only development route");
    const loadedModuleUrls = await child.evaluate(() =>
      [...document.querySelectorAll('script[type="module"][src]')].map((script) =>
        new URL(script.getAttribute("src"), document.baseURI).href));
    assert.ok(loadedModuleUrls.length > 0 && loadedModuleUrls.every((url) =>
      new URL(url).origin === origin),
    `the shipped iframe bootstraps only from its same-origin release modules: ${JSON.stringify(loadedModuleUrls)}`);
    assert.ok(manifest.files.some(({ path }) => path === ARENA_CONTROLLER_MODULE),
      "the exact controller module imported by the test is present in the release manifest");
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
    const runningTick = await waitForCardFrameTick(child, arenaControllerUrl);
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
      deployed = await cardFrameDeployment(child, cardId, arenaControllerUrl);
      if (deployed === null) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(deployed, `a trusted arena click deploys from the scaled hand into the south field: ${JSON.stringify(await cardFrameDiagnostics(child, arenaControllerUrl))}`);
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
    const pausedTick = await cardFrameTick(child, arenaControllerUrl);
    assert.ok(pausedTick >= runningTick, "leaving Battle keeps the same session state");
    await page.waitForTimeout(100);
    assert.equal(await cardFrameTick(child, arenaControllerUrl), pausedTick, "leaving Battle pauses the shared session");
    await page.locator('[data-nav-to="battle"]').click();
    await page.waitForTimeout(220);
    assert.ok(await cardFrameTick(child, arenaControllerUrl) > pausedTick, "Deck returns to the same resumed Battle session");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    const replaceSlot = page.locator('[data-replace-slot="1"]');
    await replaceSlot.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-replacement-panel]").isVisible(), true,
      "the selected slot opens a clear replacement flow");
    assert.equal(await page.locator("[data-replacement-title]").innerText(),
      "Replace slot 2 · Mossguard");
    assert.deepEqual(await page.locator("[data-replacement-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.replacementCardId)), ["stonehauler"],
    "only the missing ninth card can replace a selected slot");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.replacementCardId),
      "stonehauler", "the replacement choice is reachable by keyboard");
    await page.keyboard.press("Enter");
    let deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(deckIds.length, 8);
    assert.equal(new Set(deckIds).size, 8, "the deck editor keeps eight unique slots");
    assert.equal(deckIds[1], "stonehauler", "Stonehauler replaces the selected Mossguard slot");
    assert.equal(await page.locator("[data-deck-cards] [data-card-id=\"mossguard\"]").count(), 0);
    const costs = new Map([...createPlayableRoster(), projectSessionTroopBattleCard("stonehauler")]
      .map(({ id, cost }) => [id, cost]));
    const expectedAverage = deckIds.reduce((sum, id) => sum + costs.get(id), 0) / 8;
    assert.equal(await page.locator("[data-average-cost]").first().innerText(), expectedAverage.toFixed(2));
    assert.match(await page.locator("[data-deck-status]").innerText(), /Stonehauler replaced Mossguard/u);
    await page.screenshot({ path: join(ARTIFACTS, "custom-deck-390x844.png"), fullPage: true });

    await page.locator('[data-nav-to="cards"]').click();
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 9,
      "the collection includes all nine safe editable choices");
    await page.locator('[data-card-grid] [data-card-id="stonehauler"]').click();
    assert.deepEqual(await renderedProfiles(page),
      [expectedStats(projectSessionTroopBattleCard("stonehauler").entities[0])],
    "Stonehauler details show the live setup projection");
    assert.equal(await page.locator("[data-card-detail] .detail-cost").innerText(), "5");
    await page.screenshot({ path: join(ARTIFACTS, "custom-card-stonehauler-390x844.png"), fullPage: true });
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    assert.deepEqual(await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId)), deckIds,
    "the selected order survives navigating to collection and back");

    await page.locator('[data-nav-to="battle"]').click();
    await child.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
    const waitForFrameDeck = async () => child.waitForFunction(async ({ expectedIds, entryUrl }) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.stringify(JSON.parse(arenaHudController.session.serialize()).setup.deck) ===
        JSON.stringify(expectedIds);
    }, { expectedIds: deckIds, entryUrl: arenaControllerUrl }, { timeout: 8_000 });
    await waitForFrameDeck();
    assert.match(await page.locator("[data-battle-label]").innerText(), /CUSTOM DECK/u);
    const frameSetup = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.parse(arenaHudController.session.serialize()).setup;
    }, arenaControllerUrl);
    assert.deepEqual(frameSetup.deck, deckIds,
      "Battle launches the actual selected eight-card setup");
    assert.deepEqual(frameSetup, JSON.parse(createEditableGameSessionSetup(deckIds)),
      "Battle uses the canonical editable setup helper");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-stonehauler-390x844.png") });

    await page.evaluate((ids) => {
      document.querySelector("[data-battle-frame-slot] iframe").contentWindow.postMessage({
        active: false,
        channel: "moss-and-ember-battle",
        deckIds: [...ids.slice(0, 7), ids[0]],
      }, window.location.origin);
    }, deckIds);
    await child.evaluate((ids) => window.postMessage({
      active: false,
      channel: "moss-and-ember-battle",
      deckIds: ids,
    }, window.location.origin), deckIds);
    await page.waitForTimeout(100);
    assert.deepEqual(await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.parse(arenaHudController.session.serialize()).setup.deck;
    }, arenaControllerUrl), deckIds, "duplicate IDs and messages from the frame itself cannot replace the deck");

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    const customPausedTick = await cardFrameTick(child, arenaControllerUrl);
    await page.waitForTimeout(100);
    assert.equal(await cardFrameTick(child, arenaControllerUrl), customPausedTick,
      "leaving Battle pauses the custom setup without discarding it");
    await page.locator('[data-nav-to="battle"]').click();
    await waitForFrameDeck();
    const resumedCustomTick = await waitForCardFrameTick(child, arenaControllerUrl, customPausedTick + 1);
    assert.ok(resumedCustomTick > customPausedTick,
      "returning to Battle resumes the same custom setup");

    const stonehaulerSlot = child.locator('[data-ui="card-slot"][data-card-id="stonehauler"]');
    await stonehaulerSlot.waitFor({ state: "visible" });
    await stonehaulerSlot.click();
    assert.equal(await child.locator('[data-ui="hud-hand"] [data-card-id="stonehauler"]')
      .getAttribute("data-selected"), "true", "Stonehauler can be selected in the live custom deck");
    const customArena = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(customArena);
    await page.mouse.click(customArena.x + customArena.width / 2,
      customArena.y + customArena.height * 0.79);
    let stonehaulerDeployment = null;
    for (let attempt = 0; attempt < 120 && stonehaulerDeployment === null; attempt += 1) {
      stonehaulerDeployment = await cardFrameDeployment(child, "stonehauler", arenaControllerUrl);
      if (stonehaulerDeployment === null) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(stonehaulerDeployment, "the custom card deploys through the real session input");
    assert.equal(stonehaulerDeployment.deployment.cardId, "stonehauler");
    assert.ok(stonehaulerDeployment.deployment.point.y < 15_000,
      "Stonehauler placement is on the player's side");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-stonehauler-deployed-390x844.png") });

    const continuation = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.enterManualStepMode();
      const checkpoint = arenaHudController.serialize();
      arenaHudController.stepMany(180);
      const forward = arenaHudController.serialize();
      arenaHudController.restore(checkpoint);
      const restored = arenaHudController.serialize();
      arenaHudController.stepMany(180);
      return {
        checkpoint,
        exactAtRestore: restored === checkpoint,
        forward,
        replayed: arenaHudController.serialize(),
        restoredDeck: JSON.parse(arenaHudController.session.serialize()).setup.deck,
      };
    }, arenaControllerUrl);
    assert.equal(continuation.exactAtRestore, true, "custom browser snapshot restores byte for byte");
    assert.equal(continuation.replayed, continuation.forward,
      "custom battle continuation remains deterministic after restore");
    assert.deepEqual(continuation.restoredDeck, deckIds,
      "restoring a battle snapshot retains all eight selected card IDs");

    const terminal = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      let chunks = 0;
      while (!arenaHudController.state.terminal && chunks < 12) {
        arenaHudController.fastForwardSegment(1_200);
        chunks += 1;
      }
      return { chunks, state: arenaHudController.state };
    }, arenaControllerUrl);
    assert.equal(terminal.state.terminal, true, "the custom match reaches a real terminal state");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-terminal-390x844.png") });
    await child.locator('[data-ui="restart"]').click();
    const restarted = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return {
        restartCount: arenaHudController.state.restartCount,
        sessionBytes: arenaHudController.session.serialize(),
        sessionTick: arenaHudController.state.sessionTick,
        setup: JSON.parse(arenaHudController.session.serialize()).setup,
      };
    }, arenaControllerUrl);
    assert.equal(restarted.restartCount, 1);
    assert.equal(restarted.sessionTick, 0);
    assert.deepEqual(restarted.setup.deck, deckIds,
      "Restart keeps the selected custom deck order");
    assert.deepEqual(restarted.setup, JSON.parse(createEditableGameSessionSetup(deckIds)),
      "Restart reconstructs the same canonical setup");
    assert.equal(restarted.sessionBytes,
      new GameSession(createEditableGameSessionSetup(deckIds)).serialize(),
      "Restart restores the same serialized eight-card session opening");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-restart-390x844.png") });

    assert.deepEqual(failures, []);
    for (const path of requests) {
      assert.ok(manifest.files.some((file) => file.path === path),
        `successful browser request is included in the release manifest: ${path}`);
    }
    writeFileSync(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify({
      cardIds: createPlayableRoster().map(({ id }) => id),
      editablePoolIds: [...createPlayableRoster().map(({ id }) => id), "stonehauler"],
      cardPortraits: cardPortraitEvidence,
      release: {
        entrypoints: manifest.entrypoints,
        standaloneModules: manifest.standaloneModules,
        fileCount: manifest.fileCount,
        manifestSha256,
      },
      deployment: {
        cardId: deployed.deployment.cardId,
        point: deployed.deployment.point,
        trustedInput: true,
      },
      requestPaths: [...requests].sort(),
      battleFrame: { box: frameBox, smallBox: smallFrameBox, viewport: battleViewport },
      editableDeck: {
        averageCost: expectedAverage,
        ids: deckIds,
        replacement: { added: "stonehauler", removed: "mossguard", slot: 1 },
        launchedSetup: frameSetup,
        invalidMessagesIgnored: true,
        pauseResume: { pausedTick: customPausedTick, resumedTick: resumedCustomTick },
        deployment: {
          cardId: stonehaulerDeployment.deployment.cardId,
          point: stonehaulerDeployment.deployment.point,
          trustedInput: true,
        },
        snapshot: {
          exactAtRestore: continuation.exactAtRestore,
          replayExact: continuation.replayed === continuation.forward,
          restoredDeck: continuation.restoredDeck,
        },
        terminal: { reached: terminal.state.terminal, sessionTick: terminal.state.sessionTick,
          chunks: terminal.chunks },
        restart: { deck: restarted.setup.deck, restartCount: restarted.restartCount,
          sessionTick: restarted.sessionTick },
      },
      viewports: [
        { width: 720, height: 1280 },
        { width: 390, height: 844 },
        { width: 1440, height: 933 },
      ],
      result: "passed",
    }, null, 2)}\n`);
  } finally {
    await page.close();
    await browser.close();
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
});
