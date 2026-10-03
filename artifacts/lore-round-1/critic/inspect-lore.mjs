import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createViteServer } from "vite";
import { getCardLore } from "../../../src/ui/card-lore.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const CARDS = [
  ["coilblade", "Coilblade"],
  ["mossguard", "Mossguard"],
  ["copperskiff", "Copperskiff"],
  ["skymaul", "Skymaul"],
  ["brassbolt", "Brassbolt"],
  ["reedsting", "Reedsting"],
  ["briar-band", "Briar Band"],
  ["cinderlings", "Cinderlings"],
  ["stonehauler", "Stonehauler"],
];
const failures = [];
const httpErrors = [];
const sourceHostNonContentConsoleErrors = [];
const screenshots = [];
const desktopResults = [];
const phoneResults = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

await mkdir(HERE, { recursive: true });
const vite = await createViteServer({
  root: ROOT,
  configFile: false,
  logLevel: "error",
  server: { host: "127.0.0.1", port: 0, strictPort: false },
});
await vite.listen();
const address = vite.httpServer.address();
const url = "http://127.0.0.1:" + address.port + "/public/index.html";
const { chromium } = await import(PLAYWRIGHT);
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function capture(page, name) {
  const path = join(HERE, name);
  await page.screenshot({ path });
  const bytes = await readFile(path);
  const evidence = {
    path: "artifacts/lore-round-1/critic/" + name,
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: sha256(bytes),
  };
  screenshots.push(evidence);
  return evidence;
}

async function readDetail(page, expectedId, expectedTitle, viewportName) {
  const values = await page.evaluate(() => {
    const detail = document.querySelector("[data-card-detail]");
    const title = detail?.querySelector("h2")?.textContent?.trim() ?? null;
    const story = detail?.querySelector(".card-lore");
    const profiles = [...(detail?.querySelectorAll(".unit-profile") ?? [])];
    const cells = [...(detail?.querySelectorAll(".stat-cell") ?? [])];
    const storyBounds = story?.getBoundingClientRect();
    const firstProfileBounds = profiles[0]?.getBoundingClientRect();
    const lastCellBounds = cells.at(-1)?.getBoundingClientRect();
    const navBounds = document.querySelector(".app-nav")?.getBoundingClientRect();
    const visible = (node) => {
      if (!node) return false;
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" &&
        bounds.width > 0 && bounds.height > 0;
    };
    return {
      title,
      storyLabel: story?.querySelector(".card-lore-label")?.textContent?.trim() ?? null,
      storyHeading: story?.querySelector("h3")?.textContent?.trim() ?? null,
      storyText: story?.querySelector("p")?.textContent?.trim() ?? null,
      storyVisible: visible(story),
      storySectionSeparateFromStatistics: !!story && profiles.length > 0 &&
        !profiles.some((profile) => story.contains(profile) || profile.contains(story)),
      storyBeforeStatistics: !!storyBounds && !!firstProfileBounds &&
        storyBounds.bottom <= firstProfileBounds.top,
      profileCount: profiles.length,
      statCount: cells.length,
      statLabels: [...(detail?.querySelectorAll(".stat-cell span") ?? [])]
        .map((node) => node.textContent.trim()),
      horizontalOverflow: {
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth,
      },
      scroll: {
        top: scrollY,
        documentHeight: document.documentElement.scrollHeight,
        viewportHeight: innerHeight,
        lastStatTop: lastCellBounds?.top ?? null,
        lastStatBottom: lastCellBounds?.bottom ?? null,
        navTop: navBounds?.top ?? null,
        lastStatAboveFixedNav: !!lastCellBounds && !!navBounds &&
          (getComputedStyle(document.querySelector(".app-nav")).position !== "fixed" ||
            lastCellBounds.bottom <= navBounds.top),
      },
    };
  });
  assert.equal(values.title, expectedTitle, viewportName + " detail title for " + expectedId);
  assert.equal(values.storyLabel, "Story", viewportName + " Story label for " + expectedId);
  assert.equal(values.storyHeading, "A field note", viewportName + " Story heading for " + expectedId);
  assert.equal(values.storyText, getCardLore(expectedId), viewportName + " exact original story for " + expectedId);
  assert.equal(values.storyVisible, true, viewportName + " Story is visible for " + expectedId);
  assert.equal(values.storySectionSeparateFromStatistics, true,
    viewportName + " Story is structurally separate from statistics for " + expectedId);
  assert.equal(values.storyBeforeStatistics, true,
    viewportName + " Story is presented before mechanics for " + expectedId);
  assert.ok(values.profileCount > 0 && values.statCount >= 7,
    viewportName + " truthful mechanics/statistics remain present for " + expectedId);
  assert.ok(values.horizontalOverflow.document <= values.horizontalOverflow.viewport &&
    values.horizontalOverflow.body <= values.horizontalOverflow.viewport,
  viewportName + " no horizontal overflow for " + expectedId + ": " +
    JSON.stringify(values.horizontalOverflow));
  return values;
}

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 933 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => failures.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const issue = { text: message.text(), location: message.location() };
      if (issue.location.url.endsWith("/favicon.ico"))
        sourceHostNonContentConsoleErrors.push(issue);
      else failures.push(issue);
    }
  });
  page.on("requestfailed", (request) => failures.push(
    request.url() + ": " + (request.failure()?.errorText ?? "request failed"),
  ));
  page.on("response", (response) => {
    if (response.status() >= 400) httpErrors.push({
      status: response.status(),
      url: response.url(),
    });
  });

  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('.app-nav [data-nav-to="cards"]').click();
  assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 9,
    "Cards screen exposes all nine original cards");
  for (const [id, title] of CARDS) {
    await page.locator('[data-card-grid] [data-card-id="' + id + '"]').click();
    await page.locator("[data-card-detail] .card-lore p").waitFor({ state: "visible" });
    const detail = await readDetail(page, id, title, "desktop");
    const shot = await capture(page, "desktop-" + id + "-1440x933.png");
    desktopResults.push({ id, title, story: detail.storyText, stats: detail.statCount,
      overflow: detail.horizontalOverflow, screenshot: shot });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.locator('.app-nav [data-nav-to="cards"]').click();
  assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 9,
    "390px Cards screen exposes all nine original cards");
  for (const [id, title] of CARDS) {
    if (await page.locator(".detail-back").isVisible()) {
      await page.locator(".detail-back").click();
    }
    await page.locator('[data-card-grid] [data-card-id="' + id + '"]').click();
    await page.locator("[data-card-detail] .card-lore p").waitFor({ state: "visible" });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const topDetail = await readDetail(page, id, title, "phone");
    const topShot = await capture(page, "phone-" + id + "-top-390x844.png");
    await page.evaluate(() => window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "instant",
    }));
    await page.evaluate(() => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const bottomDetail = await readDetail(page, id, title, "phone");
    assert.equal(bottomDetail.scroll.lastStatAboveFixedNav, true,
      "phone final statistic clears fixed navigation for " + id + ": " +
      JSON.stringify(bottomDetail.scroll));
    const bottomShot = await capture(page, "phone-" + id + "-bottom-390x844.png");
    phoneResults.push({
      id,
      title,
      story: topDetail.storyText,
      stats: topDetail.statCount,
      overflow: topDetail.horizontalOverflow,
      bottom: bottomDetail.scroll,
      screenshots: [topShot, bottomShot],
    });
  }

  assert.deepEqual(httpErrors, [], "source-hosted lore inspection has no HTTP errors");
  assert.deepEqual(failures, [], "source-hosted lore inspection has no browser errors");
  const evidence = {
    commit: "e235a0f7b53dabfb2cf88bbe30366f37ece1aefb",
    url,
    desktopViewport: { width: 1440, height: 933 },
    phoneViewport: { width: 390, height: 844 },
    desktop: desktopResults,
    phone: phoneResults,
    screenshots,
    httpErrors,
    sourceHostNonContentConsoleErrors,
    browserFailures: failures,
    result: "passed",
  };
  await writeFile(join(HERE, "browser-evidence.json"), JSON.stringify(evidence, null, 2) + "\n");
  process.stdout.write(JSON.stringify({
    result: evidence.result,
    commit: evidence.commit,
    desktopStories: desktopResults.length,
    phoneStories: phoneResults.length,
    screenshots: screenshots.length,
    largestPhoneScroll: Math.max(...phoneResults.map((result) => result.bottom.top)),
    maxPhoneNavOverlap: Math.max(...phoneResults.map((result) =>
      Math.max(0, result.bottom.lastStatBottom - result.bottom.navTop))),
    sourceHostFaviconConsoleErrors: sourceHostNonContentConsoleErrors.length,
    httpErrors: httpErrors.length,
    browserFailures: failures.length,
  }, null, 2) + "\n");
} finally {
  await browser.close();
  await vite.close();
}
