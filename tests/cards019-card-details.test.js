import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import { getCardLore } from "../src/ui/card-lore.js";
import { getCardPortrait, getCardPortraitIds } from "../src/ui/card-portrait-art.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.CARDS019D_BROWSER_ARTIFACTS ??
  new URL("../artifacts/cards019d-round-1/builder/", import.meta.url).pathname;

const EXPECTED_OLD_CARD_IDS = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting",
  "briar-band", "cinderlings", "stonehauler", "thornscouts", "forgeguard", "squall-orb",
  "cinder-host", "ironroot", "sunthread-pair", "duskwing-trio", "gloamwing-cluster",
  "coppershade-flock", "ember-basin",
]);
const EXPECTED_COLLECTION_IDS = Object.freeze([...EXPECTED_OLD_CARD_IDS, "kilnkeeper"]);
const EXPECTED_DEFAULT_DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);
const KILNKEEPER_LORE = "Kilnkeeper tends the warm river kilns where rootwood beams are steamed and copper vessels are shaped, keeping each emberseed dry between shifts. When raiders threaten the workshop, he loads one emberseed into his broad-mouthed launcher and sends a single burst of sparks skittering across the ground.";
const KILNKEEPER_PORTRAIT = Object.freeze({
  bytes: 65_626,
  path: "public/assets/kilnkeeper-portrait-painted.webp",
  sha256: "38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240",
});
const EXPECTED_OLD_MAPPINGS_SHA256 = "81c05bdd4e1f3cab949409ebccee575f29d4f3e1116fa3cbd5d9dddabc245dd3";
const EXPECTED_OLD_LORE_SHA256 = "575ffb9a932b2e5d33c610539615e8bf94e925bbf1f82dee06384aa3f4407c05";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function serverAddress(stream) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("Cards019D browser server stopped before readiness");
}

function oldMappingSnapshots() {
  const portraitIds = getCardPortraitIds().filter((id) => id !== "kilnkeeper");
  const portraitRows = portraitIds.map((id) => {
    const portrait = getCardPortrait(id);
    return [id, portrait.asset, portrait.cell];
  });
  const loreRows = portraitIds.map((id) => [id, getCardLore(id)]);
  return { loreRows, portraitIds, portraitRows };
}

test("Cards019D Kilnkeeper collection portrait and lore render in real Chrome", {
  timeout: 600_000,
}, async (t) => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  await mkdir(ARTIFACTS, { recursive: true });

  assert.deepEqual(PLAYABLE_CARD_IDS, EXPECTED_DEFAULT_DECK,
    "the existing playable default deck remains the same eight cards in order");
  const sourcePortrait = await readFile(new URL(
    `../${KILNKEEPER_PORTRAIT.path}`, import.meta.url));
  assert.equal(sourcePortrait.byteLength, KILNKEEPER_PORTRAIT.bytes);
  assert.equal(sha256(sourcePortrait), KILNKEEPER_PORTRAIT.sha256,
    "the accepted Kilnkeeper portrait asset remains byte-identical");
  assert.deepEqual(getCardPortraitIds(), EXPECTED_COLLECTION_IDS,
    "Kilnkeeper is the only new portrait mapping after the original nineteen");
  const oldMappings = oldMappingSnapshots();
  assert.deepEqual(oldMappings.portraitIds, EXPECTED_OLD_CARD_IDS);
  assert.equal(sha256(Buffer.from(JSON.stringify(oldMappings.portraitRows))),
    EXPECTED_OLD_MAPPINGS_SHA256, "all prior portrait mappings remain unchanged");
  assert.equal(sha256(Buffer.from(JSON.stringify(oldMappings.loreRows))),
    EXPECTED_OLD_LORE_SHA256, "all prior lore mappings remain unchanged");
  const newPortrait = getCardPortrait("kilnkeeper");
  assert.deepEqual({ asset: newPortrait.asset, cell: newPortrait.cell }, {
    asset: "kilnkeeper-portrait-painted", cell: null,
  });
  assert.equal(new URL(newPortrait.src).pathname.endsWith(
    "/public/assets/kilnkeeper-portrait-painted.webp"), true);
  assert.equal(getCardLore("kilnkeeper"), KILNKEEPER_LORE);
  assert.equal(KILNKEEPER_LORE.split(/(?<=[.!?])\s+/u).length, 2,
    "the approved field note is exactly two sentences");

  const temporary = await mkdtemp(join(tmpdir(), "cards019d-browser-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const manifestBytes = await readFile(join(releaseRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const releasePortrait = manifest.files.find(({ path }) =>
    path === KILNKEEPER_PORTRAIT.path);
  assert.ok(releasePortrait, "the production release contains the accepted portrait asset");
  assert.equal(releasePortrait.sha256, KILNKEEPER_PORTRAIT.sha256);
  assert.equal(releasePortrait.size, KILNKEEPER_PORTRAIT.bytes);

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => server.kill("SIGTERM"));
  const address = await serverAddress(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());

  const contexts = [
    { name: "phone-normal", viewport: { width: 390, height: 844 }, reducedMotion: "no-preference" },
    { name: "phone-reduced", viewport: { width: 390, height: 844 }, reducedMotion: "reduce" },
    { name: "desktop-normal", viewport: { width: 1440, height: 933 }, reducedMotion: "no-preference" },
    { name: "desktop-reduced", viewport: { width: 1440, height: 933 }, reducedMotion: "reduce" },
  ];
  const evidence = {
    acceptedPortrait: { ...KILNKEEPER_PORTRAIT },
    browserVersion: browser.version(),
    collectionIds: [],
    defaultDeckIds: [...EXPECTED_DEFAULT_DECK],
    manifest: { fileCount: manifest.fileCount, sha256: sha256(manifestBytes) },
    contexts: [],
    errors: [],
  };
  const contentSignatures = [];

  try {
    for (const contextSpec of contexts) {
      const context = await browser.newContext({
        deviceScaleFactor: 1,
        reducedMotion: contextSpec.reducedMotion,
        viewport: contextSpec.viewport,
      });
      const page = await context.newPage();
      const responseReads = [];
      const contextErrors = [];
      page.on("pageerror", (error) => contextErrors.push(`pageerror: ${String(error)}`));
      page.on("console", (message) => {
        if (message.type() === "error") contextErrors.push(`console: ${message.text()}`);
      });
      page.on("requestfailed", (request) => contextErrors.push(
        `requestfailed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
      ));
      page.on("response", (response) => {
        const url = new URL(response.url());
        if (url.origin !== origin) return;
        responseReads.push((async () => {
          const body = await response.body();
          return {
            bytes: body.byteLength,
            path: url.pathname,
            sha256: sha256(body),
            status: response.status(),
            type: response.headers()["content-type"] ?? "",
          };
        })());
      });

      const appResponse = await page.goto(`${origin}/public/index.html`, {
        waitUntil: "networkidle",
      });
      assert.equal(appResponse.status(), 200);
      assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches),
        contextSpec.reducedMotion === "reduce");
      await page.locator('[data-nav-to="cards"]').click();
      const cards = page.locator("[data-card-grid] [data-card-id]");
      const collectionIds = await cards.evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
      assert.equal(collectionIds.length, 20,
        `${contextSpec.name}: all twenty choices appear in the actual collection`);
      assert.deepEqual([...collectionIds].sort(), [...EXPECTED_COLLECTION_IDS].sort(),
        `${contextSpec.name}: the original nineteen and Kilnkeeper are the exact collection`);
      evidence.collectionIds = collectionIds;

      const collectionImageMetrics = await page.locator(
        '[data-card-grid] [data-card-id="kilnkeeper"] .card-art-image',
      ).evaluate(async (image) => {
        await image.decode();
        const imageRect = image.getBoundingClientRect();
        const windowRect = image.closest(".card-art-window").getBoundingClientRect();
        const artRect = image.closest(".card-art").getBoundingClientRect();
        return {
          complete: image.complete,
          currentSrc: image.currentSrc,
          imageRect: { x: imageRect.x, y: imageRect.y, width: imageRect.width, height: imageRect.height },
          naturalSize: [image.naturalWidth, image.naturalHeight],
          windowRect: { width: windowRect.width, height: windowRect.height },
          artRect: { width: artRect.width, height: artRect.height },
        };
      });
      assert.ok(collectionImageMetrics.complete && collectionImageMetrics.naturalSize[0] > 0 &&
        collectionImageMetrics.naturalSize[1] > 0 && collectionImageMetrics.windowRect.width > 0 &&
        collectionImageMetrics.windowRect.height > 0,
      `${contextSpec.name}: collection portrait decodes and has a visible native image window`);
      assert.match(collectionImageMetrics.currentSrc,
        /kilnkeeper-portrait-painted(?:-[A-Za-z0-9_-]+)?\.webp(?:\?|$)/u);

      const collectionImages = await page.locator("[data-card-grid] .card-art-image").evaluateAll(
        async (images) => {
          await Promise.all(images.map((image) => image.decode()));
          return images.map((image) => ({
            cardId: image.closest("[data-card-id]")?.dataset.cardId,
            decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
          }));
        },
      );
      assert.equal(collectionImages.length, 20);
      assert.ok(collectionImages.every(({ decoded }) => decoded),
        `${contextSpec.name}: all twenty displayed collection portraits decode`);

      const collectionScreenshot = contextSpec.name === "phone-normal" ||
        contextSpec.name === "desktop-normal"
        ? `${contextSpec.name}-collection.png` : null;
      if (collectionScreenshot) {
        await page.screenshot({ path: join(ARTIFACTS, collectionScreenshot) });
      }

      await page.locator('[data-card-grid] [data-card-id="kilnkeeper"]').click();
      assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Kilnkeeper");
      const lore = await page.locator("[data-card-detail] .card-lore p").innerText();
      assert.equal(lore, KILNKEEPER_LORE,
        `${contextSpec.name}: accepted two-sentence field note appears without changes`);
      const detailDescription = await page.locator("[data-card-detail] .detail-description").innerText();
      assert.match(detailDescription, /provisional for historical comparison/u,
        `${contextSpec.name}: provisional classification stays explicit`);
      const combatConfidenceCaveat = "The 5-elixir cost is source backed; combat values are unverified estimates and remain QUESTION for historical comparison.";
      assert.ok(detailDescription.includes(combatConfidenceCaveat),
        `${contextSpec.name}: source confidence for Kilnkeeper combat values is explicit`);
      const detailDescriptionViewport = await page.locator(
        "[data-card-detail] .detail-description",
      ).evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          bottom: rect.bottom,
          display: style.display,
          height: rect.height,
          left: rect.left,
          opacity: Number(style.opacity),
          right: rect.right,
          top: rect.top,
          visibility: style.visibility,
          width: rect.width,
          viewportHeight: window.innerHeight,
          viewportWidth: window.innerWidth,
        };
      });
      assert.ok(detailDescriptionViewport.display !== "none" &&
        detailDescriptionViewport.visibility === "visible" &&
        detailDescriptionViewport.opacity > 0 && detailDescriptionViewport.width > 0 &&
        detailDescriptionViewport.height > 0 && detailDescriptionViewport.top >= 0 &&
        detailDescriptionViewport.bottom <= detailDescriptionViewport.viewportHeight &&
        detailDescriptionViewport.left >= 0 &&
        detailDescriptionViewport.right <= detailDescriptionViewport.viewportWidth,
      `${contextSpec.name}: combat-value caveat is visibly within the native viewport`);
      const detailImageMetrics = await page.locator(
        "[data-card-detail] .detail-portrait .card-art-image",
      ).evaluate(async (image) => {
        await image.decode();
        const outer = image.closest(".detail-portrait").getBoundingClientRect();
        const windowRect = image.closest(".card-art-window").getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        return {
          complete: image.complete,
          currentSrc: image.currentSrc,
          imageRect: { width: imageRect.width, height: imageRect.height },
          naturalSize: [image.naturalWidth, image.naturalHeight],
          outer: { width: outer.width, height: outer.height },
          window: { width: windowRect.width, height: windowRect.height },
        };
      });
      assert.ok(detailImageMetrics.complete && detailImageMetrics.naturalSize[0] > 0 &&
        detailImageMetrics.naturalSize[1] > 0 && detailImageMetrics.outer.width > 0 &&
        detailImageMetrics.outer.height > 0,
      `${contextSpec.name}: detail portrait decodes and remains visible`);
      assert.equal(detailImageMetrics.currentSrc, collectionImageMetrics.currentSrc,
        `${contextSpec.name}: list and detail reuse the same accepted portrait URL`);
      assert.equal(detailImageMetrics.outer.width,
        contextSpec.viewport.width <= 760 ? 64 : 78,
        `${contextSpec.name}: detail portrait uses the existing responsive CSS size`);
      const profileCopy = await page.locator("[data-card-detail] .unit-profile > p").innerText();
      assert.match(profileCopy, /provisional for historical comparison/u);
      assert.ok(profileCopy.includes(combatConfidenceCaveat),
        `${contextSpec.name}: stat profile repeats the source caveat beside combat values`);
      const detailCost = await page.locator("[data-card-detail] .detail-cost").innerText();
      assert.equal(detailCost, "5", "the existing provisional card cost is presented as 5 elixir");

      const signature = {
        collectionIds: [...collectionIds],
        cost: detailCost,
        description: detailDescription,
        lore,
        portrait: new URL(detailImageMetrics.currentSrc).pathname,
        profile: profileCopy,
        title: await page.locator("[data-card-detail] h2").innerText(),
      };
      contentSignatures.push({ name: contextSpec.name, signature });
      const detailScreenshot = `${contextSpec.name}-details.png`;
      await page.screenshot({ path: join(ARTIFACTS, detailScreenshot) });

      if (contextSpec.viewport.width <= 760) {
        await page.locator('[data-action="back-to-cards"]').click();
        await page.waitForFunction(() => document.activeElement?.dataset?.cardId === "kilnkeeper");
      } else {
        await page.locator('.app-nav [data-nav-to="cards"]').click();
      }
      assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 20,
        `${contextSpec.name}: back returns to the full collection`);
      const returnedImages = await page.locator("[data-card-grid] .card-art-image").evaluateAll(
        async (images) => {
          await Promise.all(images.map((image) => image.decode()));
          return images.every((image) => image.complete && image.naturalWidth > 0);
        },
      );
      assert.equal(returnedImages, true,
        `${contextSpec.name}: all collection portraits remain decoded after back navigation`);
      const backScreenshot = contextSpec.name === "phone-normal"
        ? `${contextSpec.name}-back.png`
        : contextSpec.name === "desktop-normal" ? `${contextSpec.name}-collection-return.png` : null;
      if (backScreenshot) await page.screenshot({ path: join(ARTIFACTS, backScreenshot) });

      await page.locator('.app-nav [data-nav-to="deck"]').click();
      const deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll(
        (nodes) => nodes.map((node) => node.dataset.cardId),
      );
      assert.deepEqual(deckIds, EXPECTED_DEFAULT_DECK,
        `${contextSpec.name}: browsing the new card leaves the existing default deck unchanged`);
      assert.equal(await page.locator("[data-deck-size]").first().innerText(), "8");
      const deckImagesDecode = await page.locator("[data-deck-cards] .card-art-image").evaluateAll(
        async (images) => {
          await Promise.all(images.map((image) => image.decode()));
          return images.every((image) => image.complete && image.naturalWidth > 0 && image.naturalHeight > 0);
        },
      );
      assert.equal(deckImagesDecode, true, `${contextSpec.name}: all deck images decode`);
      const deckScreenshot = contextSpec.name === "phone-normal" ||
        contextSpec.name === "desktop-normal" ? `${contextSpec.name}-deck.png` : null;
      if (deckScreenshot) await page.screenshot({ path: join(ARTIFACTS, deckScreenshot) });
      let customDeckIds = null;
      let customDeckPortrait = null;
      let customDeckScreenshot = null;
      if (contextSpec.name === "phone-normal") {
        await page.locator('[data-replace-slot="0"]').click();
        await page.locator('[data-replacement-card-id="kilnkeeper"]').click();
        customDeckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll(
          (nodes) => nodes.map((node) => node.dataset.cardId),
        );
        assert.deepEqual(customDeckIds, ["kilnkeeper", ...EXPECTED_DEFAULT_DECK.slice(1)],
          "choosing Kilnkeeper creates the expected eight-card custom lineup");
        assert.equal(new Set(customDeckIds).size, 8);
        assert.equal(await page.locator("[data-deck-kind]").first().innerText(), "CUSTOM DECK");
        customDeckPortrait = await page.locator(
          '[data-deck-cards] [data-card-id="kilnkeeper"] .card-art-image',
        ).evaluate(async (image) => {
          await image.decode();
          return {
            complete: image.complete,
            currentSrc: image.currentSrc,
            naturalSize: [image.naturalWidth, image.naturalHeight],
          };
        });
        assert.ok(customDeckPortrait.complete && customDeckPortrait.naturalSize[0] > 0 &&
          customDeckPortrait.naturalSize[1] > 0);
        assert.equal(customDeckPortrait.currentSrc, detailImageMetrics.currentSrc,
          "the custom deck uses the same accepted portrait as collection and detail views");
        customDeckScreenshot = "phone-normal-custom-deck.png";
        await page.screenshot({ path: join(ARTIFACTS, customDeckScreenshot) });
      }

      await page.waitForLoadState("networkidle");
      const responses = await Promise.all(responseReads);
      assert.ok(responses.some(({ path, status }) => path.endsWith("kilnkeeper-portrait-painted.webp") && status === 200),
        `${contextSpec.name}: browser loaded the accepted Kilnkeeper source image successfully`);
      assert.deepEqual(contextErrors, [], `${contextSpec.name}: browser console and network have no errors`);
      evidence.errors.push(...contextErrors);
      evidence.contexts.push({
        ...contextSpec,
        deviceScaleFactor: 1,
        collectionIds,
        collectionImageMetrics,
        collectionImages,
        detailImageMetrics,
        deckIds,
        deckImagesDecode,
        customDeckIds,
        customDeckPortrait,
        lore,
        detailDescription,
        detailDescriptionViewport,
        detailCost,
        profileCopy,
        screenshots: await Promise.all([collectionScreenshot, detailScreenshot, backScreenshot,
          deckScreenshot, customDeckScreenshot]
          .filter(Boolean).map(async (name) => {
            const bytes = await readFile(join(ARTIFACTS, name));
            return {
              name,
              pixelSize: [bytes.readUInt32BE(16), bytes.readUInt32BE(20)],
              sha256: sha256(bytes),
            };
          })),
        responses: responses.filter(({ path }) => path.endsWith("kilnkeeper-portrait-painted.webp") ||
          path.endsWith("index.html") || path.endsWith(".js") || path.endsWith(".css")),
      });
      await context.close();
    }
  } finally {
    await browser.close();
  }

  assert.ok(contentSignatures.every(({ signature }) =>
    JSON.stringify(signature) === JSON.stringify(contentSignatures[0].signature)),
  "collection membership, approved lore, provisional description and portrait mapping are identical across viewports and motion settings");
  evidence.contentSignatureSha256 = sha256(Buffer.from(JSON.stringify(contentSignatures[0].signature)));
  evidence.contentSignatures = contentSignatures;
  evidence.contexts = evidence.contexts.map(({ responses, ...context }) => ({
    ...context,
    responses: responses.sort((left, right) => left.path.localeCompare(right.path)),
  }));
  await writeFile(join(ARTIFACTS, "browser-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);
});
