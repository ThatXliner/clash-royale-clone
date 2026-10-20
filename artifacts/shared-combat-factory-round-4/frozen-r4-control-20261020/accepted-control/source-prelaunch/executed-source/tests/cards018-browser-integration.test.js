import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.CARDS018_BROWSER_ARTIFACTS ??
  new URL("../artifacts/cards018-browser-round-1/builder/", import.meta.url).pathname;
const ARENA_MODULE = "src/ui/arena-shell-entry.js";
const EMBER_DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "squall-orb", "ember-basin",
]);

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
  throw new Error("Cards018 browser server stopped before readiness");
}

async function settlePaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(280);
}

async function clickWorldPoint(page, arena, x, y) {
  const box = await arena.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0, "the actual arena has a visible input surface");
  const metrics = await arena.evaluate((node) => ({
    borderLeft: node.clientLeft,
    borderTop: node.clientTop,
    clientHeight: node.clientHeight,
    clientWidth: node.clientWidth,
    rectHeight: node.getBoundingClientRect().height,
    rectWidth: node.getBoundingClientRect().width,
  }));
  const scaleX = box.width / metrics.rectWidth;
  const scaleY = box.height / metrics.rectHeight;
  const point = {
    x: box.x + (metrics.borderLeft + metrics.clientWidth * x / 18_000) * scaleX,
    y: box.y + (metrics.borderTop + metrics.clientHeight * (32_000 - y) / 32_000) * scaleY,
  };
  await page.mouse.click(point.x, point.y);
  return point;
}

async function waitForCustomDeck(frame, moduleUrl, ids) {
  await frame.waitForFunction(async ({ entryUrl, expectedIds }) => {
    const { arenaHudController } = await import(entryUrl);
    return JSON.stringify(JSON.parse(arenaHudController.session.serialize()).setup.deck) ===
      JSON.stringify(expectedIds);
  }, { entryUrl: moduleUrl, expectedIds: ids }, { timeout: 10_000 });
}

async function readFrameEvidence(frame, moduleUrl) {
  return frame.evaluate(async (entryUrl) => {
    const { arenaHudController } = await import(entryUrl);
    const controller = arenaHudController;
    const layer = (name) => document.querySelector(
      `[data-game-browser-layer="${name}"]`,
    )?.innerHTML ?? null;
    const marker = document.querySelector(
      '.combat-marker[data-kind="ember-basin"][data-side="south"]',
    );
    const image = marker?.querySelector("svg.combat-art image");
    return {
      browserBytes: controller.serialize(),
      combat: layer("combat"),
      effects: layer("effects"),
      feedback: layer("feedback"),
      hud: layer("hud"),
      marker: marker ? {
        artId: marker.querySelector("svg.combat-art")?.dataset.artId ?? null,
        bounds: (() => {
          const rect = marker.getBoundingClientRect();
          return [rect.x, rect.y, rect.width, rect.height];
        })(),
        hp: marker.querySelector(".combat-health")?.style.getPropertyValue("--combat-health") ?? null,
        imageHref: image?.getAttribute("href") ?? null,
        targeting: marker.dataset.targeting ?? null,
      } : null,
      sessionBytes: controller.session.serialize(),
      sessionTick: controller.session.state.tick,
    };
  }, moduleUrl);
}

test("Cards018 Ember Basin: editable collection enters real mixed battle and restores splash state", {
  timeout: 600_000,
}, async (t) => {
  assert.ok(existsSync(PLAYWRIGHT),
    "installed Playwright is required");
  assert.ok(existsSync(CHROME),
    "installed Chrome is required");
  await mkdir(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "cards018-browser-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const manifestBytes = await readFile(join(releaseRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const artProvenance = JSON.parse(await readFile(new URL(
    "../docs/art/ember-basin-battle-sprite-provenance.json", import.meta.url), "utf8"));
  const artRecord = artProvenance.assets.find(({ asset }) =>
    asset === "public/assets/ember-basin-battle-sprite.webp");
  const inputRecord = artProvenance.input_images.find(({ asset }) =>
    asset === "demo/assets/ember-basin-portrait-v2.png");
  assert.ok(artRecord && inputRecord, "complete art provenance identifies its input and output");
  const [portraitInput, battleSourcePng, battleOutputWebp] = await Promise.all([
    readFile(new URL("../demo/assets/ember-basin-portrait-v2.png", import.meta.url)),
    readFile(new URL("../demo/assets/ember-basin-battle-sprite.png", import.meta.url)),
    readFile(join(releaseRoot, artRecord.asset)),
  ]);
  assert.equal(sha256(portraitInput), inputRecord.sha256);
  assert.equal(portraitInput.byteLength, inputRecord.bytes);
  assert.equal(sha256(battleSourcePng), artRecord.source_sha256);
  assert.equal(battleSourcePng.byteLength, artRecord.source_bytes);
  assert.equal(battleSourcePng.readUInt32BE(16), artRecord.source_dimensions.width);
  assert.equal(battleSourcePng.readUInt32BE(20), artRecord.source_dimensions.height);
  assert.equal(battleSourcePng[25], 6, "the full-resolution PNG stores RGBA alpha");
  assert.equal(sha256(battleOutputWebp), artRecord.sha256);
  assert.equal(battleOutputWebp.byteLength, artRecord.bytes);
  const releasedArtRecord = manifest.files.find(({ path }) => path === artRecord.asset);
  assert.ok(releasedArtRecord, "the release manifest contains the provenance output");
  assert.equal(releasedArtRecord.sha256, artRecord.sha256);
  const assetProvenanceReceipt = {
    input: { path: inputRecord.asset, bytes: portraitInput.byteLength, sha256: sha256(portraitInput) },
    source: { path: artRecord.source_png, bytes: battleSourcePng.byteLength,
      dimensions: artRecord.source_dimensions, sha256: sha256(battleSourcePng) },
    output: { path: artRecord.asset, bytes: battleOutputWebp.byteLength,
      dimensions: artRecord.dimensions, sha256: sha256(battleOutputWebp) },
    provenancePath: "docs/art/ember-basin-battle-sprite-provenance.json",
  };
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  t.after(() => server.kill("SIGTERM"));
  const address = await serverAddress(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const moduleUrl = new URL(`/${ARENA_MODULE}`, origin).href;
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  t.after(() => browser.close());
  const context = await browser.newContext({
    deviceScaleFactor: 1,
    reducedMotion: "no-preference",
    viewport: { height: 844, width: 390 },
  });
  const page = await context.newPage();
  const errors = [];
  const successfulPaths = new Set();
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("requestfailed", (request) => errors.push(
    `requestfailed: ${request.url()} ${request.failure()?.errorText ?? "unknown"}`,
  ));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 200 && response.status() < 400) {
      successfulPaths.add(url.pathname.slice(1));
    }
  });
  const screenshots = [];
  const motionUiEvidence = [];
  const evidence = {
    asset: null,
    assetProvenance: assetProvenanceReceipt,
    combat: {},
    deck: [...EMBER_DECK],
    errors,
    release: { fileCount: manifest.fileCount, manifestSha256: sha256(manifestBytes) },
    screenshots,
    motionUiEvidence,
    trustedInput: [],
  };

  try {
    const appResponse = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(appResponse.status(), 200);
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.locator('[data-replace-slot="6"]').click();
    await page.locator('[data-replacement-card-id="squall-orb"]').click();
    await page.locator('[data-replace-slot="7"]').click();
    await page.locator('[data-replacement-card-id="ember-basin"]').click();
    const deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.deepEqual(deckIds, EMBER_DECK,
      "the real replacement flow saves six troops, Squall Orb, and Ember Basin in deck order");
    assert.equal(await page.locator("[data-deck-size]").first().innerText(), "8");
    assert.equal(await page.locator("[data-deck-kind]").first().innerText(), "CUSTOM DECK");
    await page.screenshot({ path: join(ARTIFACTS, "custom-deck-phone-390x844.png"), fullPage: true });
    screenshots.push({ file: "custom-deck-phone-390x844.png", sha256: sha256(await readFile(
      join(ARTIFACTS, "custom-deck-phone-390x844.png"))), viewport: [390, 844] });

    await page.locator('.app-nav [data-nav-to="cards"]').click();
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 20,
      "the released collection visibly contains exactly twenty cards");
    const emberCard = page.locator('[data-card-grid] [data-card-id="ember-basin"]');
    await emberCard.click();
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Ember Basin");
    assert.equal(await page.locator("[data-card-detail] .detail-cost").innerText(), "4");
    assert.match(await page.locator("[data-card-detail] .detail-description").innerText(),
      /Stationary defensive structure.*QUESTION/u);
    assert.match(await page.locator("[data-card-detail] .unit-profile").innerText(),
      /Cost is source backed; combat values are provisional profile estimates/u);
    assert.equal(await page.locator("[data-card-detail] .unit-profile .stat-cell").count(), 10);
    assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
      "The Ember Basin stands where the creek turns, its copper lip warmed by emberseeds carried down from the Moss & Ember workshop. At dusk, twin braces hold its long copper-ribbed launch channel above the water, ready to turn any unwelcome visitor away.");
    const portrait = await page.locator("[data-card-detail] .detail-portrait .card-art-image").evaluate(
      async (image) => {
        await image.decode();
        return { complete: image.complete, naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth, path: new URL(image.currentSrc).pathname };
      },
    );
    assert.deepEqual(portrait, { complete: true, naturalHeight: 512, naturalWidth: 512,
      path: "/public/assets/ember-basin-portrait-painted-v2.webp" });
    await page.screenshot({ path: join(ARTIFACTS, "ember-basin-details-phone-390x844.png"), fullPage: true });
    screenshots.push({ file: "ember-basin-details-phone-390x844.png", sha256: sha256(await readFile(
      join(ARTIFACTS, "ember-basin-details-phone-390x844.png"))), viewport: [390, 844] });

    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const frameLocator = page.frameLocator("[data-battle-frame-slot] iframe");
    const arenaLocator = frameLocator.locator('[data-ui="arena"]');
    await arenaLocator.waitFor({ state: "visible", timeout: 10_000 });
    const frame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(frame, "the app mounted its released battle frame");
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.enterManualStepMode();
    }, moduleUrl);
    await waitForCustomDeck(frame, moduleUrl, deckIds);
    const actualSetup = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.parse(arenaHudController.session.serialize()).setup;
    }, moduleUrl);
    assert.deepEqual(actualSetup, JSON.parse(createEditableGameSessionSetup(deckIds)),
      "the app launches the exact canonical mixed editable-deck setup");
    const initial = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return {
        hand: arenaHudController.session.state.decks.south.hand,
        sequence: arenaHudController.session.state.decks.south.sequence,
        elixir: arenaHudController.session.state.elixir.sides.south.amount,
        tick: arenaHudController.session.state.tick,
      };
    }, moduleUrl);
    assert.ok(initial.hand.includes("ember-basin"),
      `seed-zero mixed deck opens with Ember available: ${JSON.stringify(initial)}`);
    const selectedStructure = frameLocator.locator(
      '[data-ui="card-slot"][data-card-id="ember-basin"]',
    );
    await selectedStructure.click();
    assert.equal(await frameLocator.locator(
      '[data-ui="hud-hand"] [data-card-id="ember-basin"]',
    ).getAttribute("data-selected"), "true",
    "a legal battle hand control selects Ember through the released UI");
    await frame.evaluate(() => {
      globalThis.__cards018Pointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards018Pointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    await clickWorldPoint(page, arenaLocator, 3_500, 14_500);
    const committed = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.stepMany(1);
      const session = arenaHudController.session;
      const record = session.replay.find(({ side, type }) =>
        side === "south" && type === "session-structure-deployed");
      return {
        elixir: session.state.elixir.sides.south.amount,
        hand: session.state.decks.south.hand,
        pointers: globalThis.__cards018Pointers,
        record,
        sequence: session.state.decks.south.sequence,
        structure: session.state.battle.structures.find(({ cardId, side }) =>
          cardId === "ember-basin" && side === "south") ?? null,
        tick: session.state.tick,
      };
    }, moduleUrl);
    assert.ok(committed.record, "the trusted browser gesture commits into the shared GameSession");
    assert.equal(committed.record.spend.cost, 4);
    assert.equal(committed.record.materialization.cardId, "ember-basin");
    assert.deepEqual(committed.record.materialization.point, { x: 3_500, y: 14_500 });
    assert.equal(committed.sequence, initial.sequence + 1,
      "Ember advances the eight-card cycle exactly once");
    assert.equal(committed.elixir, initial.elixir - 4,
      "Ember spends exactly its source-backed four elixir");
    assert.ok(!committed.hand.includes("ember-basin"));
    assert.equal(committed.pointers.some(({ isTrusted }) => isTrusted), true,
      "the legal deployment came from a trusted browser pointer event");
    evidence.trustedInput.push({ action: "select-card", trusted: true },
      { action: "deploy-ember-basin", point: { x: 3_500, y: 14_500 }, trusted: true });

    const firstAttack = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const structure = controller.session.state.battle.structures.find(({ cardId, side }) =>
        cardId === "ember-basin" && side === "south");
      let steps = 0;
      while (!controller.session.replay.some(({ buildingId, type }) =>
        buildingId === structure?.id && type === "structure-attack") && steps < 240) {
        controller.stepMany(1);
        steps += 1;
      }
      const state = controller.session.state;
      const liveStructure = state.battle.structures.find(({ id }) => id === structure?.id);
      const pending = state.battle.pendingBuildingHits;
      const pendingTargetIds = pending.map(({ targetId }) => targetId);
      const targetHealth = Object.fromEntries(pendingTargetIds.map((id) => [id,
        state.battle.units.find(({ id: unitId }) => unitId === id)?.hitpoints ?? null]));
      const attack = controller.session.replay.find(({ buildingId, type }) =>
        buildingId === structure.id && type === "structure-attack");
      const checkpoint = controller.serialize();
      const replayLength = controller.session.replay.length;
      const beforeRestoreSession = controller.session.serialize();
      controller.restore(checkpoint);
      const exactAtRestore = controller.serialize() === checkpoint &&
        controller.session.serialize() === beforeRestoreSession;
      controller.stepMany(1);
      const restoredEvents = controller.session.replay.filter(({ externalSourceId, type }) =>
        externalSourceId === `building:${structure.id}` && type === "damage");
      const allNewEvents = controller.session.replay.slice(replayLength);
      const afterHealth = Object.fromEntries(pendingTargetIds.map((id) => [id,
        controller.session.state.battle.units.find(({ id: unitId }) => unitId === id)?.hitpoints ?? null]));
      return {
        afterHealth,
        attack,
        exactAtRestore,
        allNewEvents,
        pending,
        pendingTargetIds,
        restoredEvents,
        steps,
        structure: { id: structure?.id ?? null, alive: liveStructure?.alive ?? false,
          hitpoints: liveStructure?.hitpoints ?? 0, targetKey: liveStructure?.targetKey ?? null },
        targetHealth,
        tick: state.tick,
      };
    }, moduleUrl);
    assert.ok(firstAttack.attack, "Ember reaches its real attack cycle in the shared runtime");
    assert.equal(firstAttack.attack.tick, committed.record.tick + 126,
      "the emitted first hit follows the configured 60-tick deploy plus 66-tick first-hit timing from its actual placement tick");
    assert.equal(firstAttack.exactAtRestore, true,
      "the browser restores the exact pending attack payload before its impact boundary");
    assert.equal(firstAttack.pending.length, 2,
      "the in-flight defensive splash carries two targets through the shared battle state");
    assert.deepEqual(firstAttack.pending.map(({ targetId }) => targetId), firstAttack.pendingTargetIds,
      "the pending splash preserves its ordered target identity sequence");
    assert.deepEqual(firstAttack.restoredEvents.map(({ amount, targetId, tick }) =>
      ({ amount, targetId, tick })), firstAttack.pendingTargetIds.map((targetId) => ({
      amount: 222, targetId, tick: firstAttack.attack.tick + 1,
    })), "restoring the pending impact applies the same full-damage splash exactly once");
    const firstImpactTick = firstAttack.attack.tick + 1;
    const firstImpactDamageEvents = firstAttack.allNewEvents.filter(({ type }) => type === "damage");
    const firstImpactReconciliation = firstAttack.pendingTargetIds.map((targetId) => {
      const events = firstImpactDamageEvents.filter((event) => event.targetId === targetId);
      const emberEvents = events.filter((event) =>
        event.externalSourceId === `building:${firstAttack.structure.id}`);
      const totalDamage = events.reduce((total, { amount }) => total + amount, 0);
      assert.equal(emberEvents.length, 1,
        `target ${targetId} receives one restored Ember contact at its impact boundary`);
      assert.equal(emberEvents[0].amount, 222,
        `target ${targetId} receives the full 222-point Ember splash`);
      assert.equal(emberEvents[0].tick, firstImpactTick);
      assert.ok(events.every(({ tick }) => tick === firstImpactTick),
        `all same-tick damage for target ${targetId} is reported at impact tick ${firstImpactTick}`);
      assert.ok(events.every(({ attackerId, externalSourceId }) =>
        Number.isSafeInteger(attackerId) || (typeof externalSourceId === "string" &&
          externalSourceId.length > 0)),
      `every same-tick contact for target ${targetId} identifies its source`);
      assert.equal(firstAttack.targetHealth[targetId] - firstAttack.afterHealth[targetId], totalDamage,
        `target ${targetId} health loss reconciles to all same-tick source events`);
      return {
        damageEvents: events.map(({ amount, attackerId, currentHealthAfter, currentHealthBefore,
          delivery, externalSourceId, tick }) => ({ amount,
          sourceId: externalSourceId ?? `unit:${attackerId}`,
          currentHealthBefore, currentHealthAfter, delivery, tick })),
        hitpointsAfter: firstAttack.afterHealth[targetId],
        hitpointsBefore: firstAttack.targetHealth[targetId],
        targetId,
        totalDamage,
      };
    });
    assert.deepEqual(firstAttack.restoredEvents.map(({ targetId }) => targetId),
      firstAttack.pendingTargetIds,
      "the restored 222-point splash impacts targets in the pending target-ID order");

    const secondAttack = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const structure = controller.session.state.battle.structures.find(({ cardId, side }) =>
        cardId === "ember-basin" && side === "south");
      const structureId = structure?.id;
      let steps = 0;
      while (controller.session.replay.filter(({ buildingId, type }) =>
        buildingId === structureId && type === "structure-attack").length < 2 && steps < 220) {
        controller.stepMany(1);
        steps += 1;
      }
      const liveStructure = controller.session.state.battle.structures.find(({ id }) =>
        id === structureId);
      const attacks = controller.session.replay.filter(({ buildingId, type }) =>
        buildingId === structureId && type === "structure-attack");
      const checkpoint = controller.serialize();
      const sessionBytes = controller.session.serialize();
      const pending = controller.session.state.battle.pendingBuildingHits;
      return { attacks, checkpoint, pending, sessionBytes, structure: {
        id: structureId,
        alive: liveStructure?.alive ?? false,
        hitpoints: liveStructure?.hitpoints ?? 0,
        targetKey: liveStructure?.targetKey ?? null,
      } };
    }, moduleUrl);
    assert.deepEqual(secondAttack.attacks.map(({ tick }) => tick),
      [committed.record.tick + 126, committed.record.tick + 222],
      "Ember repeats its area attack at the shared 96-tick cadence");
    assert.ok(secondAttack.structure.alive && secondAttack.structure.hitpoints > 0,
      "the stationary structure remains visible and targetable at its attack cadence");
    assert.ok(secondAttack.pending.length > 0,
      "the second attack checkpoint retains pending damage in flight");
    evidence.combat = {
      firstAttack: firstAttack.attack,
      firstSplashTargets: firstAttack.restoredEvents,
      firstPendingHits: firstAttack.pending,
      firstImpactTick,
      firstImpactEvents: firstAttack.allNewEvents,
      firstImpactReconciliation,
      firstTargetHealthBefore: firstAttack.targetHealth,
      firstTargetHealthAfter: firstAttack.afterHealth,
      secondAttackTicks: secondAttack.attacks.map(({ tick }) => tick),
      inflightPendingHitCount: secondAttack.pending.length,
      targetHealthAfterFirstImpact: firstAttack.afterHealth,
    };

    await page.screenshot({ path: join(ARTIFACTS, "ember-basin-combat-phone-390x844.png"),
      animations: "disabled" });
    screenshots.push({ file: "ember-basin-combat-phone-390x844.png", sha256: sha256(await readFile(
      join(ARTIFACTS, "ember-basin-combat-phone-390x844.png"))), viewport: [390, 844],
      reducedMotion: false });
    for (const viewport of [{ height: 844, width: 390 }, { height: 933, width: 1_440 }]) {
      await page.setViewportSize(viewport);
      for (const reducedMotion of ["no-preference", "reduce"]) {
        await page.emulateMedia({ reducedMotion });
        await settlePaint(page);
        const before = await readFrameEvidence(frame, moduleUrl);
        assert.ok(before.marker, `Ember's battle sprite appears at ${viewport.width}px`);
        assert.equal(before.marker.artId, "ember-basin");
        assert.match(before.marker.imageHref, /ember-basin-battle-sprite\.webp/u);
        assert.equal(before.marker.targeting, "true");
        assert.ok(before.marker.bounds[2] >= 14 && before.marker.bounds[3] >= 14,
          `team-readable sprite occupies the actual deployed marker at ${viewport.width}px: ${JSON.stringify(before.marker.bounds)}`);
        const checkpoint = secondAttack.checkpoint;
        assert.equal(before.browserBytes, checkpoint,
          "the rendered contact checkpoint matches the exact serialized browser state");
        let motionRegion = null;
        if (viewport.width === 1_440) {
          const iframeBox = await page.locator("[data-battle-frame-slot] iframe").boundingBox();
          assert.ok(iframeBox, "the desktop comparison point is inside the real battle frame");
          const point = { x: 885, y: 771 };
          const frameSize = await frame.evaluate(() => ({ width: innerWidth, height: innerHeight }));
          motionRegion = await frame.evaluate(() => {
            const card = document.querySelector(
              '[data-ui="hud-hand"] .hud-card[data-card-id="brassbolt"]',
            );
            const label = card?.querySelector(".hud-card__name");
            const describe = (element) => {
              if (!element) return null;
              const style = getComputedStyle(element);
              const rect = element.getBoundingClientRect();
              return {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: typeof element.className === "string" ? element.className : null,
                dataUi: element.getAttribute("data-ui"),
                cardId: element.getAttribute("data-card-id"),
                slot: element.getAttribute("data-slot"),
                text: (element.textContent ?? "").trim().replace(/\s+/gu, " ").slice(0, 80),
                rect: [rect.x, rect.y, rect.width, rect.height],
                style: {
                  animationName: style.animationName,
                  backgroundColor: style.backgroundColor,
                  opacity: style.opacity,
                  transform: style.transform,
                  transformOrigin: style.transformOrigin,
                  transitionProperty: style.transitionProperty,
                },
              };
            };
            return {
              handLabel: describe(label),
              motionOwners: {
                card: describe(card),
                hand: describe(document.querySelector('[data-ui="hud-hand"]')),
                hudFrame: describe(document.querySelector(".game-ui-hud-frame")),
              },
            };
          });
          assert.ok(motionRegion.handLabel && motionRegion.motionOwners.card,
            "the visible Brassbolt label remains in the rendered HUD hand");
          const labelRect = motionRegion.handLabel.rect;
          motionRegion.pixelRegionPageBounds = {
            x: iframeBox.x + labelRect[0] * iframeBox.width / frameSize.width,
            y: iframeBox.y + labelRect[1] * iframeBox.height / frameSize.height,
            width: labelRect[2] * iframeBox.width / frameSize.width,
            height: labelRect[3] * iframeBox.height / frameSize.height,
          };
          motionUiEvidence.push({ media: reducedMotion, pagePoint: point,
            iframeBox: { x: iframeBox.x, y: iframeBox.y,
              width: iframeBox.width, height: iframeBox.height },
            frameSize, motionRegion });
        }
        const pngName = `ember-basin-${viewport.width}x${viewport.height}-${reducedMotion === "reduce" ? "reduced" : "normal"}.png`;
        const beforePng = await page.screenshot({ path: join(ARTIFACTS, pngName),
          animations: "disabled" });
        const viewHash = sha256(Buffer.from(JSON.stringify({ combat: before.combat,
          effects: before.effects, feedback: before.feedback, hud: before.hud })));
        await frame.evaluate(async ({ checkpointBytes, entryUrl }) => {
          const { arenaHudController } = await import(entryUrl);
          arenaHudController.stepMany(8);
          arenaHudController.restore(checkpointBytes);
        }, { checkpointBytes: checkpoint, entryUrl: moduleUrl });
        await settlePaint(page);
        const restored = await readFrameEvidence(frame, moduleUrl);
        const afterPng = await page.screenshot({ animations: "disabled" });
        assert.equal(restored.browserBytes, before.browserBytes,
          `the browser checkpoint is byte exact after ${reducedMotion} restore at ${viewport.width}px`);
        assert.equal(restored.sessionBytes, before.sessionBytes,
          `the shared session bytes are exact after ${reducedMotion} restore at ${viewport.width}px`);
        assert.deepEqual({ combat: restored.combat, effects: restored.effects,
          feedback: restored.feedback, hud: restored.hud },
        { combat: before.combat, effects: before.effects, feedback: before.feedback, hud: before.hud },
        `the four rendered battle view layers match at ${viewport.width}px with ${reducedMotion}`);
        assert.equal(sha256(Buffer.from(JSON.stringify({ combat: restored.combat,
          effects: restored.effects, feedback: restored.feedback, hud: restored.hud }))), viewHash);
        assert.equal(sha256(afterPng), sha256(beforePng),
          `restored browser pixels are identical at ${viewport.width}x${viewport.height} with ${reducedMotion}`);
        screenshots.push({ file: pngName, sha256: sha256(beforePng),
          restoredSha256: sha256(afterPng), pixelParityAfterRestore: true,
          viewport: [viewport.width, viewport.height],
          reducedMotion: reducedMotion === "reduce", viewLayerSha256: viewHash,
          motionRegion });
      }
    }

    const secondImpact = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const checkpoint = controller.serialize();
      const before = controller.session.state.battle.units.map(({ hitpoints, id }) => ({ hitpoints, id }));
      const replayLength = controller.session.replay.length;
      controller.stepMany(1);
      const after = controller.session.state.battle.units.map(({ hitpoints, id }) => ({ hitpoints, id }));
      const changes = before.flatMap((unit) => {
        const next = after.find(({ id }) => id === unit.id);
        return next && next.hitpoints !== unit.hitpoints
          ? [{ before: unit.hitpoints, after: next.hitpoints, id: unit.id }] : [];
      });
      const allNewEvents = controller.session.replay.slice(replayLength);
      const damage = allNewEvents.filter(({ type }) => type === "damage");
      return { allNewEvents, checkpoint, changes, damage,
        stateTick: controller.session.state.tick };
    }, moduleUrl);
    assert.equal(secondAttack.pending.length, 2,
      "the second in-flight defensive splash also carries two targets");
    const expectedSecondSplash = secondAttack.pending.map(({ amount, applyTick, targetId }) =>
      ({ amount, targetId, tick: applyTick }));
    const secondEmberDamage = secondImpact.damage.filter(({ externalSourceId }) =>
      externalSourceId === `building:${secondAttack.structure.id}`);
    assert.deepEqual(secondEmberDamage.map(({ amount, targetId, tick }) =>
      ({ amount, targetId, tick })), expectedSecondSplash,
    "the second impact applies one full-damage hit to each pending target at the recorded tick");
    assert.equal(secondImpact.changes.length, secondAttack.pending.length,
      "the restored second Ember attack updates every target's health view");
    const secondImpactReconciliation = secondAttack.pending.map(({ applyTick, targetId }) => {
      const events = secondImpact.damage.filter((event) => event.targetId === targetId);
      const emberEvents = events.filter((event) =>
        event.externalSourceId === `building:${secondAttack.structure.id}`);
      const change = secondImpact.changes.find(({ id }) => id === targetId);
      assert.equal(emberEvents.length, 1,
        `second impact records one Ember contact for target ${targetId}`);
      assert.equal(emberEvents[0].amount, 222);
      assert.equal(emberEvents[0].tick, applyTick);
      assert.ok(events.every(({ tick }) => tick === applyTick));
      assert.ok(events.every(({ attackerId, externalSourceId }) =>
        Number.isSafeInteger(attackerId) || (typeof externalSourceId === "string" &&
          externalSourceId.length > 0)),
      `every same-tick second-impact contact for target ${targetId} identifies its source`);
      const totalDamage = events.reduce((total, { amount }) => total + amount, 0);
      assert.ok(change, `target ${targetId} has a health change on the second impact`);
      assert.equal(change.before - change.after, totalDamage,
        `target ${targetId} health loss reconciles to all second-impact source events`);
      return {
        damageEvents: events.map(({ amount, attackerId, currentHealthAfter, currentHealthBefore,
          delivery, externalSourceId, tick }) => ({ amount,
          sourceId: externalSourceId ?? `unit:${attackerId}`,
          currentHealthBefore, currentHealthAfter, delivery, tick })),
        hitpointsAfter: change.after,
        hitpointsBefore: change.before,
        targetId,
        totalDamage,
      };
    });
    evidence.combat.secondImpact = {
      stateTick: secondImpact.stateTick,
      expectedPendingHits: expectedSecondSplash,
      damageEvents: secondImpact.damage,
      reconciliation: secondImpactReconciliation,
    };

    let terminal = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      let chunks = 0;
      while (!arenaHudController.state.terminal && chunks < 15) {
        arenaHudController.fastForwardSegment(1_200);
        chunks += 1;
      }
      return { chunks, terminal: arenaHudController.state.terminal };
    }, moduleUrl);
    assert.equal(terminal.terminal, true,
      `the same real mixed battle reaches its terminal path in bounded segments: ${JSON.stringify(terminal)}`);
    await frameLocator.locator('[data-ui="restart"]').click();
    await waitForCustomDeck(frame, moduleUrl, deckIds);
    const restarted = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.enterManualStepMode();
      return { sessionBytes: arenaHudController.session.serialize(),
        setup: JSON.parse(arenaHudController.session.serialize()).setup,
        restartCount: arenaHudController.state.restartCount,
        tick: arenaHudController.session.state.tick };
    }, moduleUrl);
    assert.equal(restarted.restartCount, 1);
    assert.equal(restarted.tick, 0);
    assert.deepEqual(restarted.setup.deck, deckIds,
      "Restart retains the saved mixed custom deck, including Squall Orb and Ember Basin");
    assert.deepEqual(restarted.setup, JSON.parse(createEditableGameSessionSetup(deckIds)));

    const restartedEmber = frameLocator.locator('[data-ui="card-slot"][data-card-id="ember-basin"]');
    await restartedEmber.waitFor({ state: "visible" });
    await restartedEmber.click();
    assert.equal(await frameLocator.locator(
      '[data-ui="hud-hand"] [data-card-id="ember-basin"]',
    ).getAttribute("data-selected"), "true");
    await frame.evaluate(() => { globalThis.__cards018LifePointers = []; });
    await frame.evaluate(() => document.querySelector('[data-ui="arena"]').addEventListener(
      "pointerup", (event) => globalThis.__cards018LifePointers.push(event.isTrusted), true));
    await clickWorldPoint(page, arenaLocator, 15_000, 4_000);
    const lifeDeployment = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.stepMany(1);
      const session = arenaHudController.session;
      const event = session.replay.find(({ side, type }) =>
        side === "south" && type === "session-structure-deployed");
      const structure = session.state.battle.structures.find(({ id }) =>
        id === event?.materialization.structureId);
      return { event, structure, trusted: globalThis.__cards018LifePointers.some(Boolean),
        tick: session.state.tick };
    }, moduleUrl);
    assert.ok(lifeDeployment.event && lifeDeployment.trusted);
    assert.ok(Math.abs(lifeDeployment.event.materialization.point.x - 15_000) <= 1 &&
      Math.abs(lifeDeployment.event.materialization.point.y - 4_000) <= 1,
    `the trusted back-field placement maps to the intended quiet lane: ${JSON.stringify(lifeDeployment.event.materialization.point)}`);
    assert.equal(lifeDeployment.structure.placedTick, lifeDeployment.event.tick,
      "the lifetime receipt starts from the actual shared structure placedTick");
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.stepMany(1_799);
    }, moduleUrl);
    const beforeExpiry = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const session = arenaHudController.session;
      const structure = session.state.battle.structures.find(({ cardId, side }) =>
        cardId === "ember-basin" && side === "south");
      return { alive: structure?.alive ?? false, hitpoints: structure?.hitpoints ?? 0,
        placedTick: structure?.placedTick ?? null,
        tick: session.state.tick, attacks: session.replay.filter(({ buildingId, type }) =>
          buildingId === structure?.id && type === "structure-attack").length };
    }, moduleUrl);
    assert.equal(beforeExpiry.tick, 1_800);
    assert.equal(beforeExpiry.placedTick, lifeDeployment.structure.placedTick);
    assert.equal(beforeExpiry.tick - beforeExpiry.placedTick, 1_800,
      "the live structure remains present at state age 1,800 before that tick's expiry boundary is processed");
    assert.equal(beforeExpiry.alive, true,
      "the defensive structure survives immediately before its exact 1,800-tick lifetime boundary");
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.stepMany(1);
    }, moduleUrl);
    const expired = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const session = arenaHudController.session;
      const structure = session.state.battle.structures.find(({ cardId, side }) =>
        cardId === "ember-basin" && side === "south");
      return { alive: structure?.alive ?? null, cause: structure?.deathCause ?? null,
        hitpoints: structure?.hitpoints ?? null, tick: session.state.tick,
        event: session.replay.find(({ buildingId, reason, type }) =>
          buildingId === structure?.id && reason === "lifetime" && type === "structure-destroyed") ?? null };
    }, moduleUrl);
    assert.equal(expired.tick, 1_801);
    assert.deepEqual({ alive: expired.alive, cause: expired.cause, hitpoints: expired.hitpoints },
      { alive: false, cause: "expiry", hitpoints: 0 });
    assert.equal(expired.event?.tick, 1_800,
      "the shared runtime expires Ember exactly at placement plus 1,800 ticks");
    assert.equal(expired.event.tick - beforeExpiry.placedTick, 1_800);
    assert.equal(expired.tick - beforeExpiry.placedTick, 1_801);
    evidence.combat.lifetime = { beforeExpiry, expired };
    const normalDesktopSample = motionUiEvidence.find(({ media }) => media === "no-preference");
    const reducedDesktopSample = motionUiEvidence.find(({ media }) => media === "reduce");
    const normalMotionCard = normalDesktopSample?.motionRegion.motionOwners.card;
    const reducedMotionCard = reducedDesktopSample?.motionRegion.motionOwners.card;
    const normalHandTransform = normalDesktopSample?.motionRegion.motionOwners.hand?.style.transform ?? null;
    const reducedHandTransform = reducedDesktopSample?.motionRegion.motionOwners.hand?.style.transform ?? null;
    assert.ok(normalMotionCard && reducedMotionCard,
      "the 65x25 desktop motion-difference region overlaps the real Brassbolt HUD card in both modes");
    for (const sample of [normalDesktopSample, reducedDesktopSample]) {
      const bounds = sample.motionRegion.pixelRegionPageBounds;
      assert.ok(bounds.x < 950 && bounds.x + bounds.width > 885 &&
        bounds.y < 796 && bounds.y + bounds.height > 771,
      `the Brassbolt label bounds overlap the actual changed pixel region: ${JSON.stringify(bounds)}`);
    }
    assert.equal(normalMotionCard.cardId, reducedMotionCard.cardId,
      "both accessibility variants resolve the same hand card under the changed pixels");
    assert.equal(normalMotionCard.cardId, "brassbolt");
    assert.equal(normalMotionCard.slot, reducedMotionCard.slot);
    evidence.motionComparison = {
      phoneNormalAndReducedMotionScreenshotsArePixelIdentical:
        screenshots.find(({ file }) => file === "ember-basin-390x844-normal.png")?.sha256 ===
        screenshots.find(({ file }) => file === "ember-basin-390x844-reduced.png")?.sha256,
      desktopScreenshotPixelDifferenceRegion: { x: 885, y: 771, width: 65, height: 25 },
      desktopNormalVsReducedUiPointSamples: motionUiEvidence,
      desktopMotionDifferenceObservation: {
        cardId: normalMotionCard.cardId,
        slot: normalMotionCard.slot,
        normalHandTransform,
        reducedMotionHandTransform: reducedHandTransform,
        cardTransform: normalMotionCard.style.transform,
        labelText: normalDesktopSample.motionRegion.handLabel.text,
        explanation: "the measured pixel delta overlaps the same Brassbolt label in the same browser and view-state checkpoint. The sampled hand/card transforms are identical in both modes, so this run does not establish the pixel-level cause; text rasterization is only a hypothesis",
      },
      restorePixelParityVerifiedIndependentlyInEachVariant:
        screenshots.filter(({ file }) => /^ember-basin-\d+x\d+-(?:normal|reduced)\.png$/u.test(file))
          .every(({ sha256, restoredSha256 }) =>
          sha256 === restoredSha256),
    };

    const artManifest = manifest.files.find(({ path }) =>
      path === "public/assets/ember-basin-battle-sprite.webp");
    assert.ok(artManifest, "the deployed sprite is registered in the Pages release manifest");
    assert.equal(artManifest.size, 70_090);
    evidence.asset = { path: artManifest.path, size: artManifest.size,
      sha256: artManifest.sha256 };
    assert.equal(successfulPaths.has("public/assets/ember-basin-battle-sprite.webp"), true,
      "the actual battle requested the registered Ember structure sprite");
    for (const path of successfulPaths) {
      assert.ok(manifest.files.some(({ path: itemPath }) => itemPath === path),
        `successful app resource is included in the released manifest: ${path}`);
    }
    assert.deepEqual(errors, [], "the full Ember app journey has no console, page, or resource errors");
    evidence.requestPaths = [...successfulPaths].sort();
    evidence.release.entrypoints = manifest.entrypoints;
    evidence.release.standaloneModules = manifest.standaloneModules;
    await writeFile(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  } finally {
    await context.close();
  }
});
