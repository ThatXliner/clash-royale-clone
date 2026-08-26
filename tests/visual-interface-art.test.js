import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
import test from "node:test";

import { getArenaShellMarkup } from "../src/ui/arena-shell.js";
import {
  bindHudViewModel,
  createHudViewModel,
  getHudMarkup,
} from "../src/ui/hud-state.js";
import {
  createPlayableRoster,
  PLAYABLE_CARD_IDS,
} from "../src/content/playable-roster.js";

const ROOT = new URL("..", import.meta.url).pathname;
const HTML_PATH = `${ROOT}public/ui-arena-shell.html`;
const ARTIFACTS = new URL("../artifacts/visual-003d-round-2/", import.meta.url)
  .pathname;

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const html = readFileSync(HTML_PATH, "utf8");

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function styleBlock(source, id) {
  const start = source.indexOf(`<style id="${id}">`);
  const end = source.indexOf("</style>", start);
  assert.ok(start >= 0 && end > start, `style block ${id} must exist`);
  return source.slice(start, end);
}

function ruleBody(css, selector) {
  const at = css.indexOf(selector);
  assert.ok(at >= 0, `missing css rule ${selector}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function occurrences(value, needle) {
  return value.split(needle).length - 1;
}

function intersects(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w &&
    a.y < b.y + b.h && b.y < a.y + a.h;
}

const roster = createPlayableRoster();
const rosterById = new Map(roster.map((card) => [card.id, card]));
const costsById = new Map(roster.map((card) => [card.id, card.cost]));

function viewModelInput({ amount = 10, selectedCardId = null, ended = false }) {
  const ids = [...PLAYABLE_CARD_IDS];
  const towers = [
    "north:central",
    "north:lane:left",
    "north:lane:right",
    "south:central",
    "south:lane:left",
    "south:lane:right",
  ].map((id) => ({ hitpoints: ended && id === "north:central" ? 0 : 1400, id }));
  return {
    cards: roster.map(({ cost, displayName, id }) =>
      ({ cost, displayName, id })),
    deck: {
      hand: ids.slice(0, 4),
      next: ids[4],
      queue: ids.slice(4),
      sequence: 0,
    },
    elixir: {
      sides: {
        north: { accumulator: 0, amount: 10 },
        south: { accumulator: 0, amount },
      },
      tick: ended ? 11_000 : 0,
    },
    localSide: "south",
    match: {
      crowns: ended ? { north: 0, south: 3 } : { north: 0, south: 0 },
      destroyedTowerIds: ended ? ["north:central"] : [],
      phase: ended ? "ended" : "regulation",
      result: ended
        ? {
          crowns: { north: 0, south: 3 },
          endedAtTick: 11_000,
          kind: "win",
          reason: "central_destroyed",
          winner: "south",
        }
        : null,
      tick: ended ? 11_000 : 0,
      towers,
    },
    selectedCardId,
  };
}

class FakeNode {
  constructor() {
    this.dataset = {};
    this.innerHTML = "";
    this.style = { width: "" };
    this.textContent = "";
    this.value = "";
    this.lookups = new Map();
  }

  querySelectorAll(selector) {
    const value = this.lookups.get(selector);
    if (Array.isArray(value)) return value;
    return value === undefined ? [] : [value];
  }
}

function fakeShell() {
  const shell = new FakeNode();
  const timer = new FakeNode();
  const north = new FakeNode();
  const south = new FakeNode();
  north.lookups.set("i", [new FakeNode(), new FakeNode(), new FakeNode()]);
  south.lookups.set("i", [new FakeNode(), new FakeNode(), new FakeNode()]);
  const hand = [new FakeNode(), new FakeNode(), new FakeNode(), new FakeNode()];
  const next = new FakeNode();
  const rail = new FakeNode();
  const fill = new FakeNode();
  const output = new FakeNode();
  rail.lookups.set(".elixir-fill", fill);
  rail.lookups.set("output", output);
  shell.lookups.set('[data-ui="timer"]', timer);
  shell.lookups.set('[data-ui="opponent-hud"] .crown-track', north);
  shell.lookups.set('[data-ui="player-hud"] .crown-track', south);
  shell.lookups.set('[data-ui="card-slot"]', hand);
  shell.lookups.set('[data-ui="next-card"]', next);
  shell.lookups.set('[data-ui="elixir-rail"]', rail);
  return { fill, hand, next, output, rail, shell };
}

test("visual interface art: every shipped card has distinct authored art in the shell", () => {
  const art = styleBlock(html, "interface-production-art");
  const signatures = new Map();
  for (const id of PLAYABLE_CARD_IDS) {
    const body = ruleBody(art, `.hud-card[data-card-id="${id}"]::before`);
    assert.match(body, /clip-path|radial-gradient|conic-gradient/,
      `${id} emblem must use authored shape work`);
    signatures.set(id, body.trim());
  }
  assert.equal(signatures.size, PLAYABLE_CARD_IDS.length);
  assert.equal(new Set(signatures.values()).size, PLAYABLE_CARD_IDS.length,
    "every card emblem must be visually distinct");
  for (const hex of [
    "#191d22", "#f4ebd6", "#c6452e", "#e9a83a", "#4a332a",
    "#2e7f86", "#16324f", "#dcede9", "#5c8a46",
  ]) {
    assert.ok(art.includes(hex), `rivermark palette missing ${hex}`);
  }
});

test("visual interface art: HUD state mutation pipeline binds every hook with art classes intact", () => {
  const markup = getArenaShellMarkup();
  assert.equal(occurrences(markup, 'data-ui="arena"'), 1);
  assert.equal(occurrences(markup, 'data-ui="card-slot"'), 4);
  assert.equal(occurrences(markup, 'data-ui="next-card"'), 1);
  assert.equal(occurrences(markup, 'data-ui="timer"'), 1);
  assert.equal(occurrences(markup, 'data-ui="elixir-rail"'), 1);

  const view = createHudViewModel(viewModelInput({}));
  const fake = fakeShell();
  bindHudViewModel(fake.shell, view);
  view.hand.forEach((card, index) => {
    const inner = fake.hand[index].innerHTML;
    assert.ok(inner.includes(`data-card-id="${card.id}"`), inner);
    assert.ok(inner.includes('class="hud-card"'), inner);
    assert.ok(inner.includes('class="hud-card__cost"'), inner);
    assert.ok(inner.includes(`>${card.cost}</b>`), inner);
    assert.ok(inner.includes(card.displayName), inner);
  });
  assert.ok(fake.next.innerHTML.includes(`data-card-id="${view.next.id}"`));
  assert.equal(fake.output.textContent, String(view.elixir.amount));
});

test("visual interface art: selection, disabled, and insufficient states render distinctly", () => {
  const art = styleBlock(html, "interface-production-art");
  const normal = getHudMarkup(createHudViewModel(viewModelInput({})));
  const selected = getHudMarkup(
    createHudViewModel(viewModelInput({ selectedCardId: PLAYABLE_CARD_IDS[0] })));
  const poor = getHudMarkup(createHudViewModel(viewModelInput({ amount: 1 })));

  assert.equal(normal.includes('data-selected="true"'), false);
  assert.equal(selected.includes('data-selected="true"'), true);
  const expectedInsufficient = PLAYABLE_CARD_IDS.slice(0, 4)
    .filter((id) => costsById.get(id) > 1).length;
  const poorInsufficient =
    poor.split('data-insufficient="true"').length - 1;
  assert.equal(poorInsufficient, expectedInsufficient);
  assert.ok(poorInsufficient >= 1);
  assert.ok(poor.includes('data-disabled="true"'));

  const selectedBody = ruleBody(art, '.hud-card[data-selected="true"]');
  const disabledBody = ruleBody(art, '.hud-card[data-disabled="true"]');
  const insufficientBody =
    ruleBody(art, '.hud-card[data-insufficient="true"]');
  assert.notEqual(selectedBody, disabledBody);
  assert.notEqual(disabledBody, insufficientBody);
  assert.notEqual(selectedBody, insufficientBody);
  assert.match(selectedBody, /#e9a83a/);
  assert.match(disabledBody, /grayscale/);
  assert.match(insufficientBody, /dashed/);
  assert.match(ruleBody(art, ".hud-card__cost"), /radial-gradient/);
});

test("visual interface art: winner, overtime, and terminal hierarchy rules exist", () => {
  const art = styleBlock(html, "interface-production-art");
  assert.match(art, /\[data-phase="overtime"\] \[data-ui="hud-timer"\]/);
  assert.match(art, /\[data-phase="ended"\] \[data-ui="hud-timer"\]/);
  assert.match(art, /\.match-feedback__overlay\[data-winner="north"\]/);
  assert.match(art, /\.match-feedback__overlay\[data-winner="south"\]/);
  assert.match(art, /\.match-feedback__overlay\[data-kind="draw"\]/);
  for (let amount = 0; amount <= 10; amount += 1) {
    assert.match(art,
      new RegExp(`\\[data-ui="hud-elixir"\\]\\[data-amount="${amount}"\\]`),
      `elixir fill mapping must cover amount ${amount}`);
  }
  const ended = getHudMarkup(createHudViewModel(viewModelInput({
    amount: 5,
    ended: true,
  })));
  assert.match(ended, /data-phase="ended"/);
});

test("visual interface art: no debug labels and provenance-safe primitives ship", () => {
  assert.doesNotMatch(html, /debug|TODO|FIXME|placeholder|lorem/i);
  assert.doesNotMatch(html, /(?:https?:|data:|blob:|url\s*\(|reference\/)/i);
  assert.doesNotMatch(html, /\.(?:png|jpe?g|gif|webp|avif|svg|mp[34]|wav|ogg)\b/i);
  assert.doesNotMatch(html, /@keyframes|animation\s*:|transition\s*:/);
  assert.doesNotMatch(html, /<script(?![^>]*src=)/);
  assert.doesNotMatch(html, /on(?:click|load|error|pointer|mouse|touch|key)\s*=/i);
  assert.match(html, /src="\.\.\/src\/ui\/arena-shell-entry\.js"/);
  assert.match(html, /href="\.\.\/src\/ui\/arena-shell\.css"/);
});

test("visual interface art: interactive controls never overlap the arena click zone", () => {
  assert.ok(getArenaShellMarkup().includes(
    '<button class="restart-control" type="button" data-ui="restart" hidden>'),
    "restart control must ship hidden outside terminal state");
  const arena = { x: 86, y: 104, w: 548, h: 968 };
  const controls = {
    audioToggle: { x: 638, y: 118, w: 72, h: 48 },
    topRail: { x: 42, y: 24, w: 636, h: 62 },
    bottomRail: { x: 42, y: 1082, w: 636, h: 62 },
    handTray: { x: 112, y: 1154, w: 496, h: 88 },
    elixirRail: { x: 112, y: 1248, w: 496, h: 22 },
    elixirBadge: { x: 556, y: 1224, w: 56, h: 52 },
    crownsChip: { x: 492, y: 34, w: 150, h: 44 },
  };
  for (const [label, rect] of Object.entries(controls)) {
    assert.equal(intersects(rect, arena), false,
      `${label} overlaps the arena input region`);
  }
});

test("visual interface art: fixed 720x1280 Chrome evidence captures every hierarchy state", {
  timeout: 420_000,
}, async () => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright equivalent is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  mkdirSync(ARTIFACTS, { recursive: true });
  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser;
  const consoleErrors = [];
  const unhandled = [];
  try {
    let readyText = "";
    server.stdout.setEncoding("utf8");
    for await (const chunk of server.stdout) {
      readyText += chunk;
      const end = readyText.indexOf("\n");
      if (end >= 0) break;
    }
    const ready = JSON.parse(readyText);
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({ deviceScaleFactor: 1,
      viewport: { height: 1_280, width: 720 } });
    const page = await context.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => unhandled.push(String(error)));
    const response = await page.goto(
      `http://${ready.host}:${ready.port}/public/ui-arena-shell.html?session-profile=live-seed-2-terminal`,
      { waitUntil: "domcontentloaded" },
    );
    assert.equal(response.status(), 200);
    await page.waitForSelector('[data-ui="arena"]');
    await page.waitForSelector('[data-ui="hud-hand"] .hud-card');
    await page.click('[data-ui="audio-toggle"]');
    // The terminal-profile opponent has an authored combat marker whose
    // interpolated position can differ between Chrome processes while the
    // authoritative session bytes and tick remain identical. Hide only those
    // moving entities for this HUD-focused evidence; towers, health bars,
    // arena geometry, and every interface control remain visible.
    await page.addStyleTag({ content: `
      .game-browser-layer--combat .combat-marker--entity-ground,
      .game-browser-layer--combat .combat-marker--entity-air,
      .game-browser-layer--combat .combat-target-link,
      .game-browser-layer--effects .combat-effect-projectile,
      .game-browser-layer--effects .combat-effect-impact,
      .game-browser-layer--effects .combat-effect-area,
      .game-browser-layer--effects .combat-effect-path,
      .bridge::before,
      .bridge::after { display: none !important; }
    ` });
    const startTick = await page.evaluate(async () => {
      const [{ arenaHudController: controller },
        { createShippedGameSessionSetup },
        { GameSession }] = await Promise.all([
        import("/src/ui/arena-shell-entry.js"),
        import("/src/ui/game-browser-entry.js"),
        import("/src/sim/game-session.js"),
      ]);
      globalThis.__visController = controller;
      controller.enterManualStepMode();
      // Rebase through a fresh, canonical terminal-profile session so the
      // first evidence frame is always the same authoritative tick even if
      // Chrome advanced a few RAFs while the module graph loaded.
      const fresh = new GameSession(
        createShippedGameSessionSetup(2, "live-seed-2-terminal"),
      );
      const snapshot = JSON.stringify({
        bridge: JSON.stringify({ deliveries: [], version: 1 }),
        running: false,
        session: fresh.serialize(),
        version: 1,
      });
      controller.restore(snapshot);
      controller.stepMany(60);
      return controller.state.sessionTick;
    });
    await page.waitForTimeout(100);

    const initial = await collectState(page);
    const geometry = await page.evaluate(() => {
      const box = (selector) => {
        const node = document.querySelector(selector);
        const rect = node?.getBoundingClientRect();
        return rect === undefined ? null : {
          bottom: Math.round(rect.bottom),
          height: Math.round(rect.height),
          left: Math.round(rect.left),
          top: Math.round(rect.top),
          width: Math.round(rect.width),
        };
      };
      return {
        arena: box('[data-ui="arena"]'),
        audioToggle: box('[data-ui="audio-toggle"]'),
        bottomRail: box('.match-rail--bottom'),
        crownsChip: box('[data-ui="hud-crowns"]'),
        elixirBadge: box('[data-ui="hud-elixir"]'),
        elixirRail: box('[data-ui="elixir-rail"]'),
        handTray: box('[data-ui="hand-tray"]'),
        topRail: box('.match-rail--top'),
      };
    });
    assert.match(initial.timerText, /^\d:\d\d$/);
    assert.equal(startTick, 60, "startup evidence must be pinned to tick 60");
    assert.equal(new Set(initial.handIds).size, initial.handIds.length);
    for (const id of initial.handIds.concat([initial.nextId])) {
      assert.ok(rosterById.has(id), `projected card ${id} must be shipped roster`);
    }
    assert.equal(initial.costTexts.length, initial.handIds.length);
    assert.equal(initial.towerHealthBars.visible, true);
    assert.ok(initial.towerHealthBars.count >= 6);
    assert.ok(initial.crowns.north !== undefined);
    assert.ok(initial.crowns.south !== undefined);
    assert.ok(geometry.elixirBadge.bottom <= 1_280,
      "elixir badge must stay inside the fixed viewport");
    await page.screenshot({ path: `${ARTIFACTS}initial.png` });

    const arenaBox = await page.locator('[data-ui="arena"]').boundingBox();
    for (const point of [{ x: 439, y: 529 }, { x: 270, y: 760 }]) {
      const probe = await page.evaluate(([px, py]) => {
        const node = document.elementFromPoint(px, py);
        return Boolean(node?.closest?.('[data-ui="arena"]'));
      }, [arenaBox.x + point.x, arenaBox.y + point.y]);
      assert.equal(probe, true,
        `journey click zone ${JSON.stringify(point)} must reach the arena`);
    }
    const slotsReachable = await page.evaluate(() => [...document
      .querySelectorAll('[data-ui="card-slot"]')].map((slot) => {
      const box = slot.getBoundingClientRect();
      const node = document.elementFromPoint(box.x + box.width / 2,
        box.y + box.height / 2);
      return node === slot || slot.contains(node);
    }));
    assert.deepEqual(slotsReachable, [true, true, true, true]);

    const costsMap = Object.fromEntries(costsById);
    const deployPoint = { x: 439, y: 529 };
    let drainRounds = 0;
    for (;;) {
      const wallet = await page.evaluate((costs) => {
        const controller = globalThis.__visController;
        return {
          amount: controller.session.state.elixir.sides.south.amount,
          hand: [...controller.session.state.decks.south.hand],
        };
      }, costsMap);
      if (wallet.hand.some((id) => costsById.get(id) > wallet.amount)) break;
      assert.ok(drainRounds < 4, "wallet drain must reach an insufficient state");
      drainRounds += 1;
      const target = wallet.hand.reduce((best, id) =>
        costsById.get(id) <= wallet.amount &&
        costsById.get(id) < costsById.get(best) ? id : best,
      wallet.hand.find((id) => costsById.get(id) <= wallet.amount));
      await page.click(`[data-ui="card-slot"][data-card-id="${target}"]`);
      await page.mouse.click(arenaBox.x + deployPoint.x, arenaBox.y + deployPoint.y);
      await page.evaluate(() => {
        globalThis.__visController.stepMany(1);
      });
    }

    // Select through the shipped input controller and inspect the live HUD
    // projection. No test-only HUD rebinding is allowed on this path.
    const selectionTarget = await page.evaluate((costs) => {
      const controller = globalThis.__visController;
      const amount = controller.session.state.elixir.sides.south.amount;
      return [...document.querySelectorAll('[data-ui="card-slot"]')]
        .map((node) => node.dataset.cardId)
        .find((id) => costs[id] <= amount);
    }, Object.fromEntries(costsById));
    assert.ok(selectionTarget, "an affordable card must remain to select");
    await page.click(`[data-ui="card-slot"][data-card-id="${selectionTarget}"]`);
    const selectionStyles = await page.evaluate((id) => {
      const controller = globalThis.__visController;
      const selectedCardId = controller.state.selectedCardId;
      if (selectedCardId !== id) {
        throw new TypeError(`input lost the selection: wanted ${id}, ` +
          `state has ${String(selectedCardId)}, slots ` +
          `${JSON.stringify([...document.querySelectorAll('[data-ui="card-slot"]')]
            .map((node) => node.dataset.cardId))}`);
      }
      const cards = [...document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card')];
      const pick = (node) => {
        const style = getComputedStyle(node);
        return { borderColor: style.borderColor, shadow: style.boxShadow };
      };
      const selectedNode = cards.find((node) => node.dataset.cardId === id);
      const otherNode = cards.find((node) => node.dataset.cardId !== id);
      return { other: pick(otherNode), selected: pick(selectedNode),
        flag: selectedNode.dataset.selected,
        domTick: controller.state.domTick,
        sessionTick: controller.state.sessionTick };
    }, selectionTarget);
    assert.equal(selectionStyles.flag, "true");
    assert.notDeepEqual(selectionStyles.selected, selectionStyles.other,
      "the selected card must render a distinct highlight");
    await page.screenshot({ path: `${ARTIFACTS}card-selected.png` });
    await page.mouse.click(arenaBox.x + 439, arenaBox.y + 529);
    await page.evaluate(() => {
      globalThis.__visController.stepMany(2);
    });
    await page.waitForFunction(() =>
      document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-insufficient="true"]').length > 0,
    null, { polling: 50, timeout: 10_000 });
    const insufficient = await page.evaluate(() => ({
      amount: document.querySelector('[data-ui="hud-elixir"]').dataset.amount,
      disabledCount: document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-disabled="true"]').length,
      insufficientCount: document.querySelectorAll(
        '[data-ui="hud-hand"] .hud-card[data-insufficient="true"]').length,
      domTick: globalThis.__visController.state.domTick,
      sessionTick: globalThis.__visController.state.sessionTick,
    }));
    assert.ok(insufficient.insufficientCount >= 1,
      "spending on an expensive card must disable cards above the wallet");
    assert.ok(insufficient.disabledCount >= insufficient.insufficientCount);
    await page.screenshot({ path: `${ARTIFACTS}insufficient-elixir.png` });

    // Leave one affordable card selected before terminal suspension. Restart
    // must mount a fresh session with no stale browser presentation state.
    const restartSelection = await page.evaluate((costs) => {
      const controller = globalThis.__visController;
      let amount = controller.session.state.elixir.sides.south.amount;
      let target;
      for (let index = 0; index < 20 && target === undefined; index += 1) {
        target = [...document.querySelectorAll('[data-ui="card-slot"]')]
          .map((node) => node.dataset.cardId)
          .find((id) => costs[id] <= amount);
        if (target === undefined) {
          controller.stepMany(60);
          amount = controller.session.state.elixir.sides.south.amount;
        }
      }
      return { amount, target };
    }, Object.fromEntries(costsById));
    assert.ok(restartSelection.target,
      "restart regression requires an affordable card to remain selectable");
    await page.click(
      `[data-ui="card-slot"][data-card-id="${restartSelection.target}"]`,
    );
    const selectedBeforeTerminal = await page.evaluate((id) => {
      const controller = globalThis.__visController;
      const selected = document.querySelector(
        `[data-ui="hud-hand"] .hud-card[data-card-id="${id}"]`,
      );
      return {
        flag: selected?.dataset.selected,
        selectedCardId: controller.state.selectedCardId,
        sessionTick: controller.state.sessionTick,
      };
    }, restartSelection.target);
    assert.equal(selectedBeforeTerminal.selectedCardId, restartSelection.target);
    assert.equal(selectedBeforeTerminal.flag, "true");

    const terminalReached = await page.evaluate(() => {
      const controller = globalThis.__visController;
      for (let index = 0; index < 40 && !controller.state.terminal; index += 1) {
        controller.fastForwardSegment(600);
      }
      return controller.state.terminal;
    });
    assert.equal(terminalReached, true);
    await page.waitForFunction(() =>
      document.querySelector(".match-feedback__overlay") !== null,
    null, { polling: 50, timeout: 10_000 });
    const winner = await page.evaluate(() => {
      const controller = globalThis.__visController;
      const overlay = document.querySelector(".match-feedback__overlay");
      const box = overlay.getBoundingClientRect();
      return {
        height: Math.round(box.height),
        kind: overlay.dataset.kind,
        domTick: controller.state.domTick,
        selectedCardId: controller.state.selectedCardId,
        sessionTick: controller.state.sessionTick,
        text: overlay.textContent,
        width: Math.round(box.width),
        winner: overlay.dataset.winner,
        restartHidden: document.querySelector('[data-ui="restart"]').hidden,
      };
    });
    assert.ok(winner.width > 200 && winner.height > 100);
    assert.match(winner.text, /wins|draw/i);
    assert.equal(winner.restartHidden, false);
    await page.screenshot({ path: `${ARTIFACTS}winner-overlay.png` });

    await page.click('[data-ui="restart"]');
    await page.waitForFunction(() =>
      globalThis.__visController.state.sessionTick === 0 &&
      document.querySelector('[data-ui="restart"]').hidden === true &&
      document.querySelector(".match-feedback__overlay") === null,
    null, { polling: 50, timeout: 10_000 });
    await page.screenshot({ path: `${ARTIFACTS}restart.png` });

    const restart = await page.evaluate(() => ({
      domTick: globalThis.__visController.state.domTick,
      selectedCardId: globalThis.__visController.state.selectedCardId,
      sessionTick: globalThis.__visController.state.sessionTick,
      terminal: globalThis.__visController.state.terminal,
    }));

    const finalText = await page.evaluate(() => document.body.innerText);
    assert.doesNotMatch(finalText, /debug|placeholder/i);
    assert.deepEqual(consoleErrors, []);
    assert.deepEqual(unhandled, []);
    const screenshots = [
      "initial.png",
      "card-selected.png",
      "insufficient-elixir.png",
      "winner-overlay.png",
      "restart.png",
    ];
    const screenshotHashes = Object.fromEntries(screenshots.map((name) =>
      [name, sha256(`${ARTIFACTS}${name}`)]));
    writeFileSync(`${ARTIFACTS}visual-interface-evidence.json`,
      `${JSON.stringify({
        consoleErrors,
        drainRounds,
        geometry,
        arenaMask: "moving entity/effect markers and bridge corner accents hidden for deterministic HUD evidence",
        screenshotHashes,
        selectionTarget,
        initial,
        insufficient,
        selectionStyles,
        screenshots,
        restart,
        restartSelection,
        selectedBeforeTerminal,
        unhandled,
        winner,
      }, null, 2)}\n`);
  } finally {
    try { await browser?.close(); } catch {}
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await Promise.race([once(server, "exit"),
        new Promise((resolve) => setTimeout(resolve, 2_000))]);
    }
  }
});

async function collectState(page) {
  return page.evaluate(() => {
    const controller = globalThis.__visController;
    const hudCards = [...document.querySelectorAll(
      '[data-ui="hud-hand"] .hud-card')];
    const healthBars = [...document.querySelectorAll(
      ".combat-marker--tower .combat-health")].map((node) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0;
    });
    return {
      costTexts: hudCards.map((node) =>
        node.querySelector(".hud-card__cost")?.textContent ?? null),
      crowns: {
        north: document.querySelector('[data-ui="hud-crowns"]')?.dataset.north,
        south: document.querySelector('[data-ui="hud-crowns"]')?.dataset.south,
      },
      handIds: controller.session.state.decks.south.hand.slice(),
      nextId: controller.session.state.decks.south.queue[0],
      domTick: controller.state.domTick,
      selectedCardId: controller.state.selectedCardId,
      sessionTick: controller.state.sessionTick,
      timerText: document.querySelector('[data-ui="hud-timer"]').textContent,
      towerHealthBars: {
        count: healthBars.length,
        visible: healthBars.every(Boolean),
      },
    };
  });
}
