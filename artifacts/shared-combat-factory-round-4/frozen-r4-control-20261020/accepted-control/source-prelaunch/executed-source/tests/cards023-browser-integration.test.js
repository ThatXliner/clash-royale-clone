import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { GameSession } from "../src/sim/game-session.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? "playwright";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.CARDS023I_ARTIFACTS ??
  new URL("../artifacts/cards023i-round-1/builder/", import.meta.url).pathname;
const DECK = Object.freeze([
  "aether-well", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);
const LORE = "At dusk, the Aether Well’s copper scoop gathers glowing emberseed from the quiet river water. Workshop keepers wind its rootwood crank to lift the seeds into stoppered flasks for the nearby repair shed.";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function serverReady(server, stdout, stderr) {
  return new Promise((resolve, reject) => {
    let pending = "";
    let resolved = false;
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      stdout.push(text);
      if (resolved) return;
      pending += text;
      const newline = pending.indexOf("\n");
      if (newline < 0) return;
      resolved = true;
      try { resolve(JSON.parse(pending.slice(0, newline))); }
      catch (error) { reject(error); }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", (chunk) => stderr.push(chunk.toString("utf8")));
    server.once("exit", (code) => reject(new Error(
      `release server exited before readiness (${code})`)));
  });
}

async function clickWorldPoint(page, arena, x, y) {
  const box = await arena.boundingBox();
  assert.ok(box && box.width > 0 && box.height > 0,
    "the released arena has a visible trusted-input surface");
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
  await page.mouse.click(
    box.x + (metrics.borderLeft + metrics.clientWidth * x / 18_000) * scaleX,
    box.y + (metrics.borderTop + metrics.clientHeight * (32_000 - y) / 32_000) * scaleY,
  );
}

async function readContinuation(frame, entryUrl) {
  return frame.evaluate(async (url) => {
    const { arenaHudController: controller } = await import(url);
    const snapshot = controller.serialize();
    const inputBridgeBytes = JSON.parse(snapshot).bridge;
    const selectedCardId = controller.state.selectedCardId;
    if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
        (selectedCardId !== null && typeof selectedCardId !== "string")) {
      throw new TypeError("Aether Well checkpoint requires canonical input bridge and selection state");
    }
    return {
      audioBytes: controller.audioContinuationBytes,
      inputBridgeBytes,
      selectedCardId,
      sessionBytes: controller.session.serialize(),
      snapshot,
      stateBytes: JSON.stringify(controller.state),
    };
  }, entryUrl);
}

test("CARDS-023I Aether Well is a real collection choice and battle resource", {
  timeout: 300_000,
}, async (t) => {
  assert.ok(existsSync(CHROME), "the installed Chrome runtime is required");
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "cards023i-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const serverStdout = [];
  const serverStderr = [];
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const browserErrors = [];
  const evidence = {
    browserErrors: [],
    browserVersion: null,
    deck: DECK,
    lore: LORE,
    mode: "seed-2 editable GameSession; full legal natural AI; trusted player input",
    releaseResult: "pending",
    screenshots: [],
  };

  try {
    const address = await serverReady(server, serverStdout, serverStderr);
    const origin = `http://${address.host}:${address.port}`;
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    evidence.browserVersion = browser.version();
    const context = await browser.newContext({
      deviceScaleFactor: 1,
      reducedMotion: "no-preference",
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") {
        browserErrors.push(message.text());
        evidence.browserErrors.push({ type: "console", text: message.text() });
      }
    });
    page.on("pageerror", (error) => {
      browserErrors.push(String(error));
      evidence.browserErrors.push({ type: "pageerror", message: String(error) });
    });
    page.on("requestfailed", (request) => browserErrors.push(
      `${request.url()}: ${request.failure()?.errorText}`));

    const response = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    await page.locator('.app-nav [data-nav-to="cards"]').click();
    await page.locator('[data-card-grid] [data-card-id="aether-well"]').click();
    const detail = await page.locator("[data-card-detail]").evaluate(async (node) => {
      const image = node.querySelector(".detail-portrait .card-art-image");
      if (image === null) return { image: null, lore: null, text: node.innerText };
      await image.decode();
      return {
        image: {
          complete: image.complete,
          naturalHeight: image.naturalHeight,
          naturalWidth: image.naturalWidth,
          src: new URL(image.currentSrc || image.src, document.baseURI).pathname,
        },
        lore: node.querySelector(".card-lore p")?.innerText ?? null,
        profile: node.querySelector(".unit-profile")?.innerText ?? null,
        text: node.innerText,
      };
    });
    assert.equal(detail.image?.src, "/public/assets/aether-well-portrait-painted.webp");
    assert.ok(detail.image?.complete && detail.image.naturalWidth > 0 && detail.image.naturalHeight > 0,
      `the accepted Aether Well portrait decodes in the released collection: ${JSON.stringify(detail.image)}`);
    assert.equal(detail.lore, LORE, "the collection detail uses the accepted two-sentence lore");
    assert.match(detail.profile ?? "", /Resource structure · QUESTION/u,
      "the resource profile retains its visible QUESTION boundary");
    assert.doesNotMatch(detail.profile ?? "", /(?:Damage|First hit|Hit speed|Range|Splash radius|NaN|undefined)/iu,
      "the resource profile does not invent attack statistics");
    const detailShot = await page.screenshot({
      path: join(ARTIFACTS, "aether-well-card-detail-phone-390x844.png"),
    });
    evidence.screenshots.push({ file: "aether-well-card-detail-phone-390x844.png",
      sha256: sha256(detailShot) });

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    const replaceSlot = async (slot, cardId) => {
      await page.locator(`[data-replace-slot="${slot}"]`).click();
      await page.locator(`[data-replacement-card-id="${cardId}"]`).click();
    };
    await replaceSlot(0, "aether-well");
    const selectedDeck = await page.locator("[data-deck-cards] [data-card-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
    assert.deepEqual(selectedDeck, DECK,
      "trusted collection editor order exactly matches the custom eight-card witness");
    assert.equal(new Set(selectedDeck).size, 8);
    await page.locator('.app-nav [data-nav-to="battle"]').click();

    const arena = page.frameLocator("[data-battle-frame-slot] iframe")
      .locator('[data-ui="arena"]');
    await arena.waitFor({ state: "visible", timeout: 10_000 });
    const frame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(frame, "the released battle mounts its real frame and controller");
    const moduleUrl = new URL("/src/ui/arena-shell-entry.js", origin).href;
    const seededSession = new GameSession(createEditableGameSessionSetup(selectedDeck, 2));
    const opening = await frame.evaluate(async ({ entryUrl, sessionBytes, sessionSetup }) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.pause();
      controller.replaceDeck(sessionSetup.deck);
      controller.resume();
      controller.enterManualStepMode();
      const envelope = JSON.parse(controller.serialize());
      envelope.session = sessionBytes;
      envelope.running = false;
      controller.restore(canonical(envelope));
      controller.enterManualStepMode();
      return {
        hand: controller.session.state.decks.south.hand,
        northHand: controller.session.state.decks.north.hand,
        setup: JSON.parse(controller.session.serialize()).setup,
        state: controller.state,
      };
      function canonical(value) {
        if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
        if (value !== null && typeof value === "object") return `{${Object.keys(value).sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
        return JSON.stringify(value);
      }
    }, { entryUrl: moduleUrl, sessionBytes: seededSession.serialize(),
      sessionSetup: JSON.parse(seededSession.serialize()).setup });
    assert.equal(opening.setup.seed, 2);
    assert.deepEqual(opening.setup.deck, selectedDeck,
      "the canonical GameSession uses the exact order selected in the trusted editor");
    assert.deepEqual(opening.setup.deck, DECK);
    assert.equal(opening.setup.legalNorthDeployments.length, 8,
      "the ordinary setup keeps every selected card legal for natural AI choice");
    assert.ok(opening.hand.includes("aether-well"), "seed 2 gives the player the well in its opening hand");
    assert.ok(opening.northHand.includes("aether-well"),
      "seed 2 gives the unforced north AI a natural well candidate");

    await frame.evaluate(() => {
      globalThis.__cards023Pointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards023Pointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    const battleFrame = page.frameLocator("[data-battle-frame-slot] iframe");
    const aetherSlot = battleFrame.locator('[data-ui="card-slot"][data-card-id="aether-well"]');
    await aetherSlot.click();
    const visibleCost = Number(await battleFrame
      .locator('[data-ui="hud-hand"] [data-card-id="aether-well"] .hud-card__cost').innerText());
    assert.equal(visibleCost, 6, "the real player hand presents Aether Well's six-elixir cost");
    await clickWorldPoint(page, arena, 3_500, 14_500);
    const openingBoundary = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const events = controller.fastForwardSegment(1);
      const state = controller.session.state;
      const hud = document.querySelector('[data-ui="hud-elixir"]');
      return {
        events,
        hand: state.decks.south.hand,
        hud: hud === null ? null : { amount: hud.dataset.amount, side: hud.dataset.side },
        inputSlots: [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId),
        northHand: state.decks.north.hand,
        pointers: globalThis.__cards023Pointers,
        sequence: { north: state.decks.north.sequence, south: state.decks.south.sequence },
        state,
        setup: JSON.parse(controller.session.serialize()).setup,
      };
    }, moduleUrl);
    const openingDeployments = openingBoundary.events.filter(({ materialization, type }) =>
      type === "session-structure-deployed" && materialization?.cardId === "aether-well");
    assert.deepEqual(openingDeployments.map(({ side, spend }) => ({
      amountAfter: spend.amountAfter,
      cost: spend.cost,
      side,
    })).sort((left, right) => left.side.localeCompare(right.side)), [
      { amountAfter: 4, cost: 6, side: "north" },
      { amountAfter: 4, cost: 6, side: "south" },
    ], "the player's trusted drop and the unforced seeded AI each spend six once");
    assert.deepEqual(openingBoundary.sequence, { north: 1, south: 1 },
      "both canonical deck cycles advance once for Aether Well");
    assert.equal(openingBoundary.state.elixir.sides.south.amount, 4);
    assert.equal(openingBoundary.state.elixir.sides.north.amount, 4);
    assert.ok(!openingBoundary.hand.includes("aether-well"));
    assert.ok(!openingBoundary.northHand.includes("aether-well"));
    assert.deepEqual(openingBoundary.inputSlots, openingBoundary.hand,
      "the live input slots follow the canonical player cycle");
    assert.equal(openingBoundary.hud?.side, "south");
    assert.equal(Number(openingBoundary.hud?.amount), openingBoundary.state.elixir.sides.south.amount);
    assert.equal(openingBoundary.pointers.length, 1);
    assert.equal(openingBoundary.pointers[0].isTrusted, true,
      "Chrome's trusted pointer event deploys the player well");
    assert.deepEqual(openingBoundary.setup.legalNorthDeployments.length, 8);
    evidence.opening = {
      deployments: openingDeployments,
      hand: openingBoundary.hand,
      pointer: openingBoundary.pointers[0],
      sequences: openingBoundary.sequence,
      stateTick: openingBoundary.state.tick,
    };

    const initialArt = await frame.evaluate(() => {
      const frame = window.frameElement;
      const matrix = frame === null ? null : new DOMMatrixReadOnly(getComputedStyle(frame).transform);
      return ["north", "south"].map((side) => {
        const marker = document.querySelector(
          `.combat-marker[data-kind="aether-well"][data-side="${side}"]`,
        );
        const art = marker?.querySelector('.combat-art[data-art-id="aether-well"]');
        const style = art == null ? null : getComputedStyle(art);
        return {
          bodyBoundsUnits: art?.dataset.bodyBoundsUnits ?? null,
          bodyCssPixels: art?.dataset.bodyCssPixels ?? null,
          motion: art?.dataset.motion ?? null,
          physicalBodyCssPixels: style === null || matrix === null ? null :
            Number.parseFloat(style.height) * (25.425 / 32) * matrix.a,
          side: art?.dataset.side ?? null,
          structure: marker?.dataset.structure ?? null,
          teamColor: art?.dataset.teamColor ?? null,
        };
      });
    });
    assert.deepEqual(initialArt.map(({ bodyBoundsUnits, bodyCssPixels, motion, side, structure, teamColor }) =>
      ({ bodyBoundsUnits, bodyCssPixels, motion, side, structure, teamColor })), [
      { bodyBoundsUnits: "2.575:28", bodyCssPixels: "13", motion: "static",
        side: "north", structure: "true", teamColor: "#C6452E" },
      { bodyBoundsUnits: "2.575:28", bodyCssPixels: "13", motion: "static",
        side: "south", structure: "true", teamColor: "#2E7F86" },
    ], "the live player and AI structure use the original team-readable battle art");
    assert.ok(initialArt.every(({ physicalBodyCssPixels }) =>
      Number.isFinite(physicalBodyCssPixels) && Math.abs(physicalBodyCssPixels - 13) < 0.02),
    `the live structures render a 13px physical body: ${JSON.stringify(initialArt)}`);
    const openingShot = await page.screenshot({
      path: join(ARTIFACTS, "aether-well-opening-phone-390x844.png"),
    });
    evidence.screenshots.push({ file: "aether-well-opening-phone-390x844.png",
      sha256: sha256(openingShot) });

    await frame.evaluate(async ({ entryUrl, ticks }) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.fastForwardSegment(ticks);
    }, { entryUrl: moduleUrl, ticks: 473 });
    const southBoundary = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const events = controller.fastForwardSegment(1);
      const state = controller.session.state;
      const hud = document.querySelector('[data-ui="hud-elixir"]');
      const hudProjection = document.querySelector('[data-ui="hud-projection"]');
      return {
        events,
        hud: hud === null ? null : { amount: hud.dataset.amount, side: hud.dataset.side },
        hudTick: hudProjection?.dataset.tick ?? null,
        state,
      };
    }, moduleUrl);
    const southId = openingDeployments.find(({ side }) => side === "south")
      ?.materialization.structureId;
    const southPayout = southBoundary.events.filter(({ buildingId, cause, type }) =>
      buildingId === southId && cause === "combat-damage" &&
      type === "building-resource-payout-triggered");
    const southGrant = southBoundary.events.filter(({ buildingId, side, tick, type }) =>
      buildingId === southId && side === "south" && tick === 474 &&
      type === "building-resource-granted");
    assert.equal(southBoundary.state.tick, 475, "the tick-474 payout advances one canonical boundary");
    assert.equal(southPayout.length, 1,
      "natural combat destroys the player's well and returns its authenticated payout trigger");
    assert.deepEqual(southPayout.map(({ amount, recipientSide, tick }) =>
      ({ amount, recipientSide, tick })), [{ amount: 1, recipientSide: "south", tick: 474 }]);
    assert.equal(southGrant.length, 1, "the shared resource authority returns one owner-routed grant");
    assert.equal(southGrant[0].amountRequested, 1);
    assert.equal(southGrant[0].amountGranted, 1);
    assert.equal(southGrant[0].amountAfter, southBoundary.state.elixir.sides.south.amount);
    assert.equal(southBoundary.hud?.side, "south");
    assert.equal(Number(southBoundary.hud?.amount), southGrant[0].amountAfter,
      "the accepted grant receipt agrees with the canonical HUD amount at the same boundary and side; regen and boundary ordering also remain in that state");
    assert.equal(Number(southBoundary.hudTick), southBoundary.state.tick,
      "the resource meter reflects the same canonical session tick as the returned receipt");

    await frame.evaluate(async ({ entryUrl, ticks }) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.fastForwardSegment(ticks);
    }, { entryUrl: moduleUrl, ticks: 65 });
    const northBoundary = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const events = controller.fastForwardSegment(1);
      return { events, state: controller.session.state };
    }, moduleUrl);
    const northId = openingDeployments.find(({ side }) => side === "north")
      ?.materialization.structureId;
    const northGrant = northBoundary.events.filter(({ buildingId, side, tick, type }) =>
      buildingId === northId && side === "north" && tick === 540 &&
      type === "building-resource-granted");
    assert.equal(northBoundary.state.tick, 541);
    assert.equal(northGrant.length, 1,
      "the unforced north well returns its natural first periodic grant at tick 540");
    assert.equal(northGrant[0].amountRequested, 1);
    assert.ok(northGrant[0].amountGranted >= 0 && northGrant[0].amountGranted <= 1);
    assert.equal(northGrant[0].amountAfter, northBoundary.state.elixir.sides.north.amount,
      "the authenticated AI receipt matches canonical north Elixir at the same state tick");
    evidence.resourceFeedback = {
      north: { amountAfter: northGrant[0].amountAfter, amountGranted: northGrant[0].amountGranted,
        requested: northGrant[0].amountRequested, tick: northGrant[0].tick },
      south: { amountAfter: southGrant[0].amountAfter, amountGranted: southGrant[0].amountGranted,
        hudAmount: Number(southBoundary.hud.amount), hudTick: Number(southBoundary.hudTick),
        requested: southGrant[0].amountRequested, tick: southGrant[0].tick },
    };

    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.pause();
    }, moduleUrl);
    const checkpoint = await readContinuation(frame, moduleUrl);
    evidence.pausedCheckpoint = {
      audioSha256: sha256(Buffer.from(checkpoint.audioBytes)),
      inputBridgeSha256: sha256(Buffer.from(checkpoint.inputBridgeBytes)),
      selectedCardId: checkpoint.selectedCardId,
      sessionSha256: sha256(Buffer.from(checkpoint.sessionBytes)),
      snapshotSha256: sha256(Buffer.from(checkpoint.snapshot)),
      stateSha256: sha256(Buffer.from(checkpoint.stateBytes)),
    };

    const presentationChecks = [];
    for (const mode of [
      { label: "phone-normal", motion: "no-preference", viewport: { width: 390, height: 844 },
        bodyCssPixels: 13 },
      { label: "phone-reduced", motion: "reduce", viewport: { width: 390, height: 844 },
        bodyCssPixels: 13 },
      { label: "desktop-normal", motion: "no-preference", viewport: { width: 1440, height: 933 },
        bodyCssPixels: 26 },
      { label: "desktop-reduced", motion: "reduce", viewport: { width: 1440, height: 933 },
        bodyCssPixels: 26 },
    ]) {
      await page.setViewportSize(mode.viewport);
      await page.emulateMedia({ reducedMotion: mode.motion });
      await frame.waitForFunction(({ bodyCssPixels, reduce }) => {
        const frame = window.frameElement;
        if (frame === null) return false;
        const art = document.querySelector(
          '.combat-marker[data-kind="aether-well"][data-side="north"] .combat-art[data-art-id="aether-well"]',
        );
        if (art === null) return false;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(frame).transform);
        const style = getComputedStyle(art);
        const physical = Number.parseFloat(style.height) * (25.425 / 32) * matrix.a;
        return Number(document.documentElement.dataset.combatBodyCssPixels) === bodyCssPixels &&
          Math.abs(Number(document.documentElement.dataset.combatFrameScale) - matrix.a) < 1e-6 &&
          Math.abs(physical - bodyCssPixels) < 0.02 &&
          art.dataset.bodyCssPixels === String(bodyCssPixels) &&
          art.dataset.motion === "static" &&
          matchMedia("(prefers-reduced-motion: reduce)").matches === reduce;
      }, { bodyCssPixels: mode.bodyCssPixels, reduce: mode.motion === "reduce" });

      const afterResize = await readContinuation(frame, moduleUrl);
      for (const key of ["audioBytes", "inputBridgeBytes", "selectedCardId", "sessionBytes",
        "snapshot", "stateBytes"]) {
        assert.equal(afterResize[key], checkpoint[key],
          `${mode.label} automatic resize/redraw leaves ${key} untouched`);
      }
      const artProjection = await frame.evaluate(() => {
        const art = document.querySelector(
          '.combat-marker[data-kind="aether-well"][data-side="north"] .combat-art[data-art-id="aether-well"]',
        );
        const frame = window.frameElement;
        const style = art === null ? null : getComputedStyle(art);
        const matrix = frame === null ? null : new DOMMatrixReadOnly(getComputedStyle(frame).transform);
        return {
          bodyCssPixels: Number(art?.dataset.bodyCssPixels),
          frameScale: Number(document.documentElement.dataset.combatFrameScale),
          motion: art?.dataset.motion ?? null,
          physicalBodyCssPixels: style === null || matrix === null ? null :
            Number.parseFloat(style.height) * (25.425 / 32) * matrix.a,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          side: art?.dataset.side ?? null,
          teamColor: art?.dataset.teamColor ?? null,
          tick: document.querySelector('[data-ui="hud-projection"]')?.dataset.tick ?? null,
        };
      });
      assert.equal(artProjection.bodyCssPixels, mode.bodyCssPixels);
      assert.equal(artProjection.reducedMotion, mode.motion === "reduce");
      assert.equal(artProjection.motion, "static");
      assert.equal(artProjection.side, "north");
      assert.equal(artProjection.teamColor, "#C6452E");
      assert.equal(artProjection.tick, "541");

      const beforeFile = `aether-well-${mode.label}-before-restore.png`;
      const afterFile = `aether-well-${mode.label}-after-restore.png`;
      const before = await page.screenshot({ path: join(ARTIFACTS, beforeFile) });
      const restored = await frame.evaluate(async ({ entryUrl, snapshot }) => {
        const { arenaHudController: controller } = await import(entryUrl);
        controller.restore(snapshot);
        const bytes = controller.serialize();
        const inputBridgeBytes = JSON.parse(bytes).bridge;
        const selectedCardId = controller.state.selectedCardId;
        if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
            (selectedCardId !== null && typeof selectedCardId !== "string")) {
          throw new TypeError("restored Aether Well input bridge is invalid");
        }
        return {
          audioBytes: controller.audioContinuationBytes,
          inputBridgeBytes,
          selectedCardId,
          sessionBytes: controller.session.serialize(),
          snapshot: bytes,
          stateBytes: JSON.stringify(controller.state),
        };
      }, { entryUrl: moduleUrl, snapshot: checkpoint.snapshot });
      for (const key of ["audioBytes", "inputBridgeBytes", "selectedCardId", "sessionBytes",
        "snapshot", "stateBytes"]) {
        assert.equal(restored[key], checkpoint[key], `${mode.label} restore preserves exact ${key}`);
      }
      const after = await page.screenshot({ path: join(ARTIFACTS, afterFile) });
      assert.deepEqual(after, before, `${mode.label} whole-viewport PNG matches byte for byte after restore`);
      evidence.screenshots.push(
        { file: beforeFile, sha256: sha256(before) },
        { file: afterFile, sha256: sha256(after) },
      );
      presentationChecks.push({
        ...artProjection,
        mode: mode.label,
        before: { file: beforeFile, bytes: before.length, sha256: sha256(before) },
        after: { file: afterFile, bytes: after.length, sha256: sha256(after) },
        frameScale: artProjection.frameScale,
        physicalBodyCssPixels: artProjection.physicalBodyCssPixels,
      });
    }
    evidence.presentationChecks = presentationChecks;

    const terminal = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const start = controller.state.sessionTick;
      controller.resume();
      controller.enterManualStepMode();
      let chunks = 0;
      while (!controller.state.terminal && controller.state.sessionTick < 18_000 && chunks < 16) {
        controller.fastForwardSegment(Math.min(1_200, 18_000 - controller.state.sessionTick));
        chunks += 1;
      }
      const sessionBytes = controller.session.serialize();
      return {
        chunks,
        start,
        state: controller.state,
        setup: JSON.parse(sessionBytes).setup,
        session: { tick: controller.session.state.tick, terminal: controller.session.state.terminal },
      };
    }, moduleUrl);
    evidence.naturalMatch = terminal;
    assert.equal(terminal.state.terminal, true,
      "the unforced custom eight-card match reaches its natural terminal before 18,000 ticks");
    assert.deepEqual(terminal.setup.deck, DECK);
    assert.equal(terminal.setup.seed, 2);
    assert.equal(terminal.setup.legalNorthDeployments.length, 8,
      "the AI's complete natural legal-deployment set remains intact through terminal");
    const terminalShot = await page.screenshot({
      path: join(ARTIFACTS, "aether-well-natural-terminal.png"),
    });
    evidence.screenshots.push({ file: "aether-well-natural-terminal.png",
      sha256: sha256(terminalShot) });

    await frame.locator('[data-ui="restart"]').click();
    const restarted = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const sessionBytes = controller.session.serialize();
      return {
        restartCount: controller.state.restartCount,
        state: controller.state,
        setup: JSON.parse(sessionBytes).setup,
        sessionBytes,
      };
    }, moduleUrl);
    assert.equal(restarted.restartCount, 1,
      "a trusted UI click performs one real same-deck restart");
    assert.equal(restarted.state.sessionTick, 0);
    assert.deepEqual(restarted.setup.deck, DECK);
    assert.equal(restarted.setup.seed, 2);
    assert.equal(restarted.setup.legalNorthDeployments.length, 8);
    evidence.sameDeckRestart = {
      deck: restarted.setup.deck,
      restartCount: restarted.restartCount,
      seed: restarted.setup.seed,
      tick: restarted.state.sessionTick,
    };
    evidence.releaseResult = "pass";
    evidence.server = { stderr: serverStderr.join(""), stdout: serverStdout.join("") };
    writeFileSync(join(ARTIFACTS, "cards023-browser-integration-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`);
    assert.deepEqual(browserErrors, []);
    await context.close();
  } catch (error) {
    evidence.releaseResult = "fail";
    evidence.failure = String(error?.stack ?? error);
    evidence.server = { stderr: serverStderr.join(""), stdout: serverStdout.join("") };
    writeFileSync(join(ARTIFACTS, "cards023-browser-integration-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    if (browser !== undefined) await browser.close();
    if (server.exitCode === null && server.signalCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
  }
});
