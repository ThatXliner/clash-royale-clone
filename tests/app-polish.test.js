import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_POLISH_ARTIFACTS ??
  new URL("../artifacts/app-003-round-1/", import.meta.url).pathname;

async function serverAddress(stream) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("app polish server stopped before it was ready");
}

async function assertNoHorizontalOverflow(page, label) {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.ok(layout.document <= layout.viewport && layout.body <= layout.viewport,
    `${label} has no horizontal overflow: ${JSON.stringify(layout)}`);
  return layout;
}

async function assertVisibleAppTargets(page, label) {
  const targets = await page.evaluate(() => {
    const visible = (node) => {
      for (let parent = node; parent; parent = parent.parentElement) {
        if (parent.hidden) return false;
      }
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        bounds.width > 0 && bounds.height > 0;
    };
    return [...document.querySelectorAll(".app-shell button, .search-box")]
      .filter(visible)
      .map((node) => ({
        label: node.getAttribute("aria-label") || node.innerText || node.className,
        height: node.getBoundingClientRect().height,
      }));
  });
  const tooSmall = targets.filter(({ height }) => height < 44);
  assert.deepEqual(tooSmall, [], `${label} app tap targets are at least 44px tall: ${JSON.stringify(targets)}`);
  return targets;
}

async function safeTarget(page, selector, label) {
  await page.waitForFunction((targetSelector) => {
    const target = document.querySelector(targetSelector);
    const nav = document.querySelector(".app-nav");
    if (!target || !nav) return false;
    const bounds = target.getBoundingClientRect();
    const navBounds = nav.getBoundingClientRect();
    const fixedNav = getComputedStyle(nav).position === "fixed";
    return bounds.width > 0 && bounds.height >= 44 && bounds.left >= 0 &&
      bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight &&
      (!fixedNav || bounds.bottom <= navBounds.top) &&
      target.contains(document.elementFromPoint(
        bounds.left + bounds.width / 2, bounds.top + bounds.height / 2));
  }, selector, { timeout: 4_000 });
  const details = await page.locator(selector).evaluate((target) => {
    const bounds = target.getBoundingClientRect();
    const nav = document.querySelector(".app-nav");
    const navBounds = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      navTop: navBounds.top,
      hitTarget: target === hit || target.contains(hit),
      focus: document.activeElement === target,
    };
  });
  assert.ok(details.height >= 44 && details.top >= 0 && details.bottom <= details.navTop,
    `${label} is fully above the fixed navigation: ${JSON.stringify(details)}`);
  assert.equal(details.hitTarget, true, `${label} receives a real center-point hit`);
  return details;
}

async function visibleBodyControlOrder(page) {
  return page.evaluate(() => [...document.querySelectorAll(".app-main button, .app-main input")]
    .filter((node) => {
      for (let parent = node; parent; parent = parent.parentElement) {
        if (parent.hidden) return false;
      }
      const style = getComputedStyle(node);
      const bounds = node.getBoundingClientRect();
      return style.display !== "none" && style.visibility !== "hidden" &&
        bounds.width > 0 && bounds.height > 0;
    })
    .map((node) => node.classList.contains("deck-card-button")
      ? `inspect:${node.dataset.cardId}`
      : node.hasAttribute("data-replace-slot")
        ? `replace:${node.dataset.replaceSlot}`
        : node.getAttribute("aria-label") || node.className));
}

async function assertNativeFocusClear(page, label) {
  await page.evaluate(() => new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const focus = await page.evaluate(() => {
    const target = document.activeElement;
    const nav = document.querySelector(".app-nav");
    if (!target || !nav || !target.closest(".app-main")) return null;
    const bounds = target.getBoundingClientRect();
    const navBounds = nav.getBoundingClientRect();
    const hit = document.elementFromPoint(
      bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
    return {
      identity: target.classList.contains("deck-card-button")
        ? `inspect:${target.dataset.cardId}`
        : target.hasAttribute("data-replace-slot")
          ? `replace:${target.dataset.replaceSlot}`
          : target.getAttribute("aria-label") || target.className,
      height: bounds.height,
      top: bounds.top,
      bottom: bounds.bottom,
      navTop: navBounds.top,
      clearsFixedNav: bounds.top >= 0 && bounds.bottom <= navBounds.top,
      receivesCenterHit: target === hit || target.contains(hit),
    };
  });
  assert.ok(focus, `${label} keeps keyboard focus in an app body control`);
  assert.ok(focus.height >= 44 && focus.clearsFixedNav,
    `${label} focused target clears the footer: ${JSON.stringify(focus)}`);
  assert.equal(focus.receivesCenterHit, true,
    `${label} focused target remains the center-point hit: ${JSON.stringify(focus)}`);
  return focus;
}

async function traverseDeckWithKeyboard(page, viewport) {
  await page.setViewportSize(viewport);
  await page.locator(".app-nav [data-nav-to=deck]").click();
  const expected = await visibleBodyControlOrder(page);
  assert.equal(expected.length, 16, `${viewport.width}x${viewport.height} deck exposes all eight Inspect and Replace controls`);

  const forward = [];
  for (let index = 0; index < expected.length; index += 1) {
    await page.keyboard.press("Tab");
    const focus = await assertNativeFocusClear(page, `Tab ${index + 1} at ${viewport.width}x${viewport.height}`);
    forward.push(focus.identity);
  }
  assert.deepEqual(forward, expected,
    `${viewport.width}x${viewport.height} native Tab follows every visible deck control in document order`);

  await page.locator('[data-replace-slot="7"]').focus();
  await assertNativeFocusClear(page, `reverse traversal start at ${viewport.width}x${viewport.height}`);
  const backward = [];
  for (let index = expected.length - 2; index >= 0; index -= 1) {
    await page.keyboard.press("Shift+Tab");
    const focus = await assertNativeFocusClear(page,
      `Shift+Tab ${expected.length - 1 - index} at ${viewport.width}x${viewport.height}`);
    backward.push(focus.identity);
  }
  assert.deepEqual(backward, expected.slice(0, -1).reverse(),
    `${viewport.width}x${viewport.height} native Shift+Tab follows every deck control in reverse order`);
  return { width: viewport.width, height: viewport.height, controlsPerDirection: expected.length };
}

test("mobile app controls scroll clear of navigation and retain deck and card feedback", {
  timeout: 120_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "app-polish-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const manifest = JSON.parse(await readFile(join(releaseRoot, "release-manifest.json"), "utf8"));
  assert.deepEqual(manifest.entrypoints, ["public/index.html"]);
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const address = await serverAddress(server.stdout);
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const failures = [];
  page.on("pageerror", (error) => failures.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  const layouts = [];
  const keyboardTraversal = [];

  try {
    await page.goto(`http://${address.host}:${address.port}/public/index.html`, { waitUntil: "networkidle" });
    await page.locator(".app-nav [data-nav-to=deck]").click();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 0); });
    await page.evaluate(() => document.documentElement.style.removeProperty("scroll-behavior"));
    const initialPhoneLayout = await page.locator('[data-replace-slot="7"]').evaluate((target) => {
      const bounds = target.getBoundingClientRect();
      const nav = document.querySelector(".app-nav").getBoundingClientRect();
      return { top: bounds.top, bottom: bounds.bottom, navTop: nav.top,
        overlapped: bounds.bottom > nav.top && bounds.top < nav.bottom };
    });
    await page.screenshot({ path: join(ARTIFACTS, "after-deck-390x844.png"), fullPage: true });
    layouts.push({ width: 390, height: 844, view: "deck", ...await assertNoHorizontalOverflow(page, "390x844 deck") });
    await assertVisibleAppTargets(page, "390x844 deck");

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
    ]) {
      keyboardTraversal.push(await traverseDeckWithKeyboard(page, viewport));
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".app-nav [data-nav-to=deck]").click();
    await page.evaluate(() => { document.documentElement.style.scrollBehavior = "auto"; scrollTo(0, 0); });
    await page.evaluate(() => document.documentElement.style.removeProperty("scroll-behavior"));

    const firstReplace = page.locator('[data-replace-slot="0"]');
    await firstReplace.focus();
    await safeTarget(page, '[data-replace-slot="0"]', "first Replace control after keyboard focus");
    await page.keyboard.press("Enter");
    await page.locator("[data-replacement-card-id]").waitFor({ state: "visible" });
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.replacementCardId), "stonehauler",
      "keyboard activation opens the replacement choice and moves focus to it");
    await safeTarget(page, "[data-replacement-card-id]", "replacement choice after keyboard activation");
    await page.keyboard.press("Escape");
    await safeTarget(page, '[data-replace-slot="0"]', "first Replace control after closing choices");

    const lastReplace = page.locator('[data-replace-slot="7"]');
    await lastReplace.focus();
    await safeTarget(page, '[data-replace-slot="7"]', "last Replace control after keyboard focus");
    await page.keyboard.press("Enter");
    await page.locator("[data-replacement-card-id]").waitFor({ state: "visible" });
    await safeTarget(page, "[data-replacement-card-id]", "last-slot replacement choice");
    await page.keyboard.press("Escape");

    await page.mouse.move(30, 420);
    await page.mouse.wheel(0, 480);
    const postScrollRect = await safeTarget(page, '[data-replace-slot="7"]', "last Replace control after trusted scrolling");
    await page.screenshot({ path: join(ARTIFACTS, "after-deck-clear-390x844.png") });
    await lastReplace.evaluate((target) => {
      target.addEventListener("pointerdown", (event) => {
        target.dataset.pointerWasTrusted = String(event.isTrusted);
      }, { once: true });
    });
    const replaceBox = await lastReplace.boundingBox();
    assert.ok(replaceBox);
    await page.mouse.click(replaceBox.x + replaceBox.width / 2, replaceBox.y + replaceBox.height / 2);
    assert.equal(await lastReplace.getAttribute("data-pointer-was-trusted"), "true",
      "the last slot opened from an actual browser pointer event");
    await page.locator("[data-replacement-card-id]").waitFor({ state: "visible" });
    await safeTarget(page, "[data-replacement-card-id]", "replacement choice after trusted pointer activation");
    await page.screenshot({ path: join(ARTIFACTS, "after-replacement-choice-390x844.png"), fullPage: true });
    layouts.push({ width: 390, height: 844, view: "replacement", ...await assertNoHorizontalOverflow(page, "390x844 replacement") });
    await assertVisibleAppTargets(page, "390x844 replacement");
    await page.keyboard.press("Enter");
    assert.equal(await page.locator('[data-deck-cards] [data-card-id="stonehauler"]').count(), 1);
    assert.equal(await page.locator('[data-slot-index="7"]').getAttribute("class"),
      "deck-slot is-recently-replaced", "accepted replacement stays visibly marked on its slot");
    assert.equal((await page.locator('[data-slot-index="7"] .deck-slot-confirmation').innerText()).toLocaleLowerCase("en"), "updated");
    assert.match(await page.locator("[data-deck-status]").innerText(), /Stonehauler replaced Cinderlings/u);
    await safeTarget(page, '[data-replace-slot="7"]', "updated last-slot Replace control");
    await page.screenshot({ path: join(ARTIFACTS, "after-replacement-390x844.png"), fullPage: true });

    await page.locator('[data-deck-cards] [data-card-id="stonehauler"]').click();
    await page.waitForFunction(() => document.activeElement?.id === "selected-card-title");
    await page.waitForFunction(() => {
      const title = document.querySelector("#selected-card-title");
      const bounds = title?.getBoundingClientRect();
      const nav = document.querySelector(".app-nav")?.getBoundingClientRect();
      return bounds && nav && bounds.top >= 0 && bounds.bottom <= nav.top;
    });
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Stonehauler");
    layouts.push({ width: 390, height: 844, view: "details", ...await assertNoHorizontalOverflow(page, "390x844 details") });
    await assertVisibleAppTargets(page, "390x844 details");
    await safeTarget(page, ".detail-back", "card detail Back control");
    await page.screenshot({ path: join(ARTIFACTS, "after-details-390x844.png"), fullPage: true });
    await page.locator(".detail-back").click();
    await page.waitForFunction(() => document.activeElement?.dataset?.cardId === "stonehauler");
    await safeTarget(page, '[data-card-grid] [data-card-id="stonehauler"]', "selected card after returning from details");

    await page.locator(".app-nav [data-nav-to=cards]").click();
    await page.locator("[data-card-search]").fill("no such card");
    await page.locator('[data-card-empty] [data-action="clear-search"]').waitFor({ state: "visible" });
    await assertVisibleAppTargets(page, "empty search recovery");
    await page.locator('[data-action="clear-search"]').click();
    assert.equal(await page.locator("[data-card-search]").inputValue(), "");
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 11,
      "Clear search restores the full editable collection");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.cardSearch !== undefined ||
      document.activeElement?.getAttribute("data-card-search") !== null), true,
    "clearing search returns focus to the search field");

    for (const viewport of [
      { width: 320, height: 568 },
      { width: 390, height: 844 },
      { width: 720, height: 1280 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.locator(".app-nav [data-nav-to=home]").click();
      layouts.push({ ...viewport, view: "home", ...await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} home`) });
      await assertVisibleAppTargets(page, `${viewport.width}x${viewport.height} home`);
      await page.locator(".app-nav [data-nav-to=deck]").click();
      layouts.push({ ...viewport, view: "deck", ...await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} deck`) });
      await assertVisibleAppTargets(page, `${viewport.width}x${viewport.height} deck`);
      await page.locator('[data-replace-slot="0"]').click();
      await page.locator("[data-replacement-card-id]").waitFor({ state: "visible" });
      layouts.push({ ...viewport, view: "replacement", ...await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} replacement`) });
      await assertVisibleAppTargets(page, `${viewport.width}x${viewport.height} replacement`);
      await page.keyboard.press("Escape");
      await page.locator(".app-nav [data-nav-to=cards]").click();
      await page.locator('[data-card-grid] [data-card-id="coilblade"]').click();
      layouts.push({ ...viewport, view: "details", ...await assertNoHorizontalOverflow(page, `${viewport.width}x${viewport.height} details`) });
      await assertVisibleAppTargets(page, `${viewport.width}x${viewport.height} details`);
    }

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedMotion = await page.evaluate(() => ({
      scrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      navTransition: getComputedStyle(document.querySelector(".app-nav button")).transitionDuration,
      collectionTransition: getComputedStyle(document.querySelector(".collection-card")).transitionDuration,
    }));
    assert.equal(reducedMotion.scrollBehavior, "auto");
    assert.ok([reducedMotion.navTransition, reducedMotion.collectionTransition]
      .every((value) => parseFloat(value) <= 0.0001),
    `reduced motion removes interface transitions: ${JSON.stringify(reducedMotion)}`);
    await page.setViewportSize({ width: 320, height: 568 });
    await page.locator(".app-nav [data-nav-to=deck]").click();
    await page.locator('[data-replace-slot="7"]').focus();
    const reducedMotionFocus = await assertNativeFocusClear(page,
      "reduced-motion focus on the last Replace control at 320x568");
    assert.deepEqual(failures, [], "the production shell runs without browser errors");
    writeFileSync(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify({
      release: { entrypoints: manifest.entrypoints, fileCount: manifest.fileCount },
      initialPhoneLayout,
      postScrollRect,
      firstKeyboard: "opened, focused, escaped, and restored to a clear first-slot target",
      lastKeyboard: "opened, focused, escaped, and restored to a clear last-slot target",
      keyboardTraversal,
      trustedPointer: { wasTrusted: true, target: "last slot after wheel scroll" },
      replacement: { added: "stonehauler", slot: 7, visibleConfirmation: "Updated" },
      emptySearch: { clearAction: true, restoredCards: 9, focusReturned: true },
      viewports: layouts,
      reducedMotion: { ...reducedMotion, focusedTarget: reducedMotionFocus },
      result: "passed",
    }, null, 2)}\n`);
  } finally {
    await page.close();
    await browser.close();
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
});
