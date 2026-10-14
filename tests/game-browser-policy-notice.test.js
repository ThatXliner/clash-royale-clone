import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ARTIFACTS = process.env.FRAME_NOTICE_ARTIFACTS ??
  fileURLToPath(new URL("../artifacts/frame-notice-round1/builder/", import.meta.url));
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = Object.freeze({ height: 844, width: 390 });
const BASE_DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "briar-band",
]);

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function setupFor(cardId) {
  return cardId === null
    ? createShippedGameSessionSetup(0)
    : createEditableGameSessionSetup([...BASE_DECK, cardId], 0);
}

function policyAudit(sessionBytes) {
  const { setup } = JSON.parse(sessionBytes);
  const battleSetup = JSON.parse(setup.battleSetup);
  const card = battleSetup.roster.find(({ buildingRuntime }) =>
    buildingRuntime?.class === "defensive" &&
    buildingRuntime.policy?.disposition === "question");
  if (card === undefined) return null;
  return {
    cardId: card.id,
    fields: Object.fromEntries(Object.entries(card.buildingRuntime.policy.corpusFields)
      .map(([field, record]) => [field, record.authoritative])),
  };
}

function expectedNotice(sessionBytes) {
  const { setup } = JSON.parse(sessionBytes);
  const battleSetup = JSON.parse(setup.battleSetup);
  const card = battleSetup.roster.find(({ buildingRuntime }) =>
    buildingRuntime?.class === "defensive" &&
    buildingRuntime.policy?.disposition === "question");
  if (card === undefined) {
    return {
      cardId: null,
      disposition: null,
      hidden: true,
      text: "",
      unverifiedFields: null,
    };
  }
  const fields = card.buildingRuntime.policy.corpusFields;
  const unverifiedFields = Object.entries(fields)
    .filter(([, field]) => field.authoritative !== true)
    .map(([field]) => field);
  return {
    cardId: card.id,
    disposition: "question",
    hidden: false,
    text: `${card.displayName} combat: QUESTION. First-hit timing is ${fields.firstHitTicks.value === null
      ? "absent" : "unverified"}; damage, HP, deploy, range and target fields are unverified.`,
    unverifiedFields: unverifiedFields.join(","),
  };
}

async function readFirstLine(stream) {
  let buffered = "";
  stream.setEncoding("utf8");
  for await (const chunk of stream) {
    buffered += chunk;
    const end = buffered.indexOf("\n");
    if (end >= 0) return buffered.slice(0, end);
  }
  throw new Error("policy notice server exited before readiness");
}

async function stopServer(server) {
  if (server === undefined || server.exitCode !== null) return true;
  const exited = once(server, "exit").then(() => true, () => false);
  server.kill("SIGTERM");
  let didExit = await Promise.race([
    exited, new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
  ]);
  if (!didExit && server.exitCode === null) {
    server.kill("SIGKILL");
    didExit = await Promise.race([
      exited, new Promise((resolve) => setTimeout(() => resolve(false), 2_000)),
    ]);
  }
  return didExit && (server.exitCode !== null || server.signalCode !== null);
}

function makeForgedSession(sessionBytes) {
  const forged = JSON.parse(sessionBytes);
  const battleSetup = JSON.parse(forged.setup.battleSetup);
  const card = battleSetup.roster.find(({ id }) => id === "buried-coil");
  card.buildingRuntime.policy.corpusFields.damage.authoritative = true;
  forged.setup.battleSetup = canonical(battleSetup);
  forged.setup.rosterWitness = canonical({
    questions: battleSetup.questions,
    roster: battleSetup.roster,
  });
  return canonical(forged);
}

test("policy notice follows canonical roster through restore and restart", {
  timeout: 600_000,
}, async () => {
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  mkdirSync(ARTIFACTS, { recursive: true });

  // This terminal witness is produced by ordinary deterministic simulation.
  // No tower health, clock, or browser state is edited to force a result.
  const buriedSetupBytes = setupFor("buried-coil");
  const buriedTerminal = new GameSession(buriedSetupBytes);
  let terminalBatches = 0;
  while (!buriedTerminal.state.terminal && terminalBatches < 30) {
    buriedTerminal.stepMany(600);
    terminalBatches += 1;
  }
  assert.equal(buriedTerminal.state.terminal, true,
    "Buried Coil seed zero naturally reaches its deterministic terminal state");

  const setupBytes = {
    buriedCoil: buriedSetupBytes,
    emberBasin: setupFor("ember-basin"),
    defaultEight: setupFor(null),
    terminalBuriedCoilSession: buriedTerminal.serialize(),
  };
  const expectedSessions = {
    buriedCoil: new GameSession(setupBytes.buriedCoil).serialize(),
    emberBasin: new GameSession(setupBytes.emberBasin).serialize(),
    defaultEight: new GameSession(setupBytes.defaultEight).serialize(),
  };
  const expectedNotices = Object.fromEntries(Object.entries(expectedSessions)
    .map(([name, bytes]) => [name, expectedNotice(bytes)]));
  const expectedPolicies = Object.fromEntries(Object.entries(expectedSessions)
    .map(([name, bytes]) => [name, policyAudit(bytes)]));
  const forgedSessionBytes = makeForgedSession(expectedSessions.buriedCoil);

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${ROOT}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const evidence = {
    browserVersion: null,
    checks: [],
    consoleErrors: [],
    pageErrors: [],
    screenshots: Object.create(null),
    viewport: VIEWPORT,
  };
  const mismatches = [];
  const serializedReceipt = (value) => ({
    bytes: value.length,
    sha256: createHash("sha256").update(value).digest("hex"),
  });
  const compareSerialized = (label, actual, expected) => {
    const equal = actual === expected;
    evidence.checks.push({ label, passed: equal,
      actual: serializedReceipt(actual), expected: serializedReceipt(expected) });
    if (!equal) mismatches.push({ label, actual: serializedReceipt(actual),
      expected: serializedReceipt(expected) });
    return equal;
  };
  const compare = (label, actual, expected) => {
    const equal = JSON.stringify(actual) === JSON.stringify(expected);
    evidence.checks.push({ label, passed: equal });
    if (!equal) mismatches.push({ label, actual, expected });
    return equal;
  };
  const compareScalar = (label, actual, expected) => {
    const equal = actual === expected;
    evidence.checks.push({ label, passed: equal });
    if (!equal) mismatches.push({ label, actual, expected });
    return equal;
  };
  const recordSnapshot = (label, actual, expectedName) => {
    const expected = expectedSessions[expectedName];
    const expectedNoticeValue = expectedNotices[expectedName];
    const actualSessionHash = createHash("sha256").update(actual.sessionBytes).digest("hex");
    const expectedSessionHash = createHash("sha256").update(expected).digest("hex");
    const actualBrowserHash = createHash("sha256").update(actual.browserBytes).digest("hex");
    const actualAudioHash = createHash("sha256").update(actual.audioContinuationBytes).digest("hex");
    const expectedAudio = canonical({
      cursor: 0,
      disposed: false,
      gainBasisPoints: 10_000,
      muted: false,
      sessionBytes: expected,
      suppressedAcceleratedCueCount: 0,
      terminal: false,
      version: 1,
    });
    const checks = [
      compare(`${label}: canonical notice`, actual.notice, expectedNoticeValue),
      compareSerialized(`${label}: exact session bytes`, actual.sessionBytes, expected),
      compareSerialized(`${label}: exact browser snapshot bytes`, actual.browserBytes,
        actual.expectedBrowserBytes),
      compareSerialized(`${label}: exact audio continuation bytes`,
        actual.audioContinuationBytes, expectedAudio),
      compare(`${label}: policy authority remains unverified`, actual.policy,
        expectedPolicies[expectedName]),
    ];
    evidence.checks.push({ label: `${label}: session hash`, actual: actualSessionHash,
      expected: expectedSessionHash, passed: actualSessionHash === expectedSessionHash });
    evidence.checks.push({ label: `${label}: browser hash`, actual: actualBrowserHash });
    evidence.checks.push({ label: `${label}: audio continuation hash`, actual: actualAudioHash });
    if (expectedNoticeValue.cardId !== null) {
      const { setup } = JSON.parse(expected);
      const card = JSON.parse(setup.battleSetup).roster.find(({ id }) =>
        id === expectedNoticeValue.cardId);
      const corpusFields = card.buildingRuntime.policy.corpusFields;
      const leaked = Object.entries(corpusFields).some(([field, record]) =>
        field !== "cost" && record.authoritative !== true &&
        typeof record.value === "number" && actual.notice.text.includes(String(record.value)));
      compareScalar(`${label}: no provisional value in notice text`, leaked, false);
    }
    return checks.every(Boolean);
  };
  const capture = async (page, name) => {
    const bytes = await page.screenshot({ fullPage: false });
    const path = join(ARTIFACTS, `${name}.png`);
    writeFileSync(path, bytes);
    evidence.screenshots[name] = {
      bytes: bytes.length,
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    };
    return bytes;
  };
  try {
    const ready = JSON.parse(await readFirstLine(server.stdout));
    const { chromium } = await import("playwright");
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    evidence.browserVersion = browser.version();
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: VIEWPORT });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") evidence.consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => evidence.pageErrors.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?app-frame=1`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForFunction(() =>
      document.querySelector('[data-arena-shell-root] [data-ui="arena"]') !== null);
    const mounted = await page.evaluate(async (buriedSetup) => {
      const { arenaHudController } = await import("/src/ui/arena-shell-entry.js");
      const { GameSession } = await import("/src/sim/game-session.js");
      const { mountShippedGameBrowser } = await import("/src/ui/game-browser-entry.js");
      const root = document.querySelector("[data-arena-shell-root]");
      const disposedInitial = arenaHudController.dispose();
      const controller = mountShippedGameBrowser(root, window,
        new GameSession(buriedSetup));
      const manual = controller.enterManualStepMode();
      globalThis.__frameNoticeController = controller;
      return { disposedInitial, manual, notice: (() => {
        const node = root.querySelector('[data-ui="policy-question"]');
        return node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null;
      })(), sessionBytes: controller.session.serialize(), state: controller.state };
    }, setupBytes.buriedCoil);
    compareScalar("manual source controller mounted", mounted.manual, true);
    compareScalar("initial canonical Buried Coil session", mounted.sessionBytes,
      expectedSessions.buriedCoil);
    compare("initial Buried Coil notice", mounted.notice, expectedNotices.buriedCoil);

    // Make authentic cross-roster browser snapshots on detached DOM roots.
    // They use the same shipped entry, real GameSession and typed bridge
    // serializers as the visible controller.
    const sourceSnapshots = await page.evaluate(async (setups) => {
      const { GameSession } = await import("/src/sim/game-session.js");
      const { mountShippedGameBrowser } = await import("/src/ui/game-browser-entry.js");
      const result = Object.create(null);
      for (const name of ["emberBasin", "defaultEight"]) {
        const sourceRoot = document.createElement("div");
        const source = mountShippedGameBrowser(sourceRoot, window,
          new GameSession(setups[name]));
        const manual = source.enterManualStepMode();
        if (!manual) throw new Error(`${name} source did not enter manual mode`);
        result[name] = {
          audioContinuationBytes: source.audioContinuationBytes,
          browserBytes: source.serialize(),
          sessionBytes: source.session.serialize(),
        };
        source.dispose();
      }
      return result;
    }, { emberBasin: setupBytes.emberBasin, defaultEight: setupBytes.defaultEight });
    for (const name of ["emberBasin", "defaultEight"]) {
      compareScalar(`${name} authentic source session`, sourceSnapshots[name].sessionBytes,
        expectedSessions[name]);
    }
    await page.evaluate(() => document.fonts.ready);
    const initialBuried = await page.evaluate(() => {
      const controller = globalThis.__frameNoticeController;
      const node = document.querySelector('[data-ui="policy-question"]');
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: (() => {
          const session = JSON.parse(controller.session.serialize());
          const setup = JSON.parse(session.setup.battleSetup);
          const card = setup.roster.find(({ id }) => id === "buried-coil");
          return card ? { cardId: card.id, fields: Object.fromEntries(
            Object.entries(card.buildingRuntime.policy.corpusFields)
              .map(([field, record]) => [field, record.authoritative])) } : null;
        })(),
        sessionBytes: controller.session.serialize(),
      };
    });
    initialBuried.expectedBrowserBytes = initialBuried.browserBytes;
    recordSnapshot("visible Buried Coil before cross-roster restores", initialBuried,
      "buriedCoil");
    const buriedInitialPng = await capture(page, "buried-coil-initial");

    // Sync restore changes roster Buried Coil -> Ember Basin. The notice and
    // all source-bound fields must follow the canonical restored session.
    await page.evaluate((bytes) => globalThis.__frameNoticeController.restore(bytes),
      sourceSnapshots.emberBasin.browserBytes);
    const emberAfterSync = await page.evaluate(() => {
      const controller = globalThis.__frameNoticeController;
      const node = document.querySelector('[data-ui="policy-question"]');
      const setup = JSON.parse(JSON.parse(controller.session.serialize()).setup.battleSetup);
      const card = setup.roster.find(({ id }) => id === "ember-basin");
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: card ? { cardId: card.id, fields: Object.fromEntries(
          Object.entries(card.buildingRuntime.policy.corpusFields)
            .map(([field, record]) => [field, record.authoritative])) } : null,
        sessionBytes: controller.session.serialize(),
      };
    });
    emberAfterSync.expectedBrowserBytes = sourceSnapshots.emberBasin.browserBytes;
    recordSnapshot("synchronous cross-roster restore to Ember Basin", emberAfterSync,
      "emberBasin");
    const emberSyncPng = await capture(page, "ember-basin-after-sync-restore");

    // Return to Buried Coil and compare the real native viewport PNG with its
    // untouched checkpoint. This catches stale or missing sibling notice DOM.
    await page.evaluate((bytes) => globalThis.__frameNoticeController.restore(bytes),
      initialBuried.browserBytes);
    const buriedAfterSync = await page.evaluate(() => {
      const controller = globalThis.__frameNoticeController;
      const node = document.querySelector('[data-ui="policy-question"]');
      const setup = JSON.parse(JSON.parse(controller.session.serialize()).setup.battleSetup);
      const card = setup.roster.find(({ id }) => id === "buried-coil");
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: card ? { cardId: card.id, fields: Object.fromEntries(
          Object.entries(card.buildingRuntime.policy.corpusFields)
            .map(([field, record]) => [field, record.authoritative])) } : null,
        sessionBytes: controller.session.serialize(),
      };
    });
    buriedAfterSync.expectedBrowserBytes = initialBuried.browserBytes;
    recordSnapshot("synchronous cross-roster restore back to Buried Coil", buriedAfterSync,
      "buriedCoil");
    const buriedRestoredPng = await capture(page, "buried-coil-after-sync-restore");
    compareScalar("native full-viewport PNG exact after synchronous restore",
      buriedRestoredPng.equals(buriedInitialPng), true);

    // The yielding path commits the same authentic Ember snapshot after its
    // normal browser RAF yields. It must preserve the same typed and audio
    // continuation bytes as the synchronous restore.
    await page.evaluate(async (bytes) =>
      globalThis.__frameNoticeController.restoreEndurance(bytes),
    sourceSnapshots.emberBasin.browserBytes);
    const emberAfterYielding = await page.evaluate(() => {
      const controller = globalThis.__frameNoticeController;
      const node = document.querySelector('[data-ui="policy-question"]');
      const setup = JSON.parse(JSON.parse(controller.session.serialize()).setup.battleSetup);
      const card = setup.roster.find(({ id }) => id === "ember-basin");
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: card ? { cardId: card.id, fields: Object.fromEntries(
          Object.entries(card.buildingRuntime.policy.corpusFields)
            .map(([field, record]) => [field, record.authoritative])) } : null,
        sessionBytes: controller.session.serialize(),
      };
    });
    emberAfterYielding.expectedBrowserBytes = sourceSnapshots.emberBasin.browserBytes;
    recordSnapshot("yielding cross-roster restore to Ember Basin", emberAfterYielding,
      "emberBasin");
    const emberYieldingPng = await capture(page, "ember-basin-after-yielding-restore");
    compareScalar("native full-viewport PNG exact across Ember restore paths",
      emberYieldingPng.equals(emberSyncPng), true);

    // A default eight-card restore must clear every old QUESTION field and
    // keep the notice hidden. Restoring a policy card after that must project
    // its own exact canonical identity and text again.
    await page.evaluate((bytes) => globalThis.__frameNoticeController.restore(bytes),
      sourceSnapshots.defaultEight.browserBytes);
    const defaultAfterSync = await page.evaluate(() => {
      const controller = globalThis.__frameNoticeController;
      const node = document.querySelector('[data-ui="policy-question"]');
      return { audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: null, sessionBytes: controller.session.serialize() };
    });
    defaultAfterSync.expectedBrowserBytes = sourceSnapshots.defaultEight.browserBytes;
    recordSnapshot("synchronous cross-roster restore to default eight", defaultAfterSync,
      "defaultEight");
    await capture(page, "default-eight-hidden-notice");
    await page.evaluate((bytes) => globalThis.__frameNoticeController.restore(bytes),
      initialBuried.browserBytes);
    const buriedAfterDefault = await page.evaluate(() => {
      const controller = globalThis.__frameNoticeController;
      const node = document.querySelector('[data-ui="policy-question"]');
      const battleSetup = JSON.parse(
        JSON.parse(controller.session.serialize()).setup.battleSetup);
      const card = battleSetup.roster.find(({ id }) => id === "buried-coil");
      return { audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: card ? { cardId: card.id, fields: Object.fromEntries(
          Object.entries(card.buildingRuntime.policy.corpusFields)
            .map(([field, record]) => [field, record.authoritative])) } : null,
        sessionBytes: controller.session.serialize() };
    });
    buriedAfterDefault.expectedBrowserBytes = initialBuried.browserBytes;
    recordSnapshot("policy notice returns after default-roster restore", buriedAfterDefault,
      "buriedCoil");

    // A forged building policy that upgrades a QUESTION field to authoritative
    // is rejected by canonical GameSession restore before the active graph or
    // the currently projected notice can change.
    const forgedOutcome = await page.evaluate((forgedSession) => {
      const controller = globalThis.__frameNoticeController;
      const before = controller.serialize();
      const envelope = JSON.parse(before);
      envelope.session = forgedSession;
      let error = null;
      try { controller.restore(canonicalize(envelope)); }
      catch (caught) { error = String(caught?.message ?? caught); }
      return { after: controller.serialize(), before, error };
      function canonicalize(value) {
        if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
        if (value !== null && typeof value === "object") {
          return `{${Object.keys(value).sort().map((key) =>
            `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
        }
        return JSON.stringify(value);
      }
    }, forgedSessionBytes);
    compareScalar("forged policy snapshot rejected", typeof forgedOutcome.error, "string");
    compareSerialized("forged policy snapshot leaves browser bytes unchanged",
      forgedOutcome.after, forgedOutcome.before);

    // Exercise public same-deck restart from a genuinely terminal simulation.
    // The browser mounts that authentic terminal snapshot; restart must rebuild
    // the same custom setup with its QUESTION policy still unverified.
    const restartOutcome = await page.evaluate(async (terminalBytes) => {
      const { GameSession } = await import("/src/sim/game-session.js");
      const { mountShippedGameBrowser } = await import("/src/ui/game-browser-entry.js");
      const root = document.querySelector("[data-arena-shell-root]");
      globalThis.__frameNoticeController.dispose();
      const terminalSession = GameSession.restore(terminalBytes);
      const controller = mountShippedGameBrowser(root, window, terminalSession);
      globalThis.__frameNoticeController = controller;
      const terminal = { state: controller.state, sessionBytes: controller.session.serialize() };
      const restartedState = controller.restart();
      const restartManual = controller.enterManualStepMode();
      const node = document.querySelector('[data-ui="policy-question"]');
      return {
        deck: JSON.parse(controller.session.serialize()).setup.deck,
        manual: restartManual,
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        restartCount: restartedState.restartCount,
        sessionBytes: controller.session.serialize(),
        sessionTick: controller.session.state.tick,
        terminal,
      };
    }, setupBytes.terminalBuriedCoilSession);
    compareScalar("restart source session is naturally terminal",
      restartOutcome.terminal.state.terminal, true);
    compareScalar("restart source terminal tick", restartOutcome.terminal.state.sessionTick,
      buriedTerminal.state.tick);
    compareScalar("same-deck restart returns seed-zero setup bytes",
      restartOutcome.sessionBytes, expectedSessions.buriedCoil);
    compareScalar("same-deck restart preserves the full eight-card order",
      JSON.stringify(restartOutcome.deck), JSON.stringify(JSON.parse(expectedSessions.buriedCoil)
        .setup.deck));
    compareScalar("same-deck restart count", restartOutcome.restartCount, 1);
    compareScalar("same-deck restart is held at tick zero for native capture",
      restartOutcome.manual, true);
    compareScalar("same-deck restart session tick", restartOutcome.sessionTick, 0);
    compare("same-deck restart canonical notice", restartOutcome.notice,
      expectedNotices.buriedCoil);
    const restartedPng = await capture(page, "buried-coil-after-same-deck-restart");
    compareScalar("native full-viewport PNG exact after same-deck restart",
      restartedPng.equals(buriedInitialPng), true);

    evidence.terminalWitness = {
      batches: terminalBatches,
      tick: buriedTerminal.state.tick,
      result: buriedTerminal.state.clock.result,
      sessionSha256: createHash("sha256").update(buriedTerminal.serialize()).digest("hex"),
      source: "ordinary deterministic GameSession.stepMany(600) until terminal",
    };
    evidence.consoleErrors = [...evidence.consoleErrors];
    evidence.pageErrors = [...evidence.pageErrors];
    writeFileSync(join(ARTIFACTS, "notice-journey-evidence.json"),
      `${JSON.stringify({ evidence, mismatches }, null, 2)}\n`);
    assert.deepEqual(evidence.consoleErrors, [], "browser has no console errors");
    assert.deepEqual(evidence.pageErrors, [], "browser has no uncaught page errors");
    assert.deepEqual(mismatches, [],
      `canonical policy notice lifecycle checks: ${JSON.stringify(mismatches)}`);
  } finally {
    await browser?.close();
    await stopServer(server);
  }
});
