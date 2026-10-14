import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createPagesPreviewServer } from "../../../scripts/preview-pages.js";
import { projectSessionNonUnitBattleCard } from "../../../src/content/session-card-catalog.js";

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const pagesRoot = "/private/tmp/release-arena-failure-round2-pages-output";
const prefix = "/clash-royale-clone";
const { server } = await createPagesPreviewServer({
  root: pagesRoot,
  basePath: `${prefix}/`,
  logRequests: false,
});
server.listen(0, "127.0.0.1");
await once(server, "listening");
const address = server.address();
assert.ok(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const playwrightPath = process.env.GAME_BROWSER_PLAYWRIGHT;
assert.ok(playwrightPath, "portable wrapper must supply lockfile-pinned Playwright");
const { chromium } = await import(pathToFileURL(resolve(playwrightPath)).href);
const browser = await chromium.launch({
  executablePath: process.env.GAME_BROWSER_CHROME ?? chromium.executablePath(),
  headless: true,
});
const context = await browser.newContext({
  serviceWorkers: "block",
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const runtimeErrors = [];
const requestFailures = [];
const httpErrors = [];
page.on("pageerror", (error) => runtimeErrors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});
page.on("requestfailed", (request) =>
  requestFailures.push({ url: request.url(), error: request.failure()?.errorText ?? null }));
page.on("response", (response) => {
  if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
});

function format(number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number);
}

function targetLabel(mode) {
  if (mode === "air_and_ground" || mode === "ground-and-air") return "ground and air";
  if (mode === "ground") return "ground";
  if (mode === "air") return "air";
  return "not available";
}

function expectedProfile(card) {
  const profile = card.buildingRuntime;
  const suffix = profile.policy?.disposition === "question" ? " (QUESTION)" : "";
  return {
    Cost: `${format(card.cost)} elixir`,
    Health: `${format(profile.hitpoints)}${suffix}`,
    Damage: `${format(profile.damage)} per attack${suffix}`,
    Deploy: `${format(profile.deployTicks / 60)} s${suffix}`,
    "First hit": `${format(profile.firstHitTicks / 60)} s${suffix}`,
    "Hit speed": `${format(profile.hitSpeedTicks / 60)} s${suffix}`,
    Lifetime: `${format(profile.lifetimeTicks / 60)} s${suffix}`,
    Range: `${format(profile.maxRangeMillitiles / 1_000)} tiles${suffix}`,
    "Splash radius": `${profile.areaDamageRadiusMillitiles === null
      ? "None"
      : `${format(profile.areaDamageRadiusMillitiles / 1_000)} tiles`}${suffix}`,
    Targets: `${targetLabel(profile.targetMode ?? card.targetMode)}${suffix}`,
  };
}

async function inspectCard(cardId, screenshotName) {
  const cardButton = page.locator(`[data-card-grid] [data-card-id="${cardId}"]`);
  await cardButton.click();
  await page.locator("[data-card-detail] h2").waitFor();
  const detail = await page.locator("[data-card-detail]").evaluate((node) => ({
    name: node.querySelector("h2")?.textContent?.trim() ?? null,
    description: node.querySelector(".detail-description")?.textContent?.trim() ?? null,
    profiles: [...node.querySelectorAll(".unit-profile")].map((profile) => ({
      heading: profile.querySelector("h3")?.textContent?.trim() ?? null,
      note: profile.querySelector("p")?.textContent?.trim() ?? null,
      values: Object.fromEntries([...profile.querySelectorAll(".stat-cell")].map((cell) => [
        cell.querySelector("span")?.textContent?.trim() ?? "",
        cell.querySelector("strong")?.textContent?.trim() ?? "",
      ])),
    })),
  }));
  const canonicalCard = projectSessionNonUnitBattleCard(cardId);
  const expectedRows = expectedProfile(canonicalCard);
  assert.equal(detail.name, canonicalCard.displayName);
  assert.deepEqual(detail.profiles.map((profile) => profile.values), [expectedRows]);
  assert.match(detail.profiles[0].note ?? "", /Cost is source backed; combat values are provisional profile estimates and remain QUESTION/u);
  assert.ok(!detail.profiles[0].values.Cost.includes("QUESTION"));
  assert.ok(Object.entries(detail.profiles[0].values)
    .filter(([label]) => label !== "Cost")
    .every(([, value]) => value.includes("QUESTION")));
  const screenshot = resolve(evidenceDirectory, screenshotName);
  await page.screenshot({ path: screenshot, fullPage: true });
  return {
    id: cardId,
    name: canonicalCard.displayName,
    canonicalProfile: canonicalCard.buildingRuntime,
    displayedProfile: detail.profiles,
    displayedDescription: detail.description,
    screenshot,
  };
}

let report;
try {
  const landingResponse = await page.goto(`${origin}${prefix}/`, { waitUntil: "networkidle" });
  assert.equal(landingResponse?.status(), 200);
  const landing = {
    title: await page.title(),
    status: landingResponse.status(),
    gameHref: await page.locator('a[href*="game/public/index.html"]').first().getAttribute("href"),
  };
  const gameUrl = `${origin}${prefix}/game/public/index.html`;
  const gameResponse = await page.goto(gameUrl, { waitUntil: "networkidle" });
  assert.equal(gameResponse?.status(), 200);
  assert.equal(await page.title(), "Moss & Ember — Card battler");
  const navigation = await page.locator(".app-nav [data-nav-to]").count();
  const defaultDeckSize = await page.locator("[data-deck-size]").first().innerText();
  const defaultDeckCardIds = await page.locator("[data-home-deck] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-card-id")));
  const cardsTab = page.locator('[data-nav-to="cards"]');
  await cardsTab.focus();
  await page.keyboard.press("Enter");
  const cardIds = await page.locator("[data-card-grid] [data-card-id]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-card-id")));
  assert.equal(cardIds.length, 21);
  assert.ok(cardIds.includes("buried-coil"));
  const buriedCoil = await inspectCard("buried-coil", "buried-coil-project-prefix-1440x1000.png");
  await page.keyboard.press("Escape");
  const emberBasin = await inspectCard("ember-basin", "ember-basin-project-prefix-1440x1000.png");
  report = {
    candidate: "8a89beebcffea1a51a492da4140c3f42c30f7bb6",
    pagesPrefix: prefix,
    pagesOutput: pagesRoot,
    landing,
    game: {
      url: gameUrl,
      status: gameResponse.status(),
      title: await page.title(),
      navigationButtonCount: navigation,
      defaultDeckSize,
      defaultDeckCardIds,
      admittedCardCount: cardIds.length,
      admittedCardIds: cardIds,
      buriedCoil,
      emberBasin,
    },
    runtimeErrors,
    requestFailures,
    httpErrors,
  };
  assert.deepEqual(runtimeErrors, []);
  assert.deepEqual(requestFailures, []);
  assert.deepEqual(httpErrors, []);
} finally {
  await context.close();
  await browser.close();
  await new Promise((resolveClose, rejectClose) => server.close((error) =>
    error ? rejectClose(error) : resolveClose()));
}
await writeFile(
  resolve(evidenceDirectory, "actual-project-pages-details.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
