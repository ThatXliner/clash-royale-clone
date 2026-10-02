import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_004_ARTIFACTS ??
  new URL("../artifacts/app-004-round-1/", import.meta.url).pathname;

async function serverAddress(stream) {
  let output = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("battle HUD release server stopped before readiness");
}

async function safePageTarget(page, selector) {
  await page.waitForFunction((targetSelector) => {
    const target = document.querySelector(targetSelector);
    const nav = document.querySelector(".app-nav");
    if (!target || !nav) return false;
    const bounds = target.getBoundingClientRect();
    const navBounds = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2,
      bounds.top + bounds.height / 2,
    );
    return bounds.width > 0 && bounds.height >= 44 && bounds.top >= 0 &&
      bounds.bottom <= innerHeight && bounds.bottom <= navBounds.top &&
      (target === hit || target.contains(hit));
  }, selector, { timeout: 7_000 });
  await page.locator(selector).click({ timeout: 7_000 });
}

function intersects(left, right) {
  return left.left < right.right && left.right > right.left &&
    left.top < right.bottom && left.bottom > right.top;
}

async function cardFrameDeployment(frame, cardId) {
  return frame.evaluate(async (expectedId) => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    return arenaHudController.session.replay.find(({ side, type, deployment }) =>
      side === "south" && type === "session-deployed" &&
      deployment.cardId === expectedId) ?? null;
  }, cardId);
}

async function cardFrameDiagnostics(frame) {
  return frame.evaluate(async () => {
    const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
    return {
      input: arenaHudController.input,
      pointers: globalThis.__appBattlePointerEvidence ?? [],
      feedback: arenaHudController.placementFeedback,
      state: arenaHudController.state,
    };
  });
}

async function measureHud(page, viewport) {
  const frame = page.locator(".battle-frame");
  const frameRect = await frame.evaluate((node) => {
    const rect = node.getBoundingClientRect();
    return { height: rect.height, width: rect.width };
  });
  const scale = frameRect.width / 720;
  const view = await page.frameLocator(".battle-frame").locator("body").evaluate((body) => {
    const rect = (node) => {
      const bounds = node.getBoundingClientRect();
      return {
        bottom: bounds.bottom,
        height: bounds.height,
        left: bounds.left,
        right: bounds.right,
        top: bounds.top,
        width: bounds.width,
      };
    };
    const portrait = (card) => {
      const bounds = rect(card);
      const style = getComputedStyle(card, "::before");
      const width = Number.parseFloat(style.width);
      const height = Number.parseFloat(style.height);
      const top = Number.parseFloat(style.top);
      return {
        bottom: bounds.top + top + height,
        height,
        left: bounds.left + (bounds.width - width) / 2,
        right: bounds.left + (bounds.width + width) / 2,
        top: bounds.top + top,
        width,
      };
    };
    const slots = [...body.querySelectorAll('[data-ui="card-slot"]')];
    const projectedCards = [...body.querySelectorAll('[data-ui="hud-hand"] .hud-card')];
    const cards = slots.map((slot, index) => {
      const card = projectedCards[index];
      const name = card.querySelector(".hud-card__name");
      const cost = card.querySelector(".hud-card__cost");
      const style = getComputedStyle(name);
      return {
        artBackground: getComputedStyle(card, "::before").backgroundImage,
        card: rect(card),
        cost: rect(cost),
        costFont: Number.parseFloat(getComputedStyle(cost).fontSize),
        costText: cost.textContent.trim(),
        id: card.dataset.cardId,
        name: rect(name),
        portrait: portrait(card),
        nameFont: Number.parseFloat(style.fontSize),
        nameScrollHeight: name.scrollHeight,
        nameScrollWidth: name.scrollWidth,
        nameText: name.textContent.trim(),
        nameClientHeight: name.clientHeight,
        nameClientWidth: name.clientWidth,
        target: rect(slot),
      };
    });
    const next = body.querySelector('[data-ui="hud-next"]');
    const nextTarget = body.querySelector('[data-ui="next-card"]');
    const nextCard = next.querySelector(".hud-card");
    const nextName = nextCard.querySelector(".hud-card__name");
    const nextCost = nextCard.querySelector(".hud-card__cost");
    const shell = body.querySelector(".battle-shell");
    const arena = body.querySelector('[data-ui="arena"]');
    return {
      appFrame: body.dataset.appFrame ?? null,
      arena: rect(arena),
      cards,
      next: {
        artBackground: getComputedStyle(nextCard, "::before").backgroundImage,
        cost: rect(nextCost),
        costFont: Number.parseFloat(getComputedStyle(nextCost).fontSize),
        costText: nextCost.textContent.trim(),
        id: nextCard.dataset.cardId,
        label: getComputedStyle(next, "::after").content,
        name: rect(nextName),
        nameClientHeight: nextName.clientHeight,
        nameClientWidth: nextName.clientWidth,
        nameFont: Number.parseFloat(getComputedStyle(nextName).fontSize),
        nameScrollHeight: nextName.scrollHeight,
        nameScrollWidth: nextName.scrollWidth,
        nameText: nextName.textContent.trim(),
        portrait: portrait(nextCard),
        target: rect(nextTarget),
        card: rect(nextCard),
      },
      elixir: rect(body.querySelector('[data-ui="hud-elixir"]')),
      shell: rect(shell),
      shellPlayfield: {
        height: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-height")),
        left: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-left")),
        top: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-top")),
        width: Number.parseFloat(getComputedStyle(shell).getPropertyValue("--arena-width")),
      },
    };
  });

  assert.equal(view.appFrame, "true", `${viewport.width}x${viewport.height} opts into app HUD sizing`);
  assert.deepEqual(view.shellPlayfield, { left: 90, top: 108, width: 540, height: 960 },
    "app HUD sizing leaves the authored playfield coordinates unchanged");
  assert.equal(view.cards.length, 4, "four dynamic cards remain aligned with four input regions");
  assert.deepEqual(view.arena, { left: 86, top: 104, right: 634, bottom: 1072, width: 548, height: 968 },
    "app HUD sizing leaves the rendered arena box unchanged");
  assert.equal(intersects(view.cards[3].card, view.elixir), false,
    "the elixir amount stays clear of the last card portrait and name");
  assert.equal(view.next.label, '"NEXT"', "the fifth card is visibly labeled as the next draw");
  assert.notEqual(view.next.id, null);
  assert.equal(new Set([...view.cards.map(({ id }) => id), view.next.id]).size, 5,
    "the hand and next preview show five distinct cards from one cycle");

  for (const card of [...view.cards, view.next]) {
    assert.ok(Math.abs(card.card.left - card.target.left) <= 0.5 &&
      Math.abs(card.card.top - card.target.top) <= 0.5 &&
      Math.abs(card.card.width - card.target.width) <= 0.5 &&
      Math.abs(card.card.height - card.target.height) <= 0.5,
    `${card.nameText} face stays aligned with its static input region: ${JSON.stringify({ face: card.card, target: card.target })}`);
    assert.ok(card.target.width * scale >= 44 && card.target.height * scale >= 44,
      `${card.nameText} target clears 44×44 physical pixels: ${JSON.stringify({
        width: card.target.width * scale,
        height: card.target.height * scale,
        scale,
      })}`);
    assert.ok(card.nameFont * scale >= 10,
      `${card.nameText} name reaches 10 physical pixels: ${card.nameFont * scale}`);
    assert.ok(card.costFont * scale >= 12,
      `${card.nameText} cost reaches 12 physical pixels: ${card.costFont * scale}`);
    assert.ok(card.nameClientWidth > 0 && card.nameClientHeight > 0);
    assert.ok(card.nameScrollWidth <= card.nameClientWidth + 1 &&
      card.nameScrollHeight <= card.nameClientHeight + 1,
    `${card.nameText} wraps inside its label without clipping`);
    assert.ok(card.name.left >= card.card.left && card.name.right <= card.card.right &&
      card.name.top >= card.card.top && card.name.bottom <= card.card.bottom,
    `${card.nameText} label stays inside its portrait`);
    assert.ok(card.cost.left >= card.card.left && card.cost.right <= card.card.right &&
      card.cost.top >= card.card.top && card.cost.bottom <= card.card.bottom,
    `${card.nameText} cost stays inside its portrait`);
    assert.equal(intersects(card.name, card.cost), false,
      `${card.nameText} cost badge does not cover its label`);
    assert.equal(intersects(card.name, card.portrait), false,
      `${card.nameText} label leaves its portrait unobstructed`);
    assert.notEqual(card.artBackground, "none",
      `${card.nameText} retains a card-specific portrait`);
  }
  const stonehauler = [...view.cards, view.next].find(({ id }) => id === "stonehauler");
  assert.ok(stonehauler.artBackground.includes("radial-gradient"),
    "Stonehauler keeps its recognizable original rock portrait in the packaged hand");

  const hitTargets = await page.frameLocator(".battle-frame")
    .locator('[data-ui="card-slot"]')
    .evaluateAll((nodes) => nodes.map((node) => {
      const bounds = node.getBoundingClientRect();
      const hit = document.elementFromPoint(bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2);
      return hit === node || node.contains(hit);
    }));
  assert.deepEqual(hitTargets, [true, true, true, true],
    "all four selection regions receive center-point pointer hits");
  return { ...view, scale, viewport };
}

test("packaged battle hand stays readable, selectable, and cycle-accurate", {
  timeout: 180_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "battle-hand-polish-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "release");
  await buildRelease({ output: releaseRoot });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(async () => {
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  });
  const address = await serverAddress(server.stdout);
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  page.setDefaultTimeout(7_000);
  page.setDefaultNavigationTimeout(15_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  const layouts = [];

  await page.goto(`http://${address.host}:${address.port}/public/index.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.locator('.app-nav [data-nav-to="deck"]').click();
  await page.mouse.move(30, 420);
  await page.mouse.wheel(0, 480);
  await safePageTarget(page, '[data-replace-slot="7"]');
  const stonehaulerChoice = page.locator('[data-replacement-card-id="stonehauler"]');
  await stonehaulerChoice.waitFor({ state: "visible" });
  await safePageTarget(page, '[data-replacement-card-id="stonehauler"]');
  assert.match(await page.locator("[data-deck-status]").innerText(),
    /Stonehauler replaced Cinderlings/u,
  "the custom deck editor still admits the longest supported card name");
  await page.locator('.app-nav [data-nav-to="battle"]').click();
  const frame = page.locator(".battle-frame");
  await frame.waitFor({ state: "visible" });
  const battle = page.frameLocator(".battle-frame");
  await battle.locator('[data-ui="hud-next"] .hud-card').waitFor({ state: "visible" });
  const childFrame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
  assert.ok(childFrame, "packaged app mounts its real battle iframe");
  await page.waitForFunction(() => {
    const body = document.querySelector(".battle-frame")?.contentDocument?.body;
    return body?.dataset.appFrame === "true";
  });
  await battle.locator('[data-ui="hud-next"] [data-card-id="stonehauler"], [data-ui="hud-hand"] [data-card-id="stonehauler"]')
    .first().waitFor({ state: "visible", timeout: 10_000 });

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 720, height: 1280 },
    { width: 1280, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForFunction(() => {
      const frameNode = document.querySelector(".battle-frame");
      const rect = frameNode?.getBoundingClientRect();
      return rect && rect.width > 0 && rect.height > 0;
    });
    await page.waitForTimeout(50);
    const layout = await measureHud(page, viewport);
    layouts.push(layout);
    await page.screenshot({ path: join(ARTIFACTS, `after-${viewport.width}x${viewport.height}.png`) });
    await frame.screenshot({ path: join(ARTIFACTS, `after-hud-${viewport.width}x${viewport.height}.png`) });
  }

  const currentHand = async () => battle.locator('[data-ui="hud-hand"] .hud-card')
    .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
  const handBefore = await currentHand();
  const nextBefore = await battle.locator('[data-ui="hud-next"] .hud-card').getAttribute("data-card-id");
  const firstSlot = battle.locator('[data-ui="card-slot"]').first();
  const firstId = await firstSlot.getAttribute("data-card-id");
  await battle.locator('[data-ui="elixir-rail"]').waitFor({ state: "visible" });
  await page.waitForFunction(() => {
    const slot = document.querySelector(".battle-frame")?.contentDocument
      ?.querySelector('[data-ui="hud-hand"] .hud-card');
    return slot?.dataset.insufficient === "false";
  });
  await firstSlot.evaluate((node) => node.addEventListener("click", (event) => {
    node.dataset.app004TrustedSelection = String(event.isTrusted);
  }, { once: true }));
  await firstSlot.click();
  assert.equal(await firstSlot.getAttribute("data-app004-trusted-selection"), "true",
    "first slot selection comes from a trusted browser pointer click");
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelector('[data-ui="hud-hand"] .hud-card')?.dataset.selected === "true");
  const arena = battle.locator('[data-ui="arena"]');
  await arena.evaluate((node) => node.addEventListener("pointerup", (event) => {
    node.dataset.app004TrustedDeploy = String(event.isTrusted);
    node.dataset.app004Pointer = JSON.stringify({
      clientX: event.clientX,
      clientY: event.clientY,
      target: event.target?.getAttribute?.("data-ui") ?? event.target?.className ?? null,
    });
  }, { once: true }));
  const arenaBox = await arena.boundingBox();
  assert.ok(arenaBox, "the scaled arena remains an addressable physical target");
  await page.mouse.click(arenaBox.x + arenaBox.width / 2,
    arenaBox.y + arenaBox.height * 0.79);
  let firstDeployment = null;
  for (let attempt = 0; attempt < 60 && firstDeployment === null; attempt += 1) {
    firstDeployment = await cardFrameDeployment(childFrame, firstId);
    if (firstDeployment === null) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(firstDeployment,
    `trusted pointer deploys the first selected card: ${JSON.stringify(await cardFrameDiagnostics(childFrame))}`);
  assert.equal(firstDeployment.deployment.cardId, firstId);
  assert.ok(firstDeployment.deployment.point.y < 15_000,
    "the first deployment receipt is on the legal south side");
  assert.equal(await arena.getAttribute("data-app004-trusted-deploy"), "true",
    "legal south-side deployment comes from a trusted pointer event");
  const handAfterFirst = await currentHand();
  const nextAfterFirst = await battle.locator('[data-ui="hud-next"] .hud-card')
    .getAttribute("data-card-id");
  assert.deepEqual(handAfterFirst, [nextBefore, ...handBefore.slice(1)],
    "playing the first card replaces its selected slot with the next draw");
  assert.notEqual(nextAfterFirst, nextBefore, "the next-card preview advances after deployment");

  const lastSlot = battle.locator('[data-ui="card-slot"]').nth(3);
  const lastId = await lastSlot.getAttribute("data-card-id");
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelectorAll('[data-ui="hud-hand"] .hud-card')[3]?.dataset.insufficient === "false",
  { timeout: 20_000 });
  await lastSlot.evaluate((node) => node.addEventListener("click", (event) => {
    node.dataset.app004TrustedSelection = String(event.isTrusted);
  }, { once: true }));
  await lastSlot.click();
  assert.equal(await lastSlot.getAttribute("data-app004-trusted-selection"), "true",
    "last slot selection comes from a trusted browser pointer click");
  await page.waitForFunction(() => document.querySelector(".battle-frame")?.contentDocument
    ?.querySelectorAll('[data-ui="hud-hand"] .hud-card')[3]?.dataset.selected === "true");
  await arena.evaluate((node) => node.addEventListener("pointerup", (event) => {
    node.dataset.app004TrustedDeploy = String(event.isTrusted);
  }, { once: true }));
  const lastArenaBox = await arena.boundingBox();
  assert.ok(lastArenaBox);
  await page.mouse.click(lastArenaBox.x + lastArenaBox.width / 2,
    lastArenaBox.y + lastArenaBox.height * 0.79);
  let lastDeployment = null;
  for (let attempt = 0; attempt < 60 && lastDeployment === null; attempt += 1) {
    lastDeployment = await cardFrameDeployment(childFrame, lastId);
    if (lastDeployment === null) await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(lastDeployment,
    `trusted pointer deploys the last selected card: ${JSON.stringify(await cardFrameDiagnostics(childFrame))}`);
  assert.equal(lastDeployment.deployment.cardId, lastId);
  assert.ok(lastDeployment.deployment.point.y < 15_000,
    "the last deployment receipt is on the legal south side");
  assert.equal(await arena.getAttribute("data-app004-trusted-deploy"), "true",
    "last-slot legal deployment comes from a trusted browser pointer event");
  const handAfterLast = await currentHand();
  const nextAfterLast = await battle.locator('[data-ui="hud-next"] .hud-card')
    .getAttribute("data-card-id");
  assert.deepEqual(handAfterLast.slice(0, 3), handAfterFirst.slice(0, 3),
    "playing the last card leaves the first three slots aligned");
  assert.equal(handAfterLast[3], nextAfterFirst,
    "the next preview rotates into the selected last slot");
  assert.notEqual(nextAfterLast, nextAfterFirst,
    "the next-card preview advances after the last-slot deployment too");

  await page.emulateMedia({ reducedMotion: "reduce" });
  const reducedMotion = await battle.locator("body").evaluate((body) =>
    [body.querySelector(".hand-tray"), ...body.querySelectorAll(".hud-card, .hud-card__name, .hud-card__cost, [data-ui=\"hud-next\"]")]
      .map((node) => ({
        animationName: getComputedStyle(node).animationName,
        transitionDuration: getComputedStyle(node).transitionDuration,
      })));
  assert.ok(reducedMotion.every(({ animationName, transitionDuration }) =>
    animationName === "none" && transitionDuration.split(",").every((duration) =>
      Number.parseFloat(duration) <= 0.0001)),
  `HUD polish adds no reduced-motion animation: ${JSON.stringify(reducedMotion)}`);

  const standalone = await browser.newPage({
    viewport: { width: 720, height: 1280 },
    deviceScaleFactor: 1,
  });
  standalone.setDefaultTimeout(7_000);
  standalone.setDefaultNavigationTimeout(15_000);
  await standalone.goto(`http://${address.host}:${address.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`, {
    waitUntil: "domcontentloaded",
  });
  await standalone.locator(".battle-shell").waitFor({ state: "visible" });
  await standalone.locator('[data-ui="hud-hand"] .hud-card').first()
    .waitFor({ state: "visible" });
  const standaloneView = await standalone.locator("body").evaluate((body) => {
    const shell = body.querySelector(".battle-shell");
    const tray = body.querySelector(".hand-tray");
    const slots = [...body.querySelectorAll('[data-ui="card-slot"]')];
    const card = body.querySelector('[data-ui="hud-hand"] .hud-card');
    const name = card.querySelector(".hud-card__name");
    const cost = card.querySelector(".hud-card__cost");
    const arena = body.querySelector('[data-ui="arena"]');
    const bounds = (node) => {
      const rect = node.getBoundingClientRect();
      return { height: rect.height, left: rect.left, top: rect.top, width: rect.width };
    };
    return {
      appFrame: body.dataset.appFrame ?? null,
      arena: bounds(arena),
      costFont: getComputedStyle(cost).fontSize,
      hand: slots.map(bounds),
      nameFont: getComputedStyle(name).fontSize,
      shell: bounds(shell),
      tray: bounds(tray),
    };
  });
  assert.equal(standaloneView.appFrame, null, "direct arena has no app-frame sizing marker");
  assert.deepEqual(standaloneView.shell, { left: 0, top: 0, width: 720, height: 1280 });
  assert.deepEqual(standaloneView.arena, { left: 86, top: 104, width: 548, height: 968 });
  assert.deepEqual(standaloneView.tray, { left: 112, top: 1154, width: 496, height: 88 },
    "standalone hand tray keeps its original presentation geometry");
  assert.ok(standaloneView.hand.every(({ width, height }) => width === 88 && height === 72),
    "standalone selection slots retain their original size");
  assert.equal(standaloneView.nameFont, "10px");
  assert.equal(standaloneView.costFont, "15px");
  await standalone.screenshot({ path: join(ARTIFACTS, "standalone-720x1280.png") });

  assert.deepEqual(pageErrors, [], "packaged app and arena run without browser exceptions");
  writeFileSync(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify({
    customDeck: { replaced: "Cinderlings", with: "Stonehauler", slot: 7 },
    viewports: layouts,
    selectionAndCycle: {
      initialHand: handBefore,
      initialNext: nextBefore,
      afterFirstDeploy: { hand: handAfterFirst, next: nextAfterFirst },
      afterLastDeploy: { hand: handAfterLast, next: nextAfterLast },
      firstAndLastTrustedSelection: true,
      bothLegalDeploymentsTrusted: true,
    },
    reducedMotion,
    standalone: standaloneView,
    browserErrors: pageErrors,
    result: "passed",
  }, null, 2)}\n`);

  await standalone.close();
  await page.close();
});
