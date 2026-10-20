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
const ARTIFACTS = process.env.CARDS022I_ARTIFACTS ??
  new URL("../artifacts/cards022i-round-1/builder/", import.meta.url).pathname;
const DECK = Object.freeze([
  "brackenwheel", "briar-band", "coilblade", "mossguard", "ironroot",
  "copperskiff", "brassbolt", "reedsting",
]);
const LORE = "Brackenwheel learned to clear jammed sluice gates by spinning a copperroot sickle through the reeds. After dusk, emberseed sparks trace a ring around her boots, and she counts each flicker as a warning from the river.";

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function describeError(error) {
  return {
    cause: error?.cause instanceof Error ? describeError(error.cause) : null,
    errors: Array.isArray(error?.errors)
      ? error.errors.map((nested) => ({ message: String(nested?.message ?? nested),
        name: nested?.name ?? null, stack: nested?.stack ?? null })) : [],
    message: String(error?.message ?? error),
    name: error?.name ?? null,
    stack: error?.stack ?? null,
  };
}

function serverReady(server, stdout, stderr) {
  return new Promise((resolve, reject) => {
    let pending = "";
    let resolved = false;
    const onData = (chunk) => {
      stdout.push(chunk.toString("utf8"));
      if (resolved) return;
      pending += chunk.toString("utf8");
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

test("CARDS022I browser integration uses a trusted Brackenwheel drop and natural AI contact", {
  timeout: 180_000,
}, async (t) => {
  assert.ok(existsSync(CHROME), "the installed Chrome runtime is required");
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "cards022i-release-"));
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
  const evidence = { baseCommand: "node --test tests/cards022-browser-integration.test.js",
    browserErrors: [], browserVersion: null, contact: null, deck: DECK, failures: browserErrors,
    lore: LORE,
    loreProvenance: "user-session/root-supplied original Brackenwheel brief; not found in repository history",
    mode: "seed-2 canonical GameSession; unforced natural AI; trusted player pointer" };
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
      evidence.browserErrors.push({ type: "pageerror", ...describeError(error) });
    });
    page.on("requestfailed", (request) => browserErrors.push(
      `${request.url()}: ${request.failure()?.errorText}`));
    const response = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(response.status(), 200);
    await page.locator('.app-nav [data-nav-to="cards"]').click();
    await page.locator('[data-card-grid] [data-card-id="brackenwheel"]').click();
    const portrait = await page.locator("[data-card-detail] .card-art-image").evaluate((image) => ({
      complete: image.complete,
      naturalHeight: image.naturalHeight,
      naturalWidth: image.naturalWidth,
      src: new URL(image.currentSrc || image.src, document.baseURI).pathname,
    }));
    const detailText = await page.locator("[data-card-detail]").innerText();
    assert.equal(portrait.src, "/public/assets/brackenwheel-portrait-painted.webp");
    assert.ok(portrait.complete && portrait.naturalWidth > 0 && portrait.naturalHeight > 0,
      `the original portrait decodes in the released card view: ${JSON.stringify(portrait)}`);
    assert.ok(detailText.includes(LORE), "the Brackenwheel card detail shows the approved two-sentence lore");
    assert.ok(detailText.includes("melee area/contact rule remains QUESTION"),
      "the card detail retains the canonical melee-area QUESTION alongside other provisional labels");
    await page.screenshot({ path: join(ARTIFACTS, "phone-brackenwheel-card-detail-390x844.png") });

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    const replaceSlot = async (slot, cardId) => {
      await page.locator(`[data-replace-slot="${slot}"]`).click();
      await page.locator(`[data-replacement-card-id="${cardId}"]`).click();
    };
    await replaceSlot(3, "brackenwheel");
    await replaceSlot(7, "ironroot");
    // Move the same admitted eight cards into the canonical public witness
    // order using the real replacement controls. Squall Orb is a temporary
    // vacancy while the eight-card cycle rotates; it is removed before battle.
    await replaceSlot(3, "squall-orb");
    await replaceSlot(0, "brackenwheel");
    await replaceSlot(2, "coilblade");
    await replaceSlot(5, "copperskiff");
    await replaceSlot(7, "reedsting");
    await replaceSlot(4, "ironroot");
    await replaceSlot(6, "brassbolt");
    await replaceSlot(1, "briar-band");
    await replaceSlot(3, "mossguard");
    const selectedDeck = await page.locator("[data-deck-cards] [data-card-id]")
      .evaluateAll((nodes) => nodes.map((node) => node.dataset.cardId));
    assert.equal(selectedDeck.length, 8);
    assert.equal(new Set(selectedDeck).size, 8);
    assert.deepEqual(selectedDeck, DECK,
      "trusted editor order exactly matches the canonical public seed-2 setup");
    assert.deepEqual([...selectedDeck].sort(), [...DECK].sort(),
      "the real eight-slot editor admits the same custom card identities as the public seed-2 witness");
    await page.locator('.app-nav [data-nav-to="battle"]').click();
    const arena = page.frameLocator("[data-battle-frame-slot] iframe").locator('[data-ui="arena"]');
    await arena.waitFor({ state: "visible", timeout: 10_000 });
    const frame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(frame, "Battle mounts the released frame and browser controller");
    const moduleUrl = new URL("/src/ui/arena-shell-entry.js", origin).href;
    const seededSession = new GameSession(createEditableGameSessionSetup(DECK, 2));
    const setup = await frame.evaluate(async ({ entryUrl, sessionBytes, sessionSetup }) => {
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
        snapshot: controller.serialize(),
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
    assert.equal(setup.setup.seed, 2);
    assert.deepEqual(setup.setup.deck, DECK);
    assert.ok(setup.hand.includes("brackenwheel"));
    assert.ok(setup.northHand.includes("brackenwheel"),
      "the unforced north AI opening contains Brackenwheel naturally");
    assert.equal(setup.setup.legalNorthDeployments.length, 8,
      "the canonical setup admits the full deck to unforced AI selection");
    await frame.evaluate(() => {
      globalThis.__cards022Pointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards022Pointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    const cardSlot = page.frameLocator("[data-battle-frame-slot] iframe")
      .locator('[data-ui="card-slot"][data-card-id="brackenwheel"]');
    await cardSlot.click();
    const handCost = Number(await page.frameLocator("[data-battle-frame-slot] iframe")
      .locator('[data-ui="hud-hand"] [data-card-id="brackenwheel"] .hud-card__cost').innerText());
    assert.equal(handCost, 4, "the actual player hand presents Brackenwheel's live 4-elixir cost");
    await clickWorldPoint(page, arena, 3_500, 14_500);
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.stepMany(1);
    }, moduleUrl);
    const playerDeployment = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const session = controller.session;
      const events = session.replay.filter(({ side, type, deployment }) =>
        type === "session-deployed" && side === "south" &&
        deployment?.cardId === "brackenwheel");
      return { events, pointers: globalThis.__cards022Pointers,
        sequence: session.state.decks.south.sequence,
        transcript: JSON.parse(session.serialize()).transcript };
    }, moduleUrl);
    assert.equal(playerDeployment.events.length, 1,
      "one real player deployment receipt records Brackenwheel");
    assert.equal(playerDeployment.events[0].spend.cost, handCost);
    assert.equal(playerDeployment.sequence, 1,
      "the player deck cycle advances exactly once");
    assert.equal(playerDeployment.pointers.length, 1);
    assert.equal(playerDeployment.pointers[0].isTrusted, true,
      "Chrome's trusted pointer event places the player Brackenwheel");
    assert.ok(playerDeployment.transcript.some(({ type, command }) =>
      type === "submit" && command.type === "deploy" &&
      command.cardId === "brackenwheel" && command.point.x === 3_500 &&
      command.point.y === 14_500));
    evidence.playerDeployment = {
      events: playerDeployment.events,
      pointer: playerDeployment.pointers[0],
      southDeckSequence: playerDeployment.sequence,
      submit: playerDeployment.transcript.find(({ type, command }) =>
        type === "submit" && command.type === "deploy" &&
        command.cardId === "brackenwheel") ?? null,
    };

    let contact = null;
    for (let attempt = 0; attempt < 10 && contact === null; attempt += 1) {
      await frame.evaluate(async (entryUrl) => {
        const { arenaHudController: controller } = await import(entryUrl);
        controller.fastForwardSegment(60);
      }, moduleUrl);
      contact = await frame.evaluate(async (entryUrl) => {
        const { arenaHudController: controller } = await import(entryUrl);
        const replay = controller.session.replay;
        const northDeployments = replay.filter(({ side, type, deployment }) =>
          type === "session-deployed" && side === "north" &&
          deployment?.cardId === "brackenwheel");
        const playerBrackenwheel = controller.session.state.battle.units.find(({ cardId, side }) =>
          cardId === "brackenwheel" && side === "south");
        const northBrackenwheel = controller.session.state.battle.units.find(({ cardId, side }) =>
          cardId === "brackenwheel" && side === "north");
        const damage = replay.filter(({ attackerId, type }) =>
          type === "damage" && attackerId === playerBrackenwheel?.id);
        const grouped = new Map();
        for (const event of damage) {
          const group = grouped.get(event.tick) ?? [];
          group.push(event);
          grouped.set(event.tick, group);
        }
        const hit = [...grouped].find(([, events]) => events.length >= 3 &&
          events.filter(({ meleeAreaPolicyVersion }) =>
            meleeAreaPolicyVersion === "melee-area-question-v1").length >= 2);
        if (hit === undefined) return null;
        const browserSnapshot = controller.serialize();
        const inputBridgeBytes = JSON.parse(browserSnapshot).bridge;
        const selectedCardId = controller.state.selectedCardId;
        if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
            (selectedCardId !== null && typeof selectedCardId !== "string")) {
          throw new TypeError("contact must expose canonical browser input and selection state");
        }
        return {
          aiDeployments: northDeployments,
          damage: hit[1],
          primaryTargetId: northBrackenwheel?.id ?? null,
          tick: hit[0],
          snapshot: browserSnapshot,
          sessionBytes: controller.session.serialize(),
          audioBytes: controller.audioContinuationBytes,
          inputBridgeBytes, selectedCardId,
          setup: JSON.parse(controller.session.serialize()).setup,
        };
      }, moduleUrl);
    }
    assert.ok(contact, "the unforced AI and trusted player drop reach primary plus secondary Brackenwheel contact");
    assert.equal(typeof contact.inputBridgeBytes, "string",
      "contact captures the canonical serialized browser input bridge");
    assert.ok(contact.inputBridgeBytes.length > 0,
      "the contact input-bridge snapshot is nonempty rather than an undefined facade property");
    evidence.contactObservedBeforeAssertions = {
      aiDeployments: contact.aiDeployments,
      damage: contact.damage,
      tick: contact.tick,
    };
    assert.equal(contact.aiDeployments.length, 1,
      "the unforced north AI spends for one Brackenwheel deployment");
    assert.equal(contact.aiDeployments[0].spend.cost, 4);
    assert.deepEqual(contact.damage.map(({ amount }) => amount), [267, 267, 267, 267]);
    assert.equal(contact.damage.filter(({ meleeAreaPolicyVersion }) =>
      meleeAreaPolicyVersion === "melee-area-question-v1").length, 3,
    "the contact has one primary damage receipt and all three policy-tagged eligible secondaries");
    assert.equal(new Set(contact.damage.map(({ targetId }) => targetId)).size, 4,
      "the primary and three secondary targets receive one causal area contact each");
    const primaryDamage = contact.damage.filter(({ meleeAreaPolicyVersion }) =>
      meleeAreaPolicyVersion === undefined);
    const secondaryDamage = contact.damage.filter(({ meleeAreaPolicyVersion }) =>
      meleeAreaPolicyVersion === "melee-area-question-v1");
    assert.equal(primaryDamage.length, 1, "one primary target receives one hit");
    assert.equal(primaryDamage[0].targetId, contact.primaryTargetId,
      "the primary hit targets the north Brackenwheel");
    assert.deepEqual(secondaryDamage.map(({ targetId }) => targetId), [4, 5, 6],
      "the three secondary receipts hit every eligible north Briar Band entity exactly once");
    assert.equal(contact.setup.legalNorthDeployments.length, 8,
      "the AI witness remains the ordinary admitted eight-card setup");
    const screenshots = [];
    const file = "phone-brackenwheel-natural-ai-contact-390x844.png";
    await page.screenshot({ path: join(ARTIFACTS, file) });
    const screenshotBytes = (await import("node:fs/promises")).readFile(join(ARTIFACTS, file));
    screenshots.push({ file, sha256: sha256(await screenshotBytes) });
    const result = await frame.evaluate(async ({ entryUrl, contactTick }) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const marker = document.querySelector('.combat-marker[data-kind="brackenwheel"][data-side="south"]');
      const art = marker?.querySelector('.combat-art[data-art-id="brackenwheel"]');
      const notice = document.querySelector('[data-ui="policy-question"]');
      return {
        aiSequence: controller.session.state.decks.north.sequence,
        art: art === null ? null : { bodyCssPixels: art.dataset.bodyCssPixels,
          renderer: art.dataset.renderer, styleHeight: art.style.height, styleWidth: art.style.width },
        frameScale: Number(document.documentElement.dataset.combatFrameScale),
        presentationBodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
        contactTick,
        notice: notice === null ? null : { cardId: notice.dataset.cardId ?? null,
          disposition: notice.dataset.disposition ?? null, hidden: notice.hidden,
          text: notice.textContent },
        playerSequence: controller.session.state.decks.south.sequence,
        state: controller.session.state,
      };
    }, { entryUrl: moduleUrl, contactTick: contact.tick });
    assert.ok(result.art, "the actual combat projection renders Brackenwheel art");
    assert.equal(result.notice?.hidden, false,
      "the battle shell exposes the current custom deck's unresolved melee policy");
    assert.equal(result.notice?.cardId, "brackenwheel");
    assert.equal(result.notice?.disposition, "question");
    assert.match(result.notice?.text ?? "", /melee area\/contact rule remains QUESTION/u,
      "the low-confidence area/contact rule stays visible as QUESTION");
    const checkpoint = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.pause();
      const snapshot = controller.serialize();
      const inputBridgeBytes = JSON.parse(snapshot).bridge;
      const selectedCardId = controller.state.selectedCardId;
      if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
          (selectedCardId !== null && typeof selectedCardId !== "string")) {
        throw new TypeError("browser input bridge snapshot must be a nonempty canonical string");
      }
      return { audioBytes: controller.audioContinuationBytes,
        inputBridgeBytes, selectedCardId,
        sessionBytes: controller.session.serialize(),
        snapshot, stateBytes: JSON.stringify(controller.state) };
    }, moduleUrl);
    evidence.pausedCheckpoint = {
      audioSha256: sha256(Buffer.from(checkpoint.audioBytes)),
      inputBridgeBytes: checkpoint.inputBridgeBytes,
      selectedCardId: checkpoint.selectedCardId,
      sessionSha256: sha256(Buffer.from(checkpoint.sessionBytes)),
      snapshotSha256: sha256(Buffer.from(checkpoint.snapshot)),
      stateSha256: sha256(Buffer.from(checkpoint.stateBytes)),
    };
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      globalThis.__cards022PresentationRefreshes = [];
      window.addEventListener("message", (event) => {
        if (event.source !== window.parent || event.origin !== window.location.origin ||
            event.data?.channel !== "moss-and-ember-battle") return;
        const art = document.querySelector(
          '.combat-marker[data-kind="brackenwheel"][data-side="south"] .combat-art[data-art-id="brackenwheel"]',
        );
        const style = art === null ? null : getComputedStyle(art);
        const frame = window.frameElement;
        const frameStyle = frame === null ? null : getComputedStyle(frame);
        const matrix = frameStyle === null ? null : new DOMMatrixReadOnly(frameStyle.transform);
        const bodyFraction = art?.dataset.renderer === "native-svg" ? 28.4 / 32 : 501 / 512;
        const snapshot = controller.serialize();
        const inputBridgeBytes = JSON.parse(snapshot).bridge;
        const selectedCardId = controller.state.selectedCardId;
        if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
            (selectedCardId !== null && typeof selectedCardId !== "string")) {
          throw new TypeError("presentation input bridge snapshot must be a nonempty canonical string");
        }
        globalThis.__cards022PresentationRefreshes.push({
          active: event.data.active,
          deckIds: [...event.data.deckIds],
          incoming: { ...event.data.presentation },
          observedAfterHandler: {
            contextBodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
            contextFrameScale: Number(document.documentElement.dataset.combatFrameScale),
            artStyleHeight: art?.style.height ?? null,
            artComputedHeight: style?.height ?? null,
            outerFrameScale: matrix?.a ?? null,
            physicalBodyCssPixels: style === null || matrix === null ? null :
              Number.parseFloat(style.height) * bodyFraction * matrix.a,
          },
          state: { audioBytes: controller.audioContinuationBytes,
            inputBridgeBytes, selectedCardId, sessionBytes: controller.session.serialize(),
            snapshot, stateBytes: JSON.stringify(controller.state) },
        });
      }, { capture: true });
    }, moduleUrl);
    const presentationChecks = [];
    const presentationRefreshChecks = [];
    for (const mode of [
      { label: "phone-normal", motion: "no-preference", viewport: { width: 390, height: 844 },
        bodyCssPixels: 13, renderer: "native-svg" },
      { label: "phone-reduced", motion: "reduce", viewport: { width: 390, height: 844 },
        bodyCssPixels: 13, renderer: "native-svg" },
      { label: "desktop-normal", motion: "no-preference", viewport: { width: 1440, height: 933 },
        bodyCssPixels: 26, renderer: "painted-webp" },
      { label: "desktop-reduced", motion: "reduce", viewport: { width: 1440, height: 933 },
        bodyCssPixels: 26, renderer: "painted-webp" },
    ]) {
      const beforeResize = await frame.evaluate(async (entryUrl) => {
        const { arenaHudController: controller } = await import(entryUrl);
        const art = document.querySelector(
          '.combat-marker[data-kind="brackenwheel"][data-side="south"] .combat-art[data-art-id="brackenwheel"]',
        );
        const frame = window.frameElement;
        if (art === null || frame === null) throw new Error("pre-resize presentation targets are unavailable");
        const style = getComputedStyle(art);
        const matrix = new DOMMatrixReadOnly(getComputedStyle(frame).transform);
        const bodyFraction = art.dataset.renderer === "native-svg" ? 28.4 / 32 : 501 / 512;
        const snapshot = controller.serialize();
        const inputBridgeBytes = JSON.parse(snapshot).bridge;
        const selectedCardId = controller.state.selectedCardId;
        if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
            (selectedCardId !== null && typeof selectedCardId !== "string")) {
          throw new TypeError("pre-resize input state must expose the canonical bridge and selected card");
        }
        return { audioBytes: controller.audioContinuationBytes, inputBridgeBytes, selectedCardId,
          sessionBytes: controller.session.serialize(), snapshot,
          stateBytes: JSON.stringify(controller.state), paused: controller.state.paused,
          presentation: { bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
            frameScale: Number(document.documentElement.dataset.combatFrameScale),
            outerFrameScale: matrix.a,
            physicalBodyCssPixels: Number.parseFloat(style.height) * bodyFraction * matrix.a,
            artStyleHeight: art.style.height, renderer: art.dataset.renderer } };
      }, moduleUrl);
      const refreshMessageStart = await frame.evaluate(() =>
        globalThis.__cards022PresentationRefreshes.length);
      await page.setViewportSize(mode.viewport);
      await page.emulateMedia({ reducedMotion: mode.motion });
      await frame.waitForFunction(({ bodyCssPixels, reduce }) => {
        const frame = window.frameElement;
        if (frame === null) return false;
        const matrix = new DOMMatrixReadOnly(getComputedStyle(frame).transform);
        const art = document.querySelector(
          '.combat-marker[data-kind="brackenwheel"][data-side="south"] .combat-art[data-art-id="brackenwheel"]',
        );
        if (art === null) return false;
        const style = getComputedStyle(art);
        const fraction = art.dataset.renderer === "native-svg" ? 28.4 / 32 : 501 / 512;
        const renderedBodyCssPixels = Number.parseFloat(style.height) * fraction * matrix.a;
        return Number(document.documentElement.dataset.combatBodyCssPixels) === bodyCssPixels &&
          Math.abs(Number(document.documentElement.dataset.combatFrameScale) - matrix.a) < 1e-6 &&
          Math.abs(renderedBodyCssPixels - bodyCssPixels) < 0.02 &&
          matchMedia("(prefers-reduced-motion: reduce)").matches === reduce;
      }, { bodyCssPixels: mode.bodyCssPixels, reduce: mode.motion === "reduce" });
      const refreshed = await frame.evaluate(async ({ entryUrl, refreshMessageStart }) => {
        const { arenaHudController: controller } = await import(entryUrl);
        const markers = [...document.querySelectorAll('.combat-marker')];
        const playerMarker = document.querySelector(
          '.combat-marker[data-kind="brackenwheel"][data-side="south"]',
        );
        const art = document.querySelector(
          '.combat-marker[data-kind="brackenwheel"][data-side="south"] .combat-art[data-art-id="brackenwheel"]',
        );
        const bounds = art?.getBoundingClientRect();
        const style = art === null ? null : getComputedStyle(art);
        const markerBounds = playerMarker?.getBoundingClientRect();
        const outerFrame = window.frameElement;
        const outerFrameStyle = outerFrame === null ? null : getComputedStyle(outerFrame);
        const outerFrameBounds = outerFrame?.getBoundingClientRect();
        const outerMatrix = outerFrameStyle === null
          ? null : new DOMMatrixReadOnly(outerFrameStyle.transform);
        const bodyCssPixels = Number(document.documentElement.dataset.combatBodyCssPixels);
        const frameScale = Number(document.documentElement.dataset.combatFrameScale);
        const presentation = { artFound: art !== null,
          bodyCssPixels,
          artBodyCssPixels: art === null ? null : Number(art.dataset.bodyCssPixels),
          artOffsetHeight: art?.offsetHeight ?? null,
          artStyleHeight: art?.style.height ?? null,
          artComputedHeight: style?.height ?? null,
          artTransform: style?.transform ?? null,
          artNaturalSize: art instanceof HTMLImageElement
            ? { width: art.naturalWidth, height: art.naturalHeight } : null,
          frameScale,
          outerFrameScale: outerMatrix?.a ?? null,
          outerFrameTransform: outerFrameStyle?.transform ?? null,
          physicalBodyCssPixels: style === null || outerMatrix === null ? null :
            Number.parseFloat(style.height) * (art?.dataset.renderer === "native-svg"
              ? 28.4 / 32 : 501 / 512) * outerMatrix.a,
          height: bounds?.height ?? null,
          markerCount: markers.length,
          markerKinds: markers.map((marker) => ({ kind: marker.dataset.kind ?? null,
            side: marker.dataset.side ?? null })),
          playerMarker: playerMarker === null ? null : {
            className: playerMarker.getAttribute("class"),
            pose: playerMarker.dataset.pose ?? null,
            reaction: playerMarker.dataset.reaction ?? null,
            markerStyleHeight: playerMarker.style.height,
            markerComputedHeight: getComputedStyle(playerMarker).height,
            markerBoundsHeight: markerBounds?.height ?? null,
            markerTransform: getComputedStyle(playerMarker).transform,
            childArt: playerMarker.firstElementChild?.outerHTML.slice(0, 180) ?? null,
            kind: playerMarker.dataset.kind,
            side: playerMarker.dataset.side,
          },
          frameViewport: { innerWidth, innerHeight, clientWidth: document.documentElement.clientWidth,
            clientHeight: document.documentElement.clientHeight },
          outerFrame: outerFrame === null ? null : {
            boundsWidth: outerFrameBounds.width,
            boundsHeight: outerFrameBounds.height,
            cssTransform: outerFrameStyle.transform,
            cssWidth: outerFrameStyle.width,
            cssHeight: outerFrameStyle.height,
          },
          renderer: art?.dataset.renderer ?? null,
          reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
          sessionTick: controller.session.state.tick,
          setupDeck: JSON.parse(controller.session.serialize()).setup.deck,
          paused: controller.state.paused,
          controllerTick: controller.state.sessionTick };
        const snapshot = controller.serialize();
        const inputBridgeBytes = JSON.parse(snapshot).bridge;
        const selectedCardId = controller.state.selectedCardId;
        if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
            (selectedCardId !== null && typeof selectedCardId !== "string")) {
          throw new TypeError("post-refresh input state must expose the canonical bridge and selected card");
        }
        const after = { audioBytes: controller.audioContinuationBytes,
          inputBridgeBytes, selectedCardId,
          sessionBytes: controller.session.serialize(),
          snapshot, stateBytes: JSON.stringify(controller.state) };
        return { after, presentation,
          refreshMessages: globalThis.__cards022PresentationRefreshes.slice(refreshMessageStart) };
      }, { entryUrl: moduleUrl, refreshMessageStart });
      const presentation = refreshed.presentation;
      const currentContextMessage = refreshed.refreshMessages.find(({ incoming }) =>
        incoming.bodyCssPixels === mode.bodyCssPixels &&
        Math.abs(incoming.frameScale - presentation.frameScale) < 1e-12);
      const refreshState = refreshed.after;
      presentationRefreshChecks.push({ mode: mode.label,
        messageCount: refreshed.refreshMessages.length,
        sessionSha256: sha256(Buffer.from(refreshState.sessionBytes)),
        snapshotSha256: sha256(Buffer.from(refreshState.snapshot)),
        audioSha256: sha256(Buffer.from(refreshState.audioBytes)),
        inputBridgeSha256: sha256(Buffer.from(refreshState.inputBridgeBytes)),
        selectedCardId: refreshState.selectedCardId });
      evidence.presentationRefreshChecks = presentationRefreshChecks;
      evidence.presentationDiagnostics ??= [];
      evidence.presentationDiagnostics.push({ mode: mode.label,
        beforeResize: { ...beforeResize.presentation, paused: beforeResize.paused,
          inputBridgeSha256: sha256(Buffer.from(beforeResize.inputBridgeBytes)),
          selectedCardId: beforeResize.selectedCardId,
          sessionSha256: sha256(Buffer.from(beforeResize.sessionBytes)),
          snapshotSha256: sha256(Buffer.from(beforeResize.snapshot)),
          audioSha256: sha256(Buffer.from(beforeResize.audioBytes)) },
        afterResize: presentation,
        messageObserverSample: currentContextMessage?.observedAfterHandler ?? null });
      evidence.presentationMessageTrace ??= [];
      evidence.presentationMessageTrace.push({ mode: mode.label,
        messages: refreshed.refreshMessages.map(({ active, deckIds, incoming,
          observedAfterHandler, state }) => ({
          active, deckIds, incoming, observedAfterHandler,
          stateSha256: Object.fromEntries(Object.entries(state).map(([key, value]) => {
            if (value === undefined) throw new TypeError(`captured presentation state ${key} is undefined`);
            return [key, sha256(Buffer.from(typeof value === "string" ? value : JSON.stringify(value)))];
          })),
        })) });
      for (const key of ["audioBytes", "inputBridgeBytes", "selectedCardId",
        "sessionBytes", "snapshot", "stateBytes"]) {
        assert.equal(beforeResize[key], checkpoint[key],
          `${mode.label} immediate pre-resize ${key} matches the paused checkpoint`);
        assert.equal(refreshed.after[key], beforeResize[key],
          `${mode.label} automatic presentation refresh preserves pre-resize ${key}`);
        for (const refresh of refreshed.refreshMessages) {
          assert.equal(refresh.state[key], beforeResize[key],
            `${mode.label} post-handler message observation preserves ${key}`);
        }
      }
      if (mode.label === "desktop-normal") {
        assert.equal(beforeResize.presentation.bodyCssPixels, 13,
          "the actual pre-resize presentation still uses the phone body size");
        assert.ok(Math.abs(beforeResize.presentation.physicalBodyCssPixels - 13) < 0.02,
          "the actual pre-resize portrait measures 13 physical CSS pixels");
        assert.equal(presentation.bodyCssPixels, 26,
          "the production resize projects the desktop body size");
        assert.ok(Math.abs(presentation.physicalBodyCssPixels - 26) < 0.02,
          "the production resize redraws the portrait at 26 physical CSS pixels");
        assert.ok(currentContextMessage,
          "the desktop resize is accompanied by a production presentation message");
      }
      assert.ok(presentation.artFound,
        `${mode.label} keeps the player Brackenwheel visible: ${JSON.stringify(presentation)}`);
      assert.equal(presentation.bodyCssPixels, mode.bodyCssPixels);
      assert.equal(presentation.renderer, mode.renderer);
      assert.equal(presentation.reducedMotion, mode.motion === "reduce");
      assert.equal(presentation.paused, true,
        `${mode.label} keeps the explicitly paused checkpoint paused across layout updates`);
      const beforeFile = `brackenwheel-${mode.label}-before-restore.png`;
      const afterFile = `brackenwheel-${mode.label}-after-restore.png`;
      const before = await page.screenshot({ path: join(ARTIFACTS, beforeFile) });
      assert.ok(Math.abs(presentation.outerFrameScale - presentation.frameScale) < 1e-6,
        `${mode.label} renderer used the iframe's current CSS transform scale`);
      assert.ok(Math.abs(presentation.physicalBodyCssPixels -
        mode.bodyCssPixels) < 0.02,
      `${mode.label} renders an explicit ${mode.bodyCssPixels}px body at physical CSS size`);
      const restored = await frame.evaluate(async ({ entryUrl, snapshot }) => {
        const { arenaHudController: controller } = await import(entryUrl);
        controller.restore(snapshot);
        const restoredSnapshot = controller.serialize();
        const inputBridgeBytes = JSON.parse(restoredSnapshot).bridge;
        const selectedCardId = controller.state.selectedCardId;
        if (typeof inputBridgeBytes !== "string" || inputBridgeBytes.length === 0 ||
            (selectedCardId !== null && typeof selectedCardId !== "string")) {
          throw new TypeError("restored browser input bridge snapshot must be a nonempty canonical string");
        }
        return { audioBytes: controller.audioContinuationBytes,
          inputBridgeBytes, selectedCardId,
          sessionBytes: controller.session.serialize(), snapshot: restoredSnapshot,
          stateBytes: JSON.stringify(controller.state) };
      }, { entryUrl: moduleUrl, snapshot: checkpoint.snapshot });
      assert.equal(restored.snapshot, checkpoint.snapshot,
        `${mode.label} restores the exact browser checkpoint`);
      assert.equal(restored.sessionBytes, checkpoint.sessionBytes,
        `${mode.label} restores exact deterministic session bytes`);
      assert.equal(restored.inputBridgeBytes, checkpoint.inputBridgeBytes,
        `${mode.label} restores exact serialized browser input-bridge state`);
      assert.equal(restored.selectedCardId, checkpoint.selectedCardId,
        `${mode.label} restores the exact selected-card input state`);
      assert.equal(restored.audioBytes, checkpoint.audioBytes,
        `${mode.label} restores exact audio continuation state`);
      assert.equal(restored.stateBytes, checkpoint.stateBytes,
        `${mode.label} restores the exact projected game state`);
      const after = await page.screenshot({ path: join(ARTIFACTS, afterFile) });
      assert.deepEqual(after, before, `${mode.label} PNG is byte-identical after restore`);
      presentationChecks.push({ ...presentation, beforeResize: beforeResize.presentation,
        messageObserverSample: currentContextMessage?.observedAfterHandler ?? null,
        mode: mode.label,
        bodyCssPixels: mode.bodyCssPixels, before: { file: beforeFile,
          bytes: before.length, sha256: sha256(before) },
        after: { file: afterFile, bytes: after.length, sha256: sha256(after) } });
      evidence.presentationChecks = presentationChecks;
    }
    evidence.contact = { aiDeploymentCount: contact.aiDeployments.length,
      damage: contact.damage.map(({ amount, meleeAreaPolicyVersion, targetId, tick }) =>
        ({ amount, meleeAreaPolicyVersion: meleeAreaPolicyVersion ?? null, targetId, tick })),
      inputBridgeSnapshot: contact.inputBridgeBytes,
      selectedCardId: contact.selectedCardId, naturalAISetup: contact.setup,
      presentation: { ...result.art, frameScale: result.frameScale,
        bodyCssPixels: result.presentationBodyCssPixels },
      presentationChecks, playerDeckSequence: result.playerSequence,
      tick: contact.tick };
    evidence.screenshots = screenshots;
    const terminal = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      const initialState = controller.state;
      const resumeResult = controller.resume();
      const manualStepResult = controller.enterManualStepMode();
      const afterResume = { paused: controller.state.paused, running: controller.state.running,
        sessionTick: controller.state.sessionTick };
      let chunks = 0;
      while (!controller.state.terminal && chunks < 12) {
        controller.fastForwardSegment(1_200);
        chunks += 1;
      }
      const sessionState = controller.session.state;
      const sessionBytes = controller.session.serialize();
      return { chunks, initialState, resumeResult, manualStepResult, afterResume,
        state: controller.state,
        session: { tick: sessionState.tick, paused: sessionState.paused,
          terminal: sessionState.terminal,
          towers: sessionState.battle.towers.map(({ hitpoints, id }) => ({ hitpoints, id })) },
        setup: JSON.parse(sessionBytes).setup };
    }, moduleUrl);
    evidence.sameDeckTerminalAttempt = terminal;
    writeFileSync(join(ARTIFACTS, "cards022-browser-integration-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`);
    assert.equal(terminal.state.terminal, true,
      "the custom eight-card match reaches a natural terminal within the bounded 14,400-tick run");
    assert.deepEqual(terminal.setup.deck, DECK,
      "the terminal match still uses the selected Brackenwheel eight-card deck");
    await frame.locator('[data-ui="restart"]').click();
    const restarted = await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      return { restartCount: controller.state.restartCount,
        sessionBytes: controller.session.serialize(), state: controller.state,
        setup: JSON.parse(controller.session.serialize()).setup };
    }, moduleUrl);
    assert.equal(restarted.restartCount, 1, "trusted Play Again performs one same-deck restart");
    assert.equal(restarted.state.sessionTick, 0);
    assert.deepEqual(restarted.setup.deck, DECK,
      "same-deck restart retains all eight selected cards including Brackenwheel");
    assert.equal(restarted.setup.seed, 2,
      "same-deck restart retains the canonical seed-2 session setup");
    evidence.sameDeckRestart = { chunks: terminal.chunks,
      terminalTick: terminal.state.sessionTick, deck: restarted.setup.deck,
      restartCount: restarted.restartCount, restartedTick: restarted.state.sessionTick };
    evidence.screenshots = screenshots;
    evidence.snapshotSha256 = sha256(Buffer.from(contact.snapshot));
    evidence.sessionSha256 = sha256(Buffer.from(contact.sessionBytes));
    evidence.audioContinuationSha256 = sha256(Buffer.from(contact.audioBytes));
    evidence.releaseResult = "pass";
    evidence.server = { exitCode: null, stderr: serverStderr.join(""), stdout: serverStdout.join("") };
    writeFileSync(join(ARTIFACTS, "cards022-browser-integration-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`);
    assert.deepEqual(browserErrors, []);
  } catch (error) {
    evidence.releaseResult = "fail";
    evidence.failure = String(error?.stack ?? error);
    evidence.server = { exitCode: null, stderr: serverStderr.join(""), stdout: serverStdout.join("") };
    writeFileSync(join(ARTIFACTS, "cards022-browser-integration-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`);
    throw error;
  } finally {
    if (browser !== undefined) await browser.close();
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await new Promise((resolve) => server.once("exit", resolve));
    }
    evidence.server = { exitCode: server.exitCode,
      stderr: serverStderr.join(""), stdout: serverStdout.join("") };
    writeFileSync(join(ARTIFACTS, "cards022-browser-integration-evidence.json"),
      `${JSON.stringify(evidence, null, 2)}\n`);
  }
});
