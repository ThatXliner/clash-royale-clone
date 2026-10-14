import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { spawn } from "node:child_process";
import test from "node:test";
import { parseFrameScale } from "./frame-layout-evidence.mjs";

import { buildRelease } from "file:///private/tmp/cards021i-095-final/scripts/build-release.js";
import { createEditableGameSessionSetup } from "file:///private/tmp/cards021i-095-final/src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "file:///private/tmp/cards021i-095-final/src/content/playable-roster.js";

const execFileAsync = promisify(execFile);
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.CARDS021_BROWSER_ARTIFACTS ??
  new URL("../artifacts/cards021-integration-round1/builder/", import.meta.url).pathname;
const ARENA_MODULE = "src/ui/arena-shell-entry.js";
const DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "buried-coil",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);
const VIEWPORTS = Object.freeze([
  Object.freeze({ label: "phone", width: 390, height: 844 }),
  Object.freeze({ label: "desktop", width: 1440, height: 933 }),
]);
const MOTIONS = Object.freeze([
  Object.freeze({ label: "normal", value: "no-preference" }),
  Object.freeze({ label: "reduced", value: "reduce" }),
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
  throw new Error("Cards021 browser server stopped before readiness");
}

async function settlePaint(page) {
  await page.evaluate(() => new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  }));
  await page.waitForTimeout(120);
}

let frame;
let frameLocator;

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

async function readMatchEvidence(frame, moduleUrl) {
  return frame.evaluate(async (entryUrl) => {
    const { arenaHudController } = await import(entryUrl);
    const controller = arenaHudController;
    const state = controller.session.state;
    const browserBytes = controller.serialize();
    const browser = JSON.parse(browserBytes);
    const structureIds = new Set(state.battle.structures
      .filter(({ cardId }) => cardId === "buried-coil").map(({ id }) => id));
    const attacks = controller.session.replay.filter(({ buildingId, type }) =>
      type === "structure-attack" && structureIds.has(buildingId)).map((attack) => {
      const target = state.battle.units.find(({ id }) => id === attack.targetId);
      return {
        amount: attack.amount,
        buildingId: attack.buildingId,
        side: attack.side,
        targetCardId: target?.cardId ?? null,
        targetId: attack.targetId,
        targetLayer: target?.layer ?? null,
        tick: attack.tick,
      };
    });
    const structures = state.battle.structures.filter(({ cardId }) => cardId === "buried-coil")
      .map(({ alive, cardId, deathCause, hidden, hitpoints, id, maxHitpoints, side, targetable }) => ({
        alive, cardId, deathCause, hidden, hitpoints, id, maxHitpoints, side, targetable,
      }));
    const layer = (name) => document.querySelector(
      `[data-game-browser-layer="${name}"]`,
    )?.innerHTML ?? null;
    const audio = controller.audioDiagnostics;
    return {
      audio: {
        bytes: controller.audioContinuationBytes,
        cursor: audio.cursor,
        eventCount: audio.eventCount,
        gainBasisPoints: controller.audio.gainBasisPoints,
        muted: controller.audio.muted,
        pcm: controller.audioScheduledPcm.map(({ cueId, sequence, sourceType }) =>
          ({ cueId, sequence, sourceType })),
        sessionTick: audio.sessionTick,
        terminal: audio.terminal,
      },
      bridge: browser.bridge,
      browserBytes,
      dom: {
        combat: layer("combat"),
        effects: layer("effects"),
        feedback: layer("feedback"),
        hud: layer("hud"),
      },
      questionNotice: (() => {
        const node = document.querySelector('[data-ui="policy-question"]');
        return node === null ? null : {
          cardId: node.dataset.cardId ?? null,
          display: getComputedStyle(node).display,
          hidden: node.hidden,
          text: node.textContent,
        };
      })(),
      visualLayout: (() => {
        const rect = (selector) => {
          const node = document.querySelector(selector);
          if (node === null) return null;
          const box = node.getBoundingClientRect();
          return [box.x, box.y, box.width, box.height];
        };
        return { arena: rect('[data-ui="arena"]'), shell: rect('[data-ui="arena-shell"]') };
      })(),
      elixir: { north: state.elixir.sides.north.amount, south: state.elixir.sides.south.amount },
      hand: [...state.decks.south.hand],
      projectiles: state.battle.projectiles.map(({ identity, position, targetId }) => ({
        identity, position, targetId,
      })),
      deploymentEvents: controller.session.replay.filter(({ type }) =>
        type === "session-deployed" || type === "session-structure-deployed"),
      replayLength: controller.session.replay.length,
      pendingPlayerCommands: state.pendingPlayerCommands,
      paused: state.paused,
      sequence: { north: state.decks.north.sequence, south: state.decks.south.sequence },
      sessionBytes: controller.session.serialize(),
      setup: JSON.parse(controller.session.serialize()).setup,
      structures,
      structureAttacks: attacks,
      tick: state.tick,
      terminal: state.terminal,
      units: state.battle.units.map(({ alive, cardId, hitpoints, id, layer, side }) => ({
        alive, cardId, hitpoints, id, layer, side,
      })),
    };
  }, moduleUrl);
}

async function waitForMatch(frame, moduleUrl, match, description, timeout = 45_000) {
  await frame.waitForFunction(async ({ entryUrl, condition }) => {
    const { arenaHudController } = await import(entryUrl);
    const controller = arenaHudController;
    const state = controller.session.state;
    const replay = controller.session.replay;
    const structures = state.battle.structures;
    const projectiles = state.battle.projectiles;
    const units = state.battle.units;
    switch (condition.kind) {
      case "deployment":
        return replay.some((event) => event.side === condition.side && (
          (event.type === "session-deployed" && event.deployment?.cardId === condition.cardId) ||
          (event.type === "session-structure-deployed" &&
            event.materialization?.cardId === condition.cardId)
        ));
      case "both-hidden-coils":
        return ["north", "south"].every((side) => structures.some((structure) =>
          structure.cardId === "buried-coil" && structure.side === side &&
          structure.alive && structure.hidden
        ));
      case "hand-card":
        return state.decks.south.hand.includes(condition.cardId) &&
          state.elixir.sides.south.amount >= condition.minimumElixir;
      case "revealed-coil":
        return structures.some((structure) => structure.cardId === "buried-coil" &&
          structure.alive && !structure.hidden);
      case "structure-attack": {
        const coilIds = new Set(structures.filter((structure) =>
          structure.cardId === "buried-coil").map((structure) => structure.id));
        return replay.some((event) => event.type === "structure-attack" &&
          coilIds.has(event.buildingId) && units.some((unit) =>
            unit.id === event.targetId && unit.layer === condition.layer));
      }
      case "projectile":
        return projectiles.length > 0;
      case "hidden-coil":
        return structures.some((structure) => structure.cardId === "buried-coil" &&
          structure.alive && structure.hidden);
      default:
        throw new Error(`unknown Cards021 browser condition: ${condition.kind}`);
    }
  }, { entryUrl: moduleUrl, condition: match }, { timeout, polling: "raf" })
    .catch((error) => { throw new Error(`timed out waiting for ${description}: ${error.message}`); });
}

async function advanceUntilMatch(frame, moduleUrl, match, description, maxTicks) {
  const result = await frame.evaluate(async ({ entryUrl, condition, limit }) => {
    const { arenaHudController: controller } = await import(entryUrl);
    const matches = () => {
      const state = controller.session.state;
      const replay = controller.session.replay;
      const structures = state.battle.structures;
      const projectiles = state.battle.projectiles;
      const units = state.battle.units;
      switch (condition.kind) {
        case "deployment":
          return replay.some((event) => event.side === condition.side && (
            (event.type === "session-deployed" && event.deployment?.cardId === condition.cardId) ||
            (event.type === "session-structure-deployed" &&
              event.materialization?.cardId === condition.cardId)
          ));
        case "hand-card":
          return state.decks.south.hand.includes(condition.cardId) &&
            state.elixir.sides.south.amount >= condition.minimumElixir;
        case "revealed-coil":
          return structures.some((structure) => structure.cardId === "buried-coil" &&
            (condition.side === undefined || structure.side === condition.side) &&
            structure.alive && !structure.hidden);
        case "structure-attack": {
          const coilIds = new Set(structures.filter((structure) =>
            structure.cardId === "buried-coil").map((structure) => structure.id));
          return replay.some((event) => event.type === "structure-attack" &&
            coilIds.has(event.buildingId) && units.some((unit) =>
              unit.id === event.targetId && unit.layer === condition.layer));
        }
        case "projectile":
          return projectiles.length > 0;
        case "hidden-coil":
          return structures.some((structure) => structure.cardId === "buried-coil" &&
            (condition.side === undefined || structure.side === condition.side) &&
            structure.alive && structure.hidden);
        case "terminal":
          return state.terminal;
        default:
          throw new Error(`unknown Cards021 step condition: ${condition.kind}`);
      }
    };
    let steps = 0;
    while (!matches() && steps < limit && !controller.session.state.terminal) {
      const batch = condition.kind === "terminal" ? Math.min(30, limit - steps) : 1;
      controller.stepMany(batch);
      steps += batch;
    }
    return { matched: matches(), steps, terminal: controller.session.state.terminal,
      tick: controller.session.state.tick };
  }, { entryUrl: moduleUrl, condition: match, limit: maxTicks });
  assert.ok(result.matched,
    `${description} did not occur within ${maxTicks} canonical ticks; result=${JSON.stringify(result)}`);
  return result;
}

async function exactTeamColorPixelsInViewport(screenshotPath, color, bounds) {
  const script = [
    "import json, math, sys",
    "from PIL import Image",
    "image = Image.open(sys.argv[1]).convert('RGBA')",
    "target = tuple(int(part) for part in sys.argv[2].split(',')) + (255,)",
    "bounds = json.loads(sys.argv[3])",
    "left = max(0, math.floor(bounds['x']))",
    "top = max(0, math.floor(bounds['y']))",
    "right = min(image.width, math.ceil(bounds['x'] + bounds['width']))",
    "bottom = min(image.height, math.ceil(bounds['y'] + bounds['height']))",
    "crop = image.crop((left, top, right, bottom))",
    "count = sum(1 for pixel in crop.getdata() if pixel == target)",
    "print(json.dumps({'color': target[:3], 'count': count, 'crop': [left, top, right, bottom], 'size': crop.size}))",
  ].join("\n");
  const { stdout } = await execFileAsync("python3", ["-c", script, screenshotPath, color,
    JSON.stringify(bounds)]);
  return JSON.parse(stdout.trim());
}

async function inspectBuriedCoilTeamPlate(marker, moduleUrl) {
  return marker.evaluate(async (node, entryUrl) => {
    const { arenaHudController: controller } = await import(entryUrl);
    const id = Number(node.dataset.combatId);
    const structure = controller.session.state.battle.structures.find(({ id: candidate }) =>
      candidate === id);
    const art = node.querySelector(".combat-art");
    const image = art?.querySelector("image");
    const plate = art?.querySelector("[data-team-color]");
    const healthBar = node.querySelector(".combat-health");
    const rect = (element) => {
      if (!element) return null;
      const box = element.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height };
    };
    const ancestors = [];
    for (let element = node; element; element = element.parentElement) {
      const style = getComputedStyle(element);
      ancestors.push({
        className: typeof element.className === "string"
          ? element.className : element.className?.baseVal ?? "",
        display: style.display,
        filter: style.filter,
        mixBlendMode: style.mixBlendMode,
        opacity: style.opacity,
        tagName: element.tagName.toLowerCase(),
        transform: style.transform,
        visibility: style.visibility,
        rect: rect(element),
      });
    }
    const feed = controller.session.projectionSnapshot().combatEffectFeed;
    const relatedEffects = feed.records.filter(({ payload }) =>
      payload?.sourceId === id || payload?.targetId === id || payload?.buildingId === id)
      .map(({ eventId, phase, payload, tick, type }) => ({ eventId, phase, payload, tick, type }));
    return {
      alive: structure?.alive ?? null,
      ancestors,
      art: art ? {
        children: Array.from(art.children, (child) => ({
          fill: child.getAttribute("fill"),
          href: child.getAttribute("href"),
          tagName: child.tagName.toLowerCase(),
        })),
        dataset: { ...art.dataset },
        rect: rect(art),
        viewBox: art.getAttribute("viewBox"),
      } : null,
      domState: {
        combatId: node.dataset.combatId,
        destroyed: node.dataset.destroyed ?? null,
        hidden: node.dataset.hidden ?? null,
        hit: node.dataset.hit ?? null,
        kind: node.dataset.kind,
        pose: node.dataset.pose ?? null,
        reaction: node.dataset.reaction,
        side: node.dataset.side,
        targeting: node.dataset.targeting ?? null,
      },
      effects: relatedEffects,
      form: structure?.hidden === true ? "hidden" : "revealed",
      image: image ? { href: image.getAttribute("href"), rect: rect(image) } : null,
      hitpoints: structure?.hitpoints ?? null,
      healthBar: healthBar ? {
        background: getComputedStyle(healthBar).backgroundColor,
        rect: rect(healthBar),
      } : null,
      maxHitpoints: structure?.maxHitpoints ?? null,
      plate: plate ? {
        attributes: {
          fill: plate.getAttribute("fill"),
          teamColor: plate.dataset.teamColor ?? null,
        },
        computedFill: getComputedStyle(plate).fill,
        rect: rect(plate),
      } : null,
      side: structure?.side ?? null,
      targetable: structure?.targetable ?? null,
      tick: controller.session.state.tick,
    };
  }, moduleUrl);
}

test("Cards021 Buried Coil collection and arena use the authentic seed-zero eight-card journey", {
  timeout: 900_000,
}, async (t) => {
  assert.ok(existsSync(PLAYWRIGHT), "installed Playwright is required");
  assert.ok(existsSync(CHROME), "installed Chrome is required");
  assert.deepEqual(PLAYABLE_CARD_IDS, [
    "coilblade", "mossguard", "copperskiff", "skymaul",
    "brassbolt", "reedsting", "briar-band", "cinderlings",
  ], "the original default eight-card order stays byte-for-byte mapped");
  await mkdir(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "cards021-browser-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const releaseManifest = JSON.parse(await readFile(join(releaseRoot, "release-manifest.json"), "utf8"));
  const server = spawn(process.execPath, [
    "/private/tmp/cards021i-095-final/tests/game-browser-journey-server.js",
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
  await page.addInitScript(() => {
    if (location.pathname !== "/public/index.html") return;
    const trace = [];
    const phase = { value: "document-start" };
    const nativeRect = Element.prototype.getBoundingClientRect;
    const round = (value) => Number.isFinite(value) ? Number(value.toFixed(3)) : value;
    const rect = (node) => {
      if (!node) return null;
      const value = nativeRect.call(node);
      return { x: round(value.x), y: round(value.y), width: round(value.width),
        height: round(value.height), right: round(value.right), bottom: round(value.bottom) };
    };
    const style = (node) => {
      if (!node || !(node instanceof Element)) return null;
      const value = getComputedStyle(node);
      return Object.fromEntries([
        "display", "position", "boxSizing", "width", "height", "minWidth", "minHeight",
        "maxWidth", "maxHeight", "paddingLeft", "paddingRight", "paddingTop", "paddingBottom",
        "marginLeft", "marginRight", "flex", "flexBasis", "flexGrow", "flexShrink",
        "alignSelf", "overflowX", "overflowY", "transform", "contain", "zoom",
        "transitionProperty", "transitionDuration", "transitionDelay", "animationName",
      ].map((key) => [key, value[key]]));
    };
    const describe = (node, knownRect = null) => ({
      tag: node.tagName,
      className: typeof node.className === "string" ? node.className : "",
      attributes: Object.fromEntries(["data-view-active", "data-app-view", "hidden", "style"]
        .filter((name) => node.hasAttribute(name)).map((name) => [name, node.getAttribute(name)])),
      rect: knownRect ?? rect(node),
      style: style(node),
      offset: { width: node.offsetWidth, height: node.offsetHeight,
        clientWidth: node.clientWidth, clientHeight: node.clientHeight },
    });
    const snapshot = (kind, details = {}) => {
      const slot = document.querySelector("[data-battle-frame-slot]");
      const iframe = slot?.querySelector("iframe") ?? null;
      const ancestors = [];
      for (let node = slot, count = 0; node && count < 10; node = node.parentElement, count += 1) {
        ancestors.push(describe(node, node === slot ? details.returnedSlot ?? null : null));
      }
      const child = iframe?.contentWindow;
      return {
        kind,
        at: round(performance.now()),
        phase: phase.value,
        viewport: { innerWidth, innerHeight, devicePixelRatio,
          visual: visualViewport ? { width: round(visualViewport.width), height: round(visualViewport.height),
            scale: round(visualViewport.scale), offsetLeft: round(visualViewport.offsetLeft),
            offsetTop: round(visualViewport.offsetTop) } : null,
          media760: matchMedia("(max-width: 760px)").matches,
          media390: matchMedia("(max-width: 390px)").matches },
        details,
        slot: slot ? describe(slot, details.returnedSlot ?? null) : null,
        iframe: iframe ? {
          rect: rect(iframe),
          inline: { left: iframe.style.left, top: iframe.style.top,
            width: iframe.style.width, height: iframe.style.height, transform: iframe.style.transform },
          style: style(iframe),
          contentViewport: (() => {
            try { return child ? { width: child.innerWidth, height: child.innerHeight } : null; }
            catch { return null; }
          })(),
        } : null,
        ancestors,
      };
    };
    const record = (kind, details = {}) => {
      if (trace.length >= 12_000) return;
      trace.push(snapshot(kind, details));
    };
    globalThis.__frameLayoutTrace = trace;
    const event = (name, target = null, extra = {}) => {
      phase.value = name;
      record(name, { target: target?.tagName ?? null,
        targetClass: typeof target?.className === "string" ? target.className : "",
        ...extra });
    };
    window.addEventListener("resize", () => {
      event("window.resize");
      queueMicrotask(() => event("window.resize.microtask"));
      requestAnimationFrame(() => {
        event("window.resize.raf1");
        requestAnimationFrame(() => event("window.resize.raf2"));
      });
    }, { passive: true });
    visualViewport?.addEventListener("resize", () => event("visualViewport.resize"), { passive: true });
    for (const type of ["transitionrun", "transitionstart", "transitionend", "transitioncancel",
      "animationstart", "animationend", "animationcancel"]) {
      document.addEventListener(type, (eventValue) => {
        const target = eventValue.target;
        if (target instanceof Element && target.closest(".app-shell")) {
          event(type, target, { propertyName: eventValue.propertyName ?? null,
            animationName: eventValue.animationName ?? null });
        }
      }, true);
    }
    document.addEventListener("visibilitychange", () => event("document.visibilitychange"));
    const attach = () => {
      const slot = document.querySelector("[data-battle-frame-slot]");
      if (!slot || slot.__frameLayoutTraceAttached) return false;
      Object.defineProperty(slot, "__frameLayoutTraceAttached", { value: true });
      const original = slot.getBoundingClientRect.bind(slot);
      Object.defineProperty(slot, "getBoundingClientRect", {
        configurable: true,
        value(...args) {
          const value = original(...args);
          const returnedSlot = { x: round(value.x), y: round(value.y), width: round(value.width),
            height: round(value.height), right: round(value.right), bottom: round(value.bottom) };
          const stack = (new Error().stack ?? "").split("\n").slice(1, 7);
          record("battleFrameSlot.getBoundingClientRect", { returnedSlot, stack });
          return value;
        },
      });
      const mutationObserver = new MutationObserver((records) => {
        const relevant = records.filter((item) => {
          const node = item.target instanceof Element ? item.target : item.target.parentElement;
          if (!node) return false;
          return node.matches(".app-shell, .app-main, .battle-view, [data-battle-frame-slot], iframe.battle-frame") ||
            Boolean(node.closest(".battle-frame-slot"));
        });
        if (relevant.length) record("layout.mutation", { changes: relevant.map((item) => ({
          type: item.type, attributeName: item.attributeName ?? null,
          target: item.target?.tagName ?? null,
          targetClass: typeof item.target?.className === "string" ? item.target.className : "",
          oldValue: item.oldValue ?? null,
        })) });
      });
      mutationObserver.observe(document.documentElement, {
        attributes: true, attributeOldValue: true,
        attributeFilter: ["class", "style", "hidden", "data-view-active"],
        childList: true, subtree: true,
      });
      const observed = [document.documentElement, document.body,
        document.querySelector(".app-shell"), document.querySelector(".app-main"),
        document.querySelector('[data-app-view="battle"]'), slot].filter(Boolean);
      const resizeObserver = new ResizeObserver((entries) => {
        record("layout.ResizeObserver", { entries: entries.map((entry) => ({
          target: entry.target.tagName,
          className: typeof entry.target.className === "string" ? entry.target.className : "",
          contentRect: { width: round(entry.contentRect.width), height: round(entry.contentRect.height),
            x: round(entry.contentRect.x), y: round(entry.contentRect.y) },
          borderBoxSize: [...(entry.borderBoxSize ?? [])].map((box) => ({
            inlineSize: round(box.inlineSize), blockSize: round(box.blockSize),
          })),
        })) });
      });
      for (const node of observed) resizeObserver.observe(node);
      record("layout.instrumentation-attached");
      return true;
    };
    const attachObserver = new MutationObserver(() => {
      if (attach()) attachObserver.disconnect();
    });
    if (!attach()) attachObserver.observe(document, { childList: true, subtree: true });
    document.addEventListener("DOMContentLoaded", attach, { once: true });
  });
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

  const evidence = {
    deck: [...DECK],
    errors,
    screenshots: [],
    screenshotMismatches: [],
    teamPlatePixels: [],
    layoutAudit: [],
    checkpoints: [],
    release: {
      fileCount: releaseManifest.fileCount,
      manifestFiles: releaseManifest.files.filter(({ path }) => [
        "public/assets/buried-coil-portrait.webp",
        "public/assets/buried-coil-hidden.webp",
        "public/assets/buried-coil-revealed.svg",
      ].includes(path)),
    },
    trustedInput: [],
  };

  const recordPageScreenshot = async (file) => {
    const path = join(ARTIFACTS, file);
    const png = await page.screenshot({ path, animations: "disabled" });
    evidence.screenshots.push({ file, sha256: sha256(png), viewport: page.viewportSize() });
    return png;
  };

  const persistEvidence = async () => writeFile(join(ARTIFACTS, "browser-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);

  const persistLayoutTrace = async (checkpoint) => {
    const trace = await page.evaluate(() => globalThis.__frameLayoutTrace ?? []);
    await writeFile(join(ARTIFACTS, "frame-layout-call-trace.json"),
      `${JSON.stringify({ checkpoint, trace }, null, 2)}\n`);
    return trace;
  };

  const assertFrameFitsSettledSlot = async (contextName, layout) => {
    if (contextName !== "revealed-phone-normal") return;
    const expectedScale = Math.min(layout.slot.rect.width / 720, layout.slot.rect.height / 1_280);
    const scaleEvidence = parseFrameScale(layout);
    const actualScale = scaleEvidence.valid ? scaleEvidence.value : null;
    const trace = await persistLayoutTrace(contextName);
    const recentReads = trace.filter(({ kind }) => kind === "battleFrameSlot.getBoundingClientRect")
      .slice(-10).map(({ at, phase, viewport, details }) => ({
        at, phase, inner: [viewport.innerWidth, viewport.innerHeight],
        returnedSlot: details.returnedSlot, stack: details.stack,
      }));
    const evidencePath = join(ARTIFACTS, "frame-layout-assertion-validated.json");
    await writeFile(evidencePath, `${JSON.stringify({ contextName, actualScale, expectedScale,
      scaleEvidence, layout, recentReads }, null, 2)}\n`);
    assert.ok(scaleEvidence.valid && Math.abs(actualScale - expectedScale) < 0.00001,
      `canonical reveal leaves the phone iframe smaller than its settled slot: scale=${actualScale}; expected=${expectedScale}; slot=${JSON.stringify(layout.slot.rect)}; iframe=${JSON.stringify(layout.iframe.rect)}; call-time reads=${JSON.stringify(recentReads)}; evidence=${evidencePath}`);
  };

  const recordOuterLayout = async (label) => {
    const layout = await page.evaluate(() => {
      const box = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
          display: style.display,
          flex: style.flex,
          minHeight: style.minHeight,
          overflow: style.overflow,
          transform: style.transform,
        };
      };
      const shell = document.querySelector(".app-shell");
      const main = document.querySelector(".app-main");
      const battleView = document.querySelector('[data-view="battle"]');
      const slot = document.querySelector("[data-battle-frame-slot]");
      const iframe = slot?.querySelector("iframe");
      return {
        devicePixelRatio: window.devicePixelRatio,
        inner: { width: window.innerWidth, height: window.innerHeight },
        visualViewport: window.visualViewport ? {
          width: window.visualViewport.width,
          height: window.visualViewport.height,
          scale: window.visualViewport.scale,
          offsetLeft: window.visualViewport.offsetLeft,
          offsetTop: window.visualViewport.offsetTop,
        } : null,
        scroll: { x: window.scrollX, y: window.scrollY },
        shell: box(shell),
        main: box(main),
        battleView: box(battleView),
        slot: box(slot),
        iframe: iframe ? {
          ...box(iframe),
          attributes: { width: iframe.getAttribute("width"), height: iframe.getAttribute("height") },
          inline: { left: iframe.style.left, top: iframe.style.top, transform: iframe.style.transform },
          contentViewport: (() => {
            try {
              return { width: iframe.contentWindow.innerWidth, height: iframe.contentWindow.innerHeight };
            } catch {
              return null;
            }
          })(),
        } : null,
      };
    });
    const entry = { label, viewport: page.viewportSize(), ...layout };
    evidence.layoutAudit.push(entry);
    return entry;
  };

  const restoreCheckpointAtAllContexts = async (name, { verifyTeamPlate = false } = {}) => {
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.pause();
    }, moduleUrl);
    const checkpoints = [];
    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      for (const motion of MOTIONS) {
        await page.emulateMedia({ reducedMotion: motion.value });
        await page.mouse.move(0, 0);
        await page.waitForTimeout(250);
        await settlePaint(page);
        const contextName = `${name}-${viewport.label}-${motion.label}`;
        const outerLayout = await recordOuterLayout(contextName);
        await assertFrameFitsSettledSlot(contextName, outerLayout);
        let beforePng;
        if (verifyTeamPlate) {
          const viewportCrop = `${contextName}-before-restore.png`;
          beforePng = await recordPageScreenshot(viewportCrop);
          const viewportPath = join(ARTIFACTS, viewportCrop);
          for (const side of ["north", "south"]) {
            const marker = frameLocator.locator(
              `.combat-marker[data-kind="buried-coil"][data-side="${side}"]`,
            );
            assert.equal(await marker.count(), 1,
              `${contextName}: exactly one live ${side} Buried Coil is in the real arena`);
            const expectedForm = name === "revealed" && side === "north"
              ? "revealed" : "hidden";
            assert.equal(await marker.getAttribute("data-hidden"),
              String(expectedForm === "hidden"),
              `${contextName}: the measured ${side} coil reflects its canonical ${expectedForm} form`);
            const markerAudit = await inspectBuriedCoilTeamPlate(marker, moduleUrl);
            assert.equal(markerAudit.alive, true,
              `${contextName}: the measured coil is alive`);
            assert.equal(markerAudit.hitpoints, markerAudit.maxHitpoints,
              `${contextName}: the measured coil is at full health with no damage filter`);
            assert.equal(markerAudit.domState.reaction, "idle",
              `${contextName}: the measured coil has no recent combat effect`);
            assert.equal(markerAudit.domState.hit, null,
              `${contextName}: the measured coil has no active hit flash`);
            assert.ok(markerAudit.healthBar?.rect,
              `${contextName}: the live coil health bar is measurable`);
            if (expectedForm === "hidden") {
              assert.equal(markerAudit.domState.targeting, "false",
                `${contextName}: the measured hidden coil has no target effect`);
            }
            const color = side === "north" ? "198,69,46" : "46,127,134";
            const plate = marker.locator(".combat-art [data-team-color]");
            const plateBounds = await plate.boundingBox();
            assert.ok(plateBounds && plateBounds.width > 0 && plateBounds.height > 0,
              `${contextName}: the actual ${side} product team plate has a visible viewport rectangle`);
            const plateRect = markerAudit.plate.rect;
            const healthRect = markerAudit.healthBar.rect;
            assert.ok(plateRect.y + plateRect.height <= healthRect.y ||
              healthRect.y + healthRect.height <= plateRect.y,
            `${contextName}: the ${side} team plate leaves the role health bar unobscured`);
            assert.equal(markerAudit.plate.computedFill,
              `rgb(${color.split(",").join(", ")})`,
              `${contextName}: the ${side} plate fill follows its product team identity`);
            const artFile = `${contextName}-${side}-combat-art.png`;
            const artPath = join(ARTIFACTS, artFile);
            await marker.locator(".combat-art").screenshot({ path: artPath, animations: "disabled" });
            const markerBounds = await marker.boundingBox();
            const pixels = await exactTeamColorPixelsInViewport(viewportPath, color, plateBounds);
            const minimum = viewport.label === "phone" ? 8 : 24;
            if (pixels.count < minimum) {
              const audit = markerAudit;
              await writeFile(join(ARTIFACTS, `${contextName}-${side}-plate-audit.json`),
                `${JSON.stringify({ audit, markerBounds, pixels,
                  plateBounds,
                  selector: `.combat-marker[data-kind="buried-coil"][data-side="${side}"]`,
                  targetColor: color, viewportCrop, viewportPixels: pixels }, null, 2)}\n`);
            }
            assert.ok(pixels.count >= minimum,
              `${contextName}: actual product team plate has ${pixels.count} exact pixels; needs ${minimum}; viewport=${viewportPath}; marker=${JSON.stringify(markerBounds)}; plate=${JSON.stringify(plateBounds)}; target=${color}; measured=${JSON.stringify(pixels)}`);
            evidence.teamPlatePixels.push({ ...pixels, artFile, color, file: viewportCrop,
              form: expectedForm, markerBounds, plateBounds, minimum, plateAudit: markerAudit,
              side, viewport: viewport.label });
          }
        }

        const before = await readMatchEvidence(frame, moduleUrl);
        beforePng ??= await recordPageScreenshot(`${contextName}-before-restore.png`);
        const restore = await frame.evaluate(async ({ entryUrl, bytes }) => {
          const { arenaHudController: controller } = await import(entryUrl);
          controller.restore(bytes);
          return controller.serialize();
        }, { entryUrl: moduleUrl, bytes: before.browserBytes });
        await settlePaint(page);
        const after = await readMatchEvidence(frame, moduleUrl);
        const afterFile = `${contextName}-after-restore.png`;
        const afterPng = await recordPageScreenshot(afterFile);
        assert.equal(restore, before.browserBytes,
          `${contextName}: production restore returns the exact browser/input snapshot`);
        assert.deepEqual(after, before,
          `${contextName}: session, DOM/HUD, input bridge and typed audio restore exactly`);
        if (!beforePng.equals(afterPng)) {
          evidence.screenshotMismatches.push({
            afterFile,
            afterSha256: sha256(afterPng),
            beforeFile: `${contextName}-before-restore.png`,
            beforeSha256: sha256(beforePng),
            context: contextName,
          });
          await persistEvidence();
          if (process.env.CARDS021_CONTINUE_AFTER_EXACT_PNG_FAILURES !== "1") {
            assert.fail(`${contextName}: full-viewport PNG is not byte-identical after restore`);
          }
        }
        checkpoints.push({
          browserSha256: sha256(Buffer.from(before.browserBytes)),
          context: contextName,
          outerLayout,
          fullViewportPngSha256: sha256(beforePng),
          sessionSha256: sha256(Buffer.from(before.sessionBytes)),
          tick: before.tick,
        });
      }
    }
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.resume();
      controller.enterManualStepMode();
    }, moduleUrl);
    evidence.checkpoints.push({ name, contexts: checkpoints });
    await persistEvidence();
  };

  try {
    const appResponse = await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(appResponse.status(), 200);
    await page.locator('.app-nav [data-nav-to="cards"]').click();
    const cardIds = await page.locator("[data-card-grid] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(cardIds.length, 21,
      "the real collection appends Buried Coil while keeping all previous twenty cards");
    const buriedCard = page.locator('[data-card-grid] [data-card-id="buried-coil"]');
    await buriedCard.click();
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Buried Coil");
    assert.equal(await page.locator("[data-card-detail] .detail-cost").innerText(), "4");
    const lore = await page.locator("[data-card-detail] .card-lore p").innerText();
    assert.equal(lore,
      "At the alderwood river workshop, Ilyra winds a young emberseed into a copper coil and seals it beneath a hatch beside the sluice. When raider boots shake the roots, the seed glows and the hatch lifts a riveted lookout to guard the waterwheel.");
    const description = await page.locator("[data-card-detail] .detail-description").innerText();
    assert.match(description, /Stationary defensive structure/u);
    assert.match(description, /single-target attacks against ground and air targets/u);
    assert.match(description, /QUESTION/u);
    assert.doesNotMatch(description, /splash damage/u,
      "the Buried Coil card does not claim a mechanic its approved profile lacks");
    const profile = page.locator("[data-card-detail] .structure-profile");
    const profileExplanation = await profile.locator("p").innerText();
    assert.match(profileExplanation, /Cost is source backed/u);
    assert.match(profileExplanation, /QUESTION/u);
    assert.equal(await profile.locator(".stat-cell").count(), 10);
    const stats = await profile.locator(".stat-cell").evaluateAll((nodes) => nodes.map((node) => ({
      label: node.querySelector("span")?.innerText,
      value: node.querySelector("strong")?.innerText,
    })));
    assert.deepEqual(stats[0], { label: "COST", value: "4 elixir" },
      "the identity cost stays authoritative without QUESTION decoration");
    assert.ok(stats.slice(1).every(({ value }) => value.includes("QUESTION")),
      "each provisional combat statistic carries its QUESTION label");
    const targetProfile = stats.find(({ label }) => label === "TARGETS");
    assert.ok(targetProfile?.value.includes("ground and air") &&
      targetProfile.value.includes("QUESTION"),
    `the known target mode remains readable alongside its QUESTION policy: ${JSON.stringify(targetProfile)}`);
    assert.doesNotMatch(targetProfile.value, /not available/u,
      "the admitted ground-and-air target mode is represented in the profile");
    const portraitMetrics = await page.locator(
      '[data-card-detail] .detail-portrait .card-art-image',
    ).evaluate(async (image) => {
      await image.decode();
      return { currentSrc: image.currentSrc, complete: image.complete,
        naturalSize: [image.naturalWidth, image.naturalHeight] };
    });
    assert.ok(portraitMetrics.complete && portraitMetrics.naturalSize[0] > 0 &&
      portraitMetrics.naturalSize[1] > 0);
    assert.match(portraitMetrics.currentSrc, /buried-coil-portrait\.webp(?:\?|$)/u);
    await recordPageScreenshot("buried-coil-detail-phone-390x844.png");
    await page.setViewportSize({ width: 1440, height: 933 });
    await settlePaint(page);
    await recordPageScreenshot("buried-coil-detail-desktop-1440x933.png");
    await page.setViewportSize({ width: 390, height: 844 });

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.locator('[data-replace-slot="3"]').click();
    await page.locator('[data-replacement-card-id="buried-coil"]').click();
    const savedDeck = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.deepEqual(savedDeck, DECK,
      "the actual deck editor replaces one slot with Buried Coil and keeps eight ordered cards");
    assert.equal(await page.locator("[data-deck-size]").first().innerText(), "8");
    assert.equal(await page.locator("[data-deck-kind]").first().innerText(), "CUSTOM DECK");
    await recordPageScreenshot("buried-coil-custom-deck-phone-390x844.png");

    await page.locator('.app-nav [data-nav-to="battle"]').click();
    frameLocator = page.frameLocator("[data-battle-frame-slot] iframe");
    const arena = frameLocator.locator('[data-ui="arena"]');
    await arena.waitFor({ state: "visible", timeout: 10_000 });
    frame = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(frame, "the released app mounted its actual arena iframe");
    await recordOuterLayout("battle-frame-mounted");
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.enterManualStepMode();
    }, moduleUrl);
    await frame.waitForFunction(async ({ entryUrl, expectedDeck }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const setup = JSON.parse(controller.session.serialize()).setup;
      return JSON.stringify(setup.deck) === JSON.stringify(expectedDeck) && setup.seed === 0;
    }, { entryUrl: moduleUrl, expectedDeck: DECK }, { timeout: 10_000 });
    const expectedSetup = JSON.parse(createEditableGameSessionSetup(DECK, 0));
    await waitForMatch(frame, moduleUrl,
      { kind: "deployment", side: "north", cardId: "buried-coil" },
      "seed-zero AI Buried Coil deployment", 15_000);

    const framePointer = await frame.evaluate(() => {
      globalThis.__cards021Pointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards021Pointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
      return true;
    });
    assert.equal(framePointer, true);
    const initial = await readMatchEvidence(frame, moduleUrl);
    assert.deepEqual(initial.setup, expectedSetup,
      "the actual arena starts the canonical custom deck with seed zero");
    assert.ok(initial.hand.includes("buried-coil"),
      "seed-zero south initial hand supports the real Buried Coil drop");
    assert.ok(initial.setup.legalNorthDeployments.some(({ cardId }) => cardId === "buried-coil"),
      "the seeded opponent roster legally admits Buried Coil");
    await recordOuterLayout("ai-buried-coil-deployed");

    const coilSlot = frameLocator.locator('[data-ui="card-slot"][data-card-id="buried-coil"]');
    await coilSlot.waitFor({ state: "visible", timeout: 10_000 });
    await coilSlot.click();
    assert.equal(await frameLocator.locator(
      '[data-ui="hud-hand"] [data-card-id="buried-coil"]',
    ).getAttribute("data-selected"), "true",
    "the real player hand confirms Buried Coil selection before the trusted drop");
    await clickWorldPoint(page, arena, 8_500, 11_000);
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.stepMany(1);
    }, moduleUrl);
    await waitForMatch(frame, moduleUrl,
      { kind: "deployment", side: "south", cardId: "buried-coil" },
      "the real south GameSession deployment from the trusted player drop", 15_000);
    const firstDrop = await readMatchEvidence(frame, moduleUrl);
    const playerDeployments = firstDrop.deploymentEvents.filter(({ materialization, side, type }) =>
      type === "session-structure-deployed" && side === "south" &&
      materialization?.cardId === "buried-coil");
    const aiDeployments = firstDrop.deploymentEvents.filter(({ materialization, side, type }) =>
      type === "session-structure-deployed" && side === "north" &&
      materialization?.cardId === "buried-coil");
    assert.equal(playerDeployments.length, 1,
      `one trusted player gesture submits exactly one real Buried Coil deployment; tick=${firstDrop.tick}; paused=${firstDrop.paused}; pending=${JSON.stringify(firstDrop.pendingPlayerCommands)}; elixir=${JSON.stringify(firstDrop.elixir)}; sequence=${JSON.stringify(firstDrop.sequence)}; structures=${JSON.stringify(firstDrop.structures)}; events=${JSON.stringify(firstDrop.deploymentEvents)}; bridge=${JSON.stringify(JSON.parse(firstDrop.browserBytes).bridge)}`);
    assert.equal(playerDeployments[0].spend.cost, 4);
    assert.equal(firstDrop.sequence.south, 1,
      "one player structure deployment advances the authentic deck cycle once");
    assert.equal(firstDrop.structures.filter(({ alive, side }) => alive && side === "south").length, 1,
      "the player deployment materializes once in GameSession");
    assert.equal(aiDeployments.length, 1,
      "the deterministic north AI deploys Buried Coil from its own authentic hand");
    assert.equal(aiDeployments[0].spend.cost, 4);
    assert.equal(firstDrop.sequence.north, 1);
    assert.ok(firstDrop.structures.every(({ hidden }) => hidden),
      "both actual structures begin in the concealed state");
    assert.ok(firstDrop.structures.some(({ alive, cardId, side }) =>
      alive && cardId === "buried-coil" && side === "north"));
    assert.ok(firstDrop.structures.some(({ alive, cardId, side }) =>
      alive && cardId === "buried-coil" && side === "south"));
    await recordOuterLayout("player-buried-coil-deployed");
    evidence.trustedInput.push(...await frame.evaluate(() => globalThis.__cards021Pointers));
    assert.ok(evidence.trustedInput.some(({ isTrusted }) => isTrusted),
      "the first deployment came from a trusted native pointer event");

    await restoreCheckpointAtAllContexts("hidden", { verifyTeamPlate: true });
    if (process.env.CARDS021_HIDDEN_PLATE_SMOKE === "1") {
      await writeFile(join(ARTIFACTS, "hidden-team-plate-smoke-evidence.json"),
        `${JSON.stringify(evidence, null, 2)}\n`);
      assert.equal(evidence.screenshotMismatches.length, 0,
        `hidden-form smoke retains strict PNG restore mismatches: ${JSON.stringify(evidence.screenshotMismatches)}`);
      return;
    }

    const deployCard = async (cardId, x, y, label) => {
      await advanceUntilMatch(frame, moduleUrl,
        { kind: "hand-card", cardId, minimumElixir: 1 },
        `${label} in the real player hand`, 1_200);
      const slot = frameLocator.locator(`[data-ui="card-slot"][data-card-id="${cardId}"]`);
      await slot.waitFor({ state: "visible", timeout: 10_000 });
      await slot.click();
      await clickWorldPoint(page, arena, x, y);
      await frame.evaluate(async (entryUrl) => {
        const { arenaHudController: controller } = await import(entryUrl);
        controller.stepMany(1);
      }, moduleUrl);
      await waitForMatch(frame, moduleUrl,
        { kind: "deployment", side: "south", cardId },
        `${label} to materialize from the trusted player input`, 15_000);
    };

    await deployCard("mossguard", 6_000, 14_000, "ground target");
    await advanceUntilMatch(frame, moduleUrl, { kind: "revealed-coil", side: "north" },
      "a canonical north Buried Coil reveal from live combat", 360);
    const revealed = await readMatchEvidence(frame, moduleUrl);
    assert.ok(revealed.structures.some(({ hidden, alive }) => alive && !hidden));
    await recordOuterLayout("north-buried-coil-revealed");
    const revealedMarker = frameLocator.locator(
      '.combat-marker[data-kind="buried-coil"][data-hidden="false"] .combat-art',
    ).first();
    assert.match(await revealedMarker.locator("image").getAttribute("href"),
      /buried-coil-revealed\.svg$/u,
      "the live raised art follows typed GameSession.hidden=false state");
    await restoreCheckpointAtAllContexts("revealed", { verifyTeamPlate: true });
    if (process.env.CARDS021_REVEALED_PLATE_SMOKE === "1") {
      await writeFile(join(ARTIFACTS, "revealed-team-plate-smoke-evidence.json"),
        `${JSON.stringify(evidence, null, 2)}\n`);
      assert.equal(evidence.screenshotMismatches.length, 0,
        `revealed-form smoke retains strict PNG restore mismatches: ${JSON.stringify(evidence.screenshotMismatches)}`);
      return;
    }

    await advanceUntilMatch(frame, moduleUrl, { kind: "structure-attack", layer: "ground" },
      "a real Buried Coil hit against an eligible ground target", 600);
    const groundAttack = await readMatchEvidence(frame, moduleUrl);
    assert.ok(groundAttack.structureAttacks.some(({ targetLayer }) => targetLayer === "ground"),
      "ground contact is recorded by the shared real session");

    await deployCard("copperskiff", 3_500, 14_500, "air target");
    await advanceUntilMatch(frame, moduleUrl, { kind: "structure-attack", layer: "air" },
      "a real Buried Coil hit against an eligible air target", 1_200);
    const airAttack = await readMatchEvidence(frame, moduleUrl);
    assert.ok(airAttack.structureAttacks.some(({ targetLayer }) => targetLayer === "air"),
      "air contact is recorded by the shared real session");
    await restoreCheckpointAtAllContexts("damaged");

    await advanceUntilMatch(frame, moduleUrl, { kind: "projectile" },
      "a real in-flight battle projectile", 1_200);
    await restoreCheckpointAtAllContexts("inflight");

    await advanceUntilMatch(frame, moduleUrl, { kind: "hidden-coil", side: "north" },
      "the revealed north Coil naturally reconcealing after losing its target", 1_800);
    await restoreCheckpointAtAllContexts("reconcealed");

    await advanceUntilMatch(frame, moduleUrl, { kind: "terminal" },
      "the live match reaching its own terminal condition", 18_000);
    const terminal = await readMatchEvidence(frame, moduleUrl);
    assert.equal(terminal.terminal, true,
      "the live match reaches its own terminal condition through real game progression");
    assert.equal(terminal.setup.seed, 0);
    assert.deepEqual(terminal.setup.deck, DECK);
    await recordPageScreenshot("buried-coil-natural-terminal-phone-390x844.png");
    const terminalBytes = terminal.browserBytes;
    await frame.evaluate(async ({ entryUrl, bytes }) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.restore(bytes);
    }, { entryUrl: moduleUrl, bytes: terminalBytes });
    await settlePaint(page);
    const terminalAfter = await readMatchEvidence(frame, moduleUrl);
    const terminalAfterPng = await recordPageScreenshot("buried-coil-natural-terminal-after-restore.png");
    const terminalBeforePng = await readFile(join(ARTIFACTS,
      "buried-coil-natural-terminal-phone-390x844.png"));
    assert.deepEqual(terminalAfter, terminal,
      "terminal session, UI, input and audio state survive the real restore path");
    if (!terminalBeforePng.equals(terminalAfterPng)) {
      evidence.screenshotMismatches.push({
        afterFile: "buried-coil-natural-terminal-after-restore.png",
        afterSha256: sha256(terminalAfterPng),
        beforeFile: "buried-coil-natural-terminal-phone-390x844.png",
        beforeSha256: sha256(terminalBeforePng),
        context: "natural-terminal-after-restore",
      });
      await persistEvidence();
      if (process.env.CARDS021_CONTINUE_AFTER_EXACT_PNG_FAILURES !== "1") {
        assert.fail("the full terminal screenshot restores byte-identically");
      }
    }

    const restart = frameLocator.locator('[data-ui="restart"]');
    await restart.waitFor({ state: "visible", timeout: 10_000 });
    await restart.click();
    await frame.waitForFunction(async ({ entryUrl, expectedDeck }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const setup = JSON.parse(controller.session.serialize()).setup;
      return controller.state.restartCount === 1 && controller.session.state.tick === 0 &&
        JSON.stringify(setup.deck) === JSON.stringify(expectedDeck) && setup.seed === 0;
    }, { entryUrl: moduleUrl, expectedDeck: DECK }, { timeout: 15_000 });
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.enterManualStepMode();
    }, moduleUrl);
    await settlePaint(page);
    await recordPageScreenshot("buried-coil-same-deck-restart-phone-390x844.png");
    const restarted = await readMatchEvidence(frame, moduleUrl);
    assert.deepEqual(restarted.setup.deck, DECK);
    assert.equal(restarted.setup.seed, 0);
    assert.equal(restarted.tick, 0);
    assert.equal(restarted.replayLength, 0);
    assert.equal(restarted.sequence.south, 0);
    assert.ok(restarted.hand.includes("buried-coil"));

    await frame.evaluate(() => {
      globalThis.__cards021Pointers = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__cards021Pointers.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    await frameLocator.locator('[data-ui="card-slot"][data-card-id="buried-coil"]').click();
    await clickWorldPoint(page, arena, 8_500, 11_000);
    await frame.evaluate(async (entryUrl) => {
      const { arenaHudController: controller } = await import(entryUrl);
      controller.stepMany(1);
    }, moduleUrl);
    await waitForMatch(frame, moduleUrl,
      { kind: "deployment", side: "south", cardId: "buried-coil" },
      "the first trusted Buried Coil deployment after same-seed restart", 15_000);
    const afterRestartDrop = await readMatchEvidence(frame, moduleUrl);
    const restartDropEvents = afterRestartDrop.deploymentEvents.filter(({ materialization, side, type }) =>
      type === "session-structure-deployed" && side === "south" &&
      materialization?.cardId === "buried-coil");
    assert.equal(restartDropEvents.length, 1);
    assert.equal(restartDropEvents[0].spend.cost, 4);
    assert.equal(afterRestartDrop.sequence.south, 1);
    assert.ok(afterRestartDrop.structures.some(({ alive, cardId, side }) =>
      alive && cardId === "buried-coil" && side === "south"));
    const restartPointers = await frame.evaluate(() => globalThis.__cards021Pointers);
    assert.ok(restartPointers.some(({ isTrusted }) => isTrusted),
      "the first post-restart deployment also comes from a trusted pointer event");
    evidence.trustedInput.push(...restartPointers);
    await recordPageScreenshot("buried-coil-first-postrestart-drop-phone-390x844.png");

    evidence.final = {
      airAttack: airAttack.structureAttacks.find(({ targetLayer }) => targetLayer === "air") ?? null,
      groundAttack: groundAttack.structureAttacks.find(({ targetLayer }) => targetLayer === "ground") ?? null,
      naturalTerminalTick: terminal.tick,
      postRestartDrop: {
        cost: restartDropEvents[0].spend.cost,
        cycle: afterRestartDrop.sequence.south,
        tick: afterRestartDrop.tick,
      },
      restart: { deck: restarted.setup.deck, restartCount: 1, seed: restarted.setup.seed },
      setup: { deck: initial.setup.deck, seed: initial.setup.seed },
    };
    assert.ok(successfulPaths.has("public/assets/buried-coil-portrait.webp"));
    assert.ok(successfulPaths.has("public/assets/buried-coil-hidden.webp"));
    assert.ok(successfulPaths.has("public/assets/buried-coil-revealed.svg"));
    assert.deepEqual(errors, [], "the actual release browser journey has no browser or asset errors");
    await persistEvidence();
    assert.equal(evidence.screenshotMismatches.length, 0,
      `full-viewport PNG restore mismatches were preserved and remain failures: ${JSON.stringify(evidence.screenshotMismatches)}`);
  } finally {
    await persistLayoutTrace("finally").catch(() => {});
    await page.close();
    await browser.close();
    server.kill("SIGTERM");
  }
});
