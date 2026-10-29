import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { GameSession } from "../src/sim/game-session.js";
import { createChainQuestionFixture } from "../src/sim/live-battle-chain.js";
import { createShippedGameSessionSetup } from "../src/ui/game-browser-entry.js";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ARTIFACTS = process.env.FRAME_NOTICE_ARTIFACTS ??
  mkdtempSync(join(tmpdir(), "stormkite-policy-notice-"));
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const VIEWPORT = Object.freeze({ height: 844, width: 390 });
const BASE_DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "briar-band",
]);
const STORMKITE_QUESTION_FIELDS = Object.freeze(Object.keys(createChainQuestionFixture()));

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
  const questions = [];
  if (card !== undefined) {
    const fields = card.buildingRuntime.policy.corpusFields;
    questions.push({
      cardId: card.id,
      displayName: card.displayName,
      text: `${card.displayName} combat: QUESTION. First-hit timing is ${fields.firstHitTicks.value === null
        ? "absent" : "unverified"}; damage, HP, deploy, range and target fields are unverified.`,
      unverifiedFields: Object.entries(fields)
        .filter(([, field]) => field.authoritative !== true)
        .map(([field]) => field),
    });
  } else if (setup.deck.includes("brackenwheel")) {
    questions.push({
      cardId: "brackenwheel",
      displayName: "Brackenwheel",
      text: "Brackenwheel melee area/contact rule remains QUESTION and provisional for historical comparison.",
      unverifiedFields: ["melee-area-contact"],
    });
  }
  if (setup.deck.includes("stormkite")) {
    questions.push({
      cardId: "stormkite",
      displayName: battleSetup.roster.find(({ id }) => id === "stormkite").displayName,
      text: "Stormkite chain hops: QUESTION. Target choice, hop limits and timing remain unverified.",
      unverifiedFields: STORMKITE_QUESTION_FIELDS,
    });
  }
  if (questions.length === 0) {
    return {
      cardId: null,
      disposition: null,
      hidden: true,
      text: "",
      unverifiedFields: null,
    };
  }
  return {
    cardId: questions[0].cardId,
    ...(questions.length > 1
      ? { cardIds: questions.map(({ cardId }) => cardId).join(",") } : {}),
    disposition: "question",
    hidden: false,
    text: `QUESTION · ${questions.map(({ displayName }) => displayName).join(" + ")} · Details` +
      questions.map(({ displayName, text }) => `${displayName} · QUESTION${text}`).join(""),
    unverifiedFields: [...new Set(questions.flatMap(({ unverifiedFields }) =>
      unverifiedFields))].join(","),
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

  const buriedSetupBytes = setupFor("buried-coil");
  // This terminal witness is produced by ordinary deterministic simulation.
  // No tower health, clock, or browser state is edited to force a result.
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
    terminalBuriedCoilSession: buriedTerminal.serialize(),
    emberBasin: setupFor("ember-basin"),
    defaultEight: setupFor(null),
    stormkite: setupFor("stormkite"),
    stormkiteBrackenwheel: createEditableGameSessionSetup([
      "stormkite", "brackenwheel", ...BASE_DECK.slice(0, 6),
    ], 0),
    stormkiteBuriedCoil: createEditableGameSessionSetup([
      "stormkite", "buried-coil", ...BASE_DECK.slice(0, 6),
    ], 0),
  };

  const stormkiteBuriedBattleSetup = JSON.parse(
    setupBytes.stormkiteBuriedCoil).battleSetup;
  const stormkiteBuriedCard = JSON.parse(stormkiteBuriedBattleSetup).roster.find(({ id }) =>
    id === "buried-coil");
  assert.equal(stormkiteBuriedCard?.buildingRuntime?.class, "defensive",
    "the admitted Stormkite mixed deck still contains the real Buried Coil defensive profile");
  assert.equal(stormkiteBuriedCard.displayName, "Buried Coil",
    "the mixed setup retains the source-bound Buried Coil notice identity");
  assert.equal(stormkiteBuriedCard.buildingRuntime.policy.disposition, "question",
    "Buried Coil's existing combat uncertainty remains a QUESTION in the mixed setup");

  const expectedSessions = {
    buriedCoil: new GameSession(setupBytes.buriedCoil).serialize(),
    emberBasin: new GameSession(setupBytes.emberBasin).serialize(),
    defaultEight: new GameSession(setupBytes.defaultEight).serialize(),
    stormkite: new GameSession(setupBytes.stormkite).serialize(),
    stormkiteBrackenwheel: new GameSession(setupBytes.stormkiteBrackenwheel).serialize(),
    stormkiteBuriedCoil: new GameSession(setupBytes.stormkiteBuriedCoil).serialize(),
  };
  const expectedNotices = Object.fromEntries(Object.entries(expectedSessions)
    .map(([name, bytes]) => [name, expectedNotice(bytes)]));
  const expectedPolicies = Object.fromEntries(Object.entries(expectedSessions)
    .map(([name, bytes]) => [name, policyAudit(bytes)]));
  assert.equal(expectedPolicies.stormkiteBuriedCoil?.cardId, "buried-coil",
    "the canonical defensive QUESTION policy is retained beside Stormkite");
  assert.equal(expectedNotices.stormkiteBrackenwheel.cardIds, "brackenwheel,stormkite",
    "the browser notice keeps both Brackenwheel and Stormkite identities");
  assert.equal(expectedNotices.stormkiteBuriedCoil.cardIds, "buried-coil,stormkite",
    "the browser notice keeps both Buried Coil and Stormkite identities");
  assert.match(expectedNotices.stormkiteBuriedCoil.text, /Buried Coil combat: QUESTION\./u,
    "the combined notice preserves the real defensive card's QUESTION text");
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
    visualDiagnostics: [],
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
      const corpusFields = card?.buildingRuntime?.policy?.corpusFields;
      if (corpusFields !== undefined) {
        const leaked = Object.entries(corpusFields).some(([field, record]) =>
          field !== "cost" && record.authoritative !== true &&
          typeof record.value === "number" && actual.notice.text.includes(String(record.value)));
        compareScalar(`${label}: no provisional value in notice text`, leaked, false);
      }
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
    const { chromium } = await import(process.env.GAME_BROWSER_PLAYWRIGHT ?? "playwright");
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    evidence.browserVersion = browser.version();
    const context = await browser.newContext({ deviceScaleFactor: 1, viewport: VIEWPORT });
    const page = await context.newPage();
    await page.addInitScript(() => {
      globalThis.__policyNoticeDetails = (node) => {
        const details = node?.querySelector("details.policy-question-details") ?? null;
        return details ? {
          open: details.open,
          summary: details.querySelector("summary")?.textContent ?? "",
          cards: [...details.querySelectorAll(".policy-question-detail-card")].map((card) => ({
            cardId: card.dataset.cardId,
            heading: card.querySelector("h2")?.textContent ?? "",
            text: card.querySelector("p")?.textContent ?? "",
          })),
        } : null;
      };
      globalThis.__arenaViewportDiagnostic = () => {
        const rect = (node) => {
          if (!node) return null;
          const { x, y, width, height, top, right, bottom, left } = node.getBoundingClientRect();
          return { bottom, height, left, right, top, width, x, y };
        };
        const ancestors = [];
        let node = document.querySelector(".battle-shell");
        while (node) {
          ancestors.push({
            clientHeight: node.clientHeight,
            clientWidth: node.clientWidth,
            className: typeof node.className === "string" ? node.className : "",
            id: node.id,
            left: node.scrollLeft,
            localName: node.localName,
            rect: rect(node),
            scrollHeight: node.scrollHeight,
            scrollTop: node.scrollTop,
            scrollWidth: node.scrollWidth,
          });
          node = node.parentElement;
        }
        return {
          activeElement: document.activeElement?.tagName ?? null,
          ancestors,
          arena: rect(document.querySelector('[data-ui="arena"]')),
          battleShell: rect(document.querySelector(".battle-shell")),
          documentScroll: { left: document.documentElement.scrollLeft,
            top: document.documentElement.scrollTop },
          visualViewport: window.visualViewport ? {
            height: visualViewport.height, offsetLeft: visualViewport.offsetLeft,
            offsetTop: visualViewport.offsetTop, pageLeft: visualViewport.pageLeft,
            pageTop: visualViewport.pageTop, scale: visualViewport.scale,
            width: visualViewport.width,
          } : null,
          windowScroll: { x: scrollX, y: scrollY },
          viewport: { height: innerHeight, width: innerWidth },
        };
      };
    });
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
      for (const name of ["emberBasin", "defaultEight", "stormkite",
        "stormkiteBrackenwheel", "stormkiteBuriedCoil"]) {
        const sourceRoot = document.createElement("div");
        const source = mountShippedGameBrowser(sourceRoot, window,
          new GameSession(setups[name]));
        const manual = source.enterManualStepMode();
        if (!manual) throw new Error(`${name} source did not enter manual mode`);
        result[name] = {
          audioContinuationBytes: source.audioContinuationBytes,
          browserBytes: source.serialize(),
          notice: (() => {
            const node = sourceRoot.querySelector('[data-ui="policy-question"]');
            return node ? {
              cardId: node.dataset.cardId ?? null,
              ...(node.dataset.cardIds === undefined
                ? {} : { cardIds: node.dataset.cardIds }),
              disposition: node.dataset.disposition ?? null,
              hidden: node.hidden,
              text: node.textContent,
              unverifiedFields: node.dataset.unverifiedFields ?? null,
            } : null;
          })(),
          sessionBytes: source.session.serialize(),
        };
        source.dispose();
      }
      return result;
    }, {
      emberBasin: setupBytes.emberBasin,
      defaultEight: setupBytes.defaultEight,
      stormkite: setupBytes.stormkite,
      stormkiteBrackenwheel: setupBytes.stormkiteBrackenwheel,
      stormkiteBuriedCoil: setupBytes.stormkiteBuriedCoil,
    });
    for (const name of ["emberBasin", "defaultEight", "stormkite",
      "stormkiteBrackenwheel", "stormkiteBuriedCoil"]) {
      compareScalar(`${name} authentic source session`, sourceSnapshots[name].sessionBytes,
        expectedSessions[name]);
      compare(`${name} canonical QUESTION notice`, sourceSnapshots[name].notice,
        expectedNotices[name]);
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
    const initialViewportState = await page.evaluate(() =>
      globalThis.__arenaViewportDiagnostic());
    evidence.visualDiagnostics.push({ phase: "initial-buried-coil", state: initialViewportState });
    const buriedInitialPng = await capture(page, "buried-coil-initial");

    // Restore each multi-notice canonical session into the visible trusted
    // controller. Both identities and the defensive QUESTION policy must
    // follow the restored roster, then return cleanly to the solo building.
    for (const name of ["stormkiteBrackenwheel", "stormkiteBuriedCoil"]) {
      const restored = await page.evaluate((bytes) => {
        const controller = globalThis.__frameNoticeController;
        controller.restore(bytes);
        const sessionBytes = controller.session.serialize();
        const battleSetup = JSON.parse(JSON.parse(sessionBytes).setup.battleSetup);
        const defensive = battleSetup.roster.find(({ buildingRuntime }) =>
          buildingRuntime?.class === "defensive" &&
          buildingRuntime.policy?.disposition === "question");
        const node = document.querySelector('[data-ui="policy-question"]');
        return {
          audioContinuationBytes: controller.audioContinuationBytes,
          browserBytes: controller.serialize(),
          expectedBrowserBytes: bytes,
          notice: node ? {
            cardId: node.dataset.cardId ?? null,
            ...(node.dataset.cardIds === undefined ? {} : { cardIds: node.dataset.cardIds }),
            disposition: node.dataset.disposition ?? null,
            hidden: node.hidden,
            text: node.textContent,
            unverifiedFields: node.dataset.unverifiedFields ?? null,
          } : null,
          policy: defensive ? {
            cardId: defensive.id,
            fields: Object.fromEntries(Object.entries(defensive.buildingRuntime.policy.corpusFields)
              .map(([field, record]) => [field, record.authoritative])),
          } : null,
          sessionBytes,
        };
      }, sourceSnapshots[name].browserBytes);
      compareScalar(`${name} trusted browser restore shows both card IDs`,
        restored.notice?.cardIds, expectedNotices[name].cardIds);
      recordSnapshot(`trusted browser restore to ${name}`, restored, name);
      await capture(page, `${name}-trusted-restore`);
    }
    const mixedDisclosure = page.locator(
      '[data-ui="policy-question"] details.policy-question-details',
    );
    const mixedSummary = mixedDisclosure.locator("summary");
    await mixedSummary.focus();
    assert.equal(await mixedSummary.evaluate((node) => document.activeElement === node), true,
      "the compact mixed-card summary is keyboard focusable");
    await page.keyboard.press("Enter");
    assert.equal(await mixedDisclosure.evaluate((node) => node.open), true,
      "Enter opens the native policy disclosure");
    const openDetails = await page.evaluate(() => {
      const notice = document.querySelector('[data-ui="policy-question"]');
      return globalThis.__policyNoticeDetails(notice);
    });
    compareScalar("mixed disclosure summary names both affected cards",
      openDetails?.summary, "QUESTION · Buried Coil + Stormkite · Details");
    const buriedQuestionFields = JSON.parse(
      JSON.parse(expectedSessions.stormkiteBuriedCoil).setup.battleSetup,
    ).roster.find(({ id }) => id === "buried-coil").buildingRuntime.policy.corpusFields;
    const expectedBuriedQuestion = `Buried Coil combat: QUESTION. First-hit timing is ${
      buriedQuestionFields.firstHitTicks.value === null ? "absent" : "unverified"
    }; damage, HP, deploy, range and target fields are unverified.`;
    compare("mixed disclosure preserves both complete QUESTION records",
      openDetails?.cards, [
        { cardId: "buried-coil", heading: "Buried Coil · QUESTION",
          text: expectedBuriedQuestion },
        { cardId: "stormkite", heading: "Stormkite · QUESTION",
          text: "Stormkite chain hops: QUESTION. Target choice, hop limits and timing remain unverified." },
      ]);
    const mixedOpenNoticeScreenshot = await capture(page, "mixed-policy-details-open");
    const openSnapshotBytes = await page.evaluate(() =>
      globalThis.__frameNoticeController.serialize());
    await page.evaluate((bytes) => globalThis.__frameNoticeController.restore(bytes),
      openSnapshotBytes);
    assert.equal(await mixedDisclosure.evaluate((node) => node.open), true,
      "restoring an unchanged roster preserves the disclosure state");
    await page.keyboard.press("Enter");
    assert.equal(await mixedDisclosure.evaluate((node) => node.open), false,
      "Enter closes the native policy disclosure");
    await page.locator('[data-ui="policy-question"] summary').click();
    assert.equal(await mixedDisclosure.evaluate((node) => node.open), true,
      "the summary also opens with a trusted pointer click");
    await page.locator('[data-ui="policy-question"] summary').click();
    assert.equal(await mixedDisclosure.evaluate((node) => node.open), false,
      "a second trusted pointer click closes the disclosure");
    const postInteractionViewportState = await page.evaluate(() =>
      globalThis.__arenaViewportDiagnostic());
    evidence.visualDiagnostics.push({ phase: "after-keyboard-and-pointer-disclosure", state: postInteractionViewportState });
    await mixedSummary.evaluate((node) => node.blur());
    const postBlurViewportState = await page.evaluate(() =>
      globalThis.__arenaViewportDiagnostic());
    evidence.visualDiagnostics.push({ phase: "after-disclosure-blur", state: postBlurViewportState });
    const scrollChanges = postBlurViewportState.ancestors.flatMap((ancestor, depth) => {
      const before = initialViewportState.ancestors[depth];
      return before !== undefined &&
        (before.left !== ancestor.left || before.scrollTop !== ancestor.scrollTop)
        ? [{ before, depth, after: ancestor }] : [];
    });
    const shellTranslation = initialViewportState.battleShell.left -
      postBlurViewportState.battleShell.left;
    const matchingScrollChanges = scrollChanges.filter(({ before, after }) =>
      after.left - before.left === shellTranslation && after.scrollTop === before.scrollTop);
    if (shellTranslation !== 0 && matchingScrollChanges.length === 1) {
      const [{ before, depth }] = matchingScrollChanges;
      await page.evaluate(({ depth: ancestorDepth, left, top }) => {
        let node = document.querySelector(".battle-shell");
        for (let index = 0; index < ancestorDepth; index += 1) node = node?.parentElement;
        if (!node) throw new Error("viewport scroll ancestor disappeared");
        node.scrollLeft = left;
        node.scrollTop = top;
      }, { depth, left: before.left, top: before.scrollTop });
      const afterViewportRestore = await page.evaluate(() =>
        globalThis.__arenaViewportDiagnostic());
      evidence.visualDiagnostics.push({ phase: "restored-initial-scrolled-ancestor", state: afterViewportRestore });
      assert.equal(afterViewportRestore.battleShell.left, initialViewportState.battleShell.left,
        "restoring the measured ancestor scroll returns the shell to its initial viewport position");
      assert.equal(afterViewportRestore.arena.left, initialViewportState.arena.left,
        "restoring the measured ancestor scroll returns the arena to its initial viewport position");
    }
    assert.ok(mixedOpenNoticeScreenshot.length > 0);
    const buriedAfterMixedRestores = await page.evaluate((bytes) => {
      const controller = globalThis.__frameNoticeController;
      controller.restore(bytes);
      const sessionBytes = controller.session.serialize();
      const battleSetup = JSON.parse(JSON.parse(sessionBytes).setup.battleSetup);
      const card = battleSetup.roster.find(({ id }) => id === "buried-coil");
      const node = document.querySelector('[data-ui="policy-question"]');
      return {
        audioContinuationBytes: controller.audioContinuationBytes,
        browserBytes: controller.serialize(),
        expectedBrowserBytes: bytes,
        notice: node ? { cardId: node.dataset.cardId ?? null,
          disposition: node.dataset.disposition ?? null, hidden: node.hidden,
          text: node.textContent, unverifiedFields: node.dataset.unverifiedFields ?? null }
          : null,
        policy: card ? { cardId: card.id, fields: Object.fromEntries(
          Object.entries(card.buildingRuntime.policy.corpusFields)
            .map(([field, record]) => [field, record.authoritative])) } : null,
        sessionBytes,
      };
    }, initialBuried.browserBytes);
    recordSnapshot("trusted browser restore back to solo Buried Coil", buriedAfterMixedRestores,
      "buriedCoil");
    const buriedAfterMixedRestoresPng = await capture(page, "buried-coil-after-mixed-restores");
    compareScalar("visible viewport is exact after returning from both multi-notice rosters",
      buriedAfterMixedRestoresPng.equals(buriedInitialPng), true);

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
          ...(node.dataset.cardIds === undefined
            ? {} : { cardIds: node.dataset.cardIds }),
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
    compareScalar("same-deck restart returns seed-zero Buried Coil setup bytes",
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
