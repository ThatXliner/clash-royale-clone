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

import { buildRelease } from "../scripts/build-release.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";

const execFileAsync = promisify(execFile);
const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ??
  "/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.CARDS021_BROWSER_ARTIFACTS ??
  new URL("../artifacts/cards021-integration-round2/builder/", import.meta.url).pathname;
const ARENA_MODULE = "src/ui/arena-shell-entry.js";
const DECK = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "buried-coil",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);
const QUESTION_MARKED_LIFETIME_TICKS = 1_800;
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

async function settleGeometry(page) {
  return page.evaluate(async () => {
    const quantizeCssPosition = (value) => Math.round(value * 64) / 64;
    const measure = () => {
      const rect = (node) => {
        if (!node) return null;
        const bounds = node.getBoundingClientRect();
        return [bounds.x, bounds.y, bounds.width, bounds.height]
          .map(quantizeCssPosition);
      };
      const frame = document.querySelector("[data-battle-frame-slot] iframe");
      const inner = frame?.contentDocument;
      return {
        battle: rect(document.querySelector('[data-view="battle"]')),
        frame: rect(frame),
        frameArena: rect(inner?.querySelector('[data-ui="arena"]')),
        frameShell: rect(inner?.querySelector('[data-ui="arena-shell"]')),
        slot: rect(document.querySelector("[data-battle-frame-slot]")),
        viewport: [window.innerWidth, window.innerHeight],
      };
    };
    let previous = null;
    let steady = 0;
    for (let frame = 1; frame <= 64; frame += 1) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
      const geometry = measure();
      const bytes = JSON.stringify(geometry);
      if (bytes === previous) {
        steady += 1;
        if (steady >= 2) return { frames: frame, geometry };
      } else {
        previous = bytes;
        steady = 0;
      }
    }
    throw new Error("app and battle-frame geometry did not settle within 64 natural animation frames");
  });
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

async function readCombatHealthPresentation(marker) {
  return marker.locator(".combat-health").evaluate((node) => ({
    current: node.parentElement.style.getPropertyValue("--combat-health"),
    maximum: node.parentElement.style.getPropertyValue("--combat-health-max"),
    rect: (() => {
      const bounds = node.getBoundingClientRect();
      return { height: bounds.height, width: bounds.width };
    })(),
    scaleX: new DOMMatrixReadOnly(getComputedStyle(node).transform).a,
  }));
}

async function readMatchEvidence(frame, moduleUrl, targetDamageBoundary = null) {
  return frame.evaluate(async ({ entryUrl, targetDamageBoundary }) => {
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
        targetHealth: target?.hitpoints ?? null,
        targetMaxHealth: target?.maxHealth ?? null,
        targetId: attack.targetId,
        targetLayer: target?.layer ?? null,
        tick: attack.tick,
      };
    });
    const structureDamages = controller.session.replay.flatMap((event) => {
      if (event.type !== "damage" || typeof event.externalSourceId !== "string") return [];
      const match = /^building:([1-9][0-9]*)$/u.exec(event.externalSourceId);
      const buildingId = match === null ? null : Number(match[1]);
      if (!structureIds.has(buildingId)) return [];
      const target = state.battle.units.find(({ id }) => id === event.targetId);
      return [{ amount: event.amount, buildingId, currentHealthAfter: event.currentHealthAfter,
        currentHealthBefore: event.currentHealthBefore, targetCardId: target?.cardId ?? null,
        targetHealth: target?.hitpoints ?? null, targetMaxHealth: target?.maxHealth ?? null,
        targetId: event.targetId, targetLayer: target?.layer ?? null, tick: event.tick }];
    });
    const structures = state.battle.structures.filter(({ cardId }) => cardId === "buried-coil")
      .map(({ alive, cardId, deathCause, hidden, hitpoints, id, maxHitpoints, placedTick, side, targetable }) => ({
        alive, cardId, deathCause, hidden, hitpoints, id, maxHitpoints, placedTick, side, targetable,
      }));
    const structureLifetimes = controller.session.replay.filter(({ buildingId, type }) =>
      type === "structure-destroyed" && structureIds.has(buildingId)).map(({ buildingId, cause, tick }) =>
      ({ buildingId, cause, tick }));
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
      currentDamageEvents: targetDamageBoundary === null ? [] :
        controller.session.replay.filter(({ targetId, tick, type }) =>
        type === "damage" && targetId === targetDamageBoundary.targetId &&
        tick === targetDamageBoundary.tick).map(({ amount, currentHealthAfter,
        currentHealthBefore, externalSourceId, targetId, tick }) => ({ amount,
        currentHealthAfter, currentHealthBefore, externalSourceId: externalSourceId ?? null,
        targetId, tick })),
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
      structureDamages,
      structureLifetimes,
      tick: state.tick,
      terminal: state.terminal,
      units: state.battle.units.map(({ alive, cardId, hitpoints, id, layer, side }) => ({
        alive, cardId, hitpoints, id, layer, side,
      })),
    };
  }, { entryUrl: moduleUrl, targetDamageBoundary });
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
      case "structure-contact": {
        const coilIds = new Set(structures.filter((structure) =>
          structure.cardId === "buried-coil").map((structure) => structure.id));
        const launches = replay.filter((event) => event.type === "structure-attack" &&
          coilIds.has(event.buildingId) && units.some((unit) =>
            unit.id === event.targetId && unit.layer === condition.layer));
        return launches.some((launch) => replay.some((event) => event.type === "damage" &&
          event.externalSourceId === `building:${launch.buildingId}` &&
          event.targetId === launch.targetId));
      }
      case "coil-expiry": {
        const coilIds = new Set(structures.filter((structure) =>
          structure.cardId === "buried-coil").map((structure) => structure.id));
        const expired = new Set(replay.filter((event) => event.type === "structure-destroyed" &&
          event.cause === "expiry" && coilIds.has(event.buildingId))
          .map((event) => event.buildingId));
        return coilIds.size === 2 && expired.size === coilIds.size;
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
        case "structure-contact": {
          const coilIds = new Set(structures.filter((structure) =>
            structure.cardId === "buried-coil").map((structure) => structure.id));
          const launches = replay.filter((event) => event.type === "structure-attack" &&
            coilIds.has(event.buildingId) && units.some((unit) =>
              unit.id === event.targetId && unit.layer === condition.layer));
          return launches.some((launch) => replay.some((event) => event.type === "damage" &&
            event.externalSourceId === `building:${launch.buildingId}` &&
            event.targetId === launch.targetId));
        }
        case "coil-expiry": {
          const coilIds = new Set(structures.filter((structure) =>
            structure.cardId === "buried-coil").map((structure) => structure.id));
          const expired = new Set(replay.filter((event) => event.type === "structure-destroyed" &&
            event.cause === "expiry" && coilIds.has(event.buildingId))
            .map((event) => event.buildingId));
          return coilIds.size === 2 && expired.size === coilIds.size;
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
    const matched = matches();
    const finalState = controller.session.state;
    const finalReplay = controller.session.replay;
    const finalStructures = finalState.battle.structures;
    const finalUnits = finalState.battle.units;
    const diagnostics = !matched && condition.kind === "structure-attack" ? {
      coils: finalStructures.filter(({ cardId }) => cardId === "buried-coil").map((structure) => ({
        alive: structure.alive, deathCause: structure.deathCause, hidden: structure.hidden,
        hitpoints: structure.hitpoints, id: structure.id, placedTick: structure.placedTick,
        position: structure.position, side: structure.side, targetKey: structure.targetKey,
        targetable: structure.targetable,
      })),
      airUnits: finalUnits.filter(({ layer }) => layer === "air").map((unit) => ({
        alive: unit.alive, attack: unit.attack, cardId: unit.cardId, hitpoints: unit.hitpoints,
        id: unit.id, position: unit.position, side: unit.side, targetId: unit.targetId,
      })),
      allUnits: finalUnits.map((unit) => ({
        alive: unit.alive, cardId: unit.cardId, hitpoints: unit.hitpoints, id: unit.id,
        layer: unit.layer, position: unit.position, side: unit.side,
      })),
      coilAttacks: finalReplay.filter(({ buildingId, type }) => type === "structure-attack" &&
        finalStructures.some((structure) => structure.cardId === "buried-coil" &&
          structure.id === buildingId)).map(({ amount, buildingId, targetId, tick }) => ({
        amount, buildingId, targetId, tick,
        targetLayer: finalUnits.find((unit) => unit.id === targetId)?.layer ?? null,
        targetCardId: finalUnits.find((unit) => unit.id === targetId)?.cardId ?? null,
      })),
      recentDeployments: finalReplay.filter(({ type, deployment, materialization }) =>
        (type === "session-deployed" && deployment?.cardId === "copperskiff") ||
        (type === "session-structure-deployed" && materialization?.cardId === "buried-coil")),
      replayTail: finalReplay.slice(-80),
      replayTypes: [...new Set(finalReplay.map(({ type }) => type))],
    } : null;
    return { matched, steps, terminal: controller.session.state.terminal,
      tick: finalState.tick, diagnostics };
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
  const run = { phase: "release-build", pid: process.pid, node: process.version,
    chrome: CHROME, playwright: PLAYWRIGHT };
  const persistRun = async () => writeFile(join(ARTIFACTS, "browser-run.json"),
    `${JSON.stringify(run, null, 2)}\n`);
  await persistRun();
  const temporary = await mkdtemp(join(tmpdir(), "cards021-browser-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  run.phase = "release-built";
  await persistRun();
  const releaseManifest = JSON.parse(await readFile(join(releaseRoot, "release-manifest.json"), "utf8"));
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
  run.chromeVersion = browser.version();
  run.phase = "browser-launched";
  await persistRun();
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

  const evidence = {
    execution: {
      chrome: CHROME,
      chromeVersion: browser.version(),
      node: process.version,
      pid: process.pid,
      playwright: PLAYWRIGHT,
    },
    phase: run.phase,
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
    const png = await page.screenshot({ path });
    evidence.screenshots.push({ file, sha256: sha256(png), viewport: page.viewportSize() });
    return png;
  };

  const persistEvidence = async () => writeFile(join(ARTIFACTS, "browser-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`);

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
        const mediaPresentation = await frame.evaluate(async (entryUrl) => {
          const { arenaHudController: controller } = await import(entryUrl);
          const bytesBefore = controller.serialize();
          controller.restore(bytesBefore);
          const sprite = document.querySelector(
            '.combat-art[data-art-id="briar-runner"][data-reduced-motion]',
          );
          return {
            prefersReducedMotion: window.matchMedia(
              "(prefers-reduced-motion: reduce)",
            ).matches,
            renderedReducedMotion: sprite?.dataset.reducedMotion ?? null,
            browserSnapshotPreserved: controller.serialize() === bytesBefore,
          };
        }, moduleUrl);
        const contextName = `${name}-${viewport.label}-${motion.label}`;
        const expectedReducedMotion = motion.value === "reduce";
        assert.equal(mediaPresentation.browserSnapshotPreserved, true,
          `${contextName}: the production refresh preserves the exact paused browser snapshot`);
        assert.equal(mediaPresentation.prefersReducedMotion, expectedReducedMotion,
          `${contextName}: the actual browser frame exposes the requested media preference`);
        if (mediaPresentation.renderedReducedMotion !== null) {
          assert.equal(mediaPresentation.renderedReducedMotion, String(expectedReducedMotion),
            `${contextName}: the actual sprite DOM reflects the current media preference`);
        }
        const settled = await settleGeometry(page);
        const outerLayout = await recordOuterLayout(contextName);
        outerLayout.geometrySettlement = settled;
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
            evidence.teamPlatePixels.push({ ...pixels, color, file: viewportCrop,
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
        await settleGeometry(page);
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
          assert.fail(`${contextName}: full-viewport PNG is not byte-identical after restore`);
        }
        checkpoints.push({
          browserSha256: sha256(Buffer.from(before.browserBytes)),
          context: contextName,
          mediaPresentation,
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
    run.phase = "collection-and-lore";
    evidence.phase = run.phase;
    await persistRun();
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
    assert.equal((lore.match(/[.!?](?:\s|$)/gu) ?? []).length, 2,
      "the original Buried Coil field note has exactly two sentences");
    assert.match(lore, /emberseed/iu);
    assert.match(lore, /copper/iu);
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
    await settleGeometry(page);
    await recordPageScreenshot("buried-coil-detail-desktop-1440x933.png");
    await page.setViewportSize({ width: 390, height: 844 });
    await settleGeometry(page);

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    run.phase = "custom-deck";
    evidence.phase = run.phase;
    await persistRun();
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
    run.phase = "seed-zero-live-arena";
    evidence.phase = run.phase;
    await persistRun();
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

    run.phase = "hidden-four-context-restores";
    evidence.phase = run.phase;
    await persistRun();
    await restoreCheckpointAtAllContexts("hidden", { verifyTeamPlate: true });
    const deployCard = async (cardId, x, y, label) => {
      await advanceUntilMatch(frame, moduleUrl,
        { kind: "hand-card", cardId, minimumElixir: 1 },
        `${label} in the real player hand`, 1_200);
      const slot = frameLocator.locator(`[data-ui="card-slot"][data-card-id="${cardId}"]`);
      const hudCard = frameLocator.locator(
        `[data-ui="hud-hand"] [data-card-id="${cardId}"]`,
      );
      await slot.waitFor({ state: "visible", timeout: 10_000 });
      const cardCost = Number(await hudCard.locator(".hud-card__cost").innerText());
      assert.ok(Number.isSafeInteger(cardCost) && cardCost > 0,
        `${label}: the live hand displays a canonical integer elixir cost`);
      await advanceUntilMatch(frame, moduleUrl,
        { kind: "hand-card", cardId, minimumElixir: cardCost },
        `${label} is both in hand and affordable at its displayed cost`, 1_200);
      const before = await frame.evaluate(async (entryUrl) => {
        const { arenaHudController: controller } = await import(entryUrl);
        const state = controller.session.state;
        const browser = JSON.parse(controller.serialize());
        const snapshot = JSON.parse(controller.session.serialize());
        return {
          bridge: browser.bridge,
          elixir: state.elixir.sides.south.amount,
          hand: [...state.decks.south.hand],
          pendingPlayerCommands: state.pendingPlayerCommands,
          pointers: globalThis.__cards021Pointers?.length ?? 0,
          replayLength: controller.session.replay.length,
          tick: state.tick,
          transcriptLength: snapshot.transcript.length,
        };
      }, moduleUrl);
      assert.ok(before.hand.includes(cardId) && before.elixir >= cardCost,
        `${label}: actual hand/elixir admits the displayed card cost before input; ${JSON.stringify({ before, cardCost })}`);
      await slot.click();
      assert.equal(await frameLocator.locator(
        `[data-ui="hud-hand"] [data-card-id="${cardId}"]`,
      ).getAttribute("data-selected"), "true",
      `${label}: the real hand confirms this exact card selection before the trusted drop`);
      await clickWorldPoint(page, arena, x, y);
      await frame.evaluate(async (entryUrl) => {
        const { arenaHudController: controller } = await import(entryUrl);
        controller.stepMany(1);
      }, moduleUrl);
      const witness = await frame.evaluate(async ({ entryUrl, replayLength,
        beforeTranscriptLength, beforePointerCount }) => {
        const { arenaHudController: controller } = await import(entryUrl);
        const replay = controller.session.replay;
        const state = controller.session.state;
        const snapshot = JSON.parse(controller.session.serialize());
        const browser = JSON.parse(controller.serialize());
        return {
          bridge: browser.bridge,
          elixir: state.elixir.sides.south.amount,
          hand: [...state.decks.south.hand],
          newCommands: snapshot.transcript.slice(beforeTranscriptLength).filter(({ type }) =>
            type === "submit"),
          newDeployments: replay.slice(replayLength).filter(({ type }) =>
            type === "session-deployed" || type === "session-structure-deployed"),
          pendingPlayerCommands: state.pendingPlayerCommands,
          pointers: globalThis.__cards021Pointers?.slice(beforePointerCount) ?? [],
          replayTail: replay.slice(replayLength),
          tick: state.tick,
          units: state.battle.units.map(({ alive, cardId: unitCardId, hitpoints, id,
            layer, side }) => ({ alive, cardId: unitCardId, hitpoints, id, layer, side })),
        };
      }, { entryUrl: moduleUrl, replayLength: before.replayLength,
        beforeTranscriptLength: before.transcriptLength, beforePointerCount: before.pointers });
      evidence.playerDeploymentWitnesses ??= [];
      evidence.playerDeploymentWitnesses.push({ before, cardCost, cardId, label, witness });
      await persistEvidence();
      const submit = witness.newCommands.map(({ command }) => command).find((command) =>
        command.cardId === cardId && command.type === "deploy");
      assert.ok(submit,
        `${label}: the trusted pointer creates a fresh exact canonical player command; witness=${JSON.stringify({ before, cardCost, witness })}`);
      assert.ok(Number.isSafeInteger(submit.commandId) && submit.commandId > 0,
        `${label}: the transcript has a fresh canonical command identity`);
      assert.equal(submit.tick, before.tick,
        `${label}: the command is submitted at the canonical pre-click tick`);
      assert.ok(Math.abs(submit.point.x - x) <= 1,
        `${label}: the canonical command is within one arena coordinate unit of the trusted x-coordinate`);
      assert.ok(Math.abs(submit.point.y - y) <= 1,
        `${label}: the canonical command is within one arena coordinate unit of the trusted y-coordinate`);
      assert.equal(witness.pointers.length, 1,
        `${label}: exactly one trusted world pointer event follows the card selection`);
      assert.equal(witness.pointers[0].isTrusted, true,
        `${label}: the world placement originates from Chrome's trusted pointer event`);
      const receipt = witness.newDeployments.find((event) => event.type === "session-deployed" &&
        event.side === "south" && event.deployment?.cardId === cardId &&
        event.deployment?.point?.x === submit.point.x && event.deployment?.point?.y === submit.point.y);
      assert.ok(receipt,
        `${label}: the submitted command materializes as its exact real session deployment; witness=${JSON.stringify({ before, cardCost, submit, witness })}`);
      assert.equal(receipt.spend.cost, cardCost,
        `${label}: the accepted session deployment spends the live HUD cost`);
      const unitIds = new Set(receipt.deployment.entityIds);
      const deployedUnits = witness.units.filter(({ id }) => unitIds.has(id));
      assert.equal(deployedUnits.length, unitIds.size,
        `${label}: the deployment receipt materializes every source entity; witness=${JSON.stringify({ before, receipt, witness })}`);
      assert.ok(deployedUnits.length > 0 && deployedUnits.every(({ cardId: deployedCard }) =>
        deployedCard === cardId),
      `${label}: every materialized entity belongs to the submitted card`);
      if (cardId === "copperskiff") {
        assert.ok(deployedUnits.length > 0 && deployedUnits.every(({ layer }) => layer === "air"),
          `Copperskiff materializes as an actual eligible air unit; witness=${JSON.stringify({ before, receipt, witness })}`);
      }
    };

    run.phase = "live-reveal";
    evidence.phase = run.phase;
    await persistRun();
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

    run.phase = "ground-attack";
    evidence.phase = run.phase;
    await persistRun();
    await advanceUntilMatch(frame, moduleUrl, { kind: "structure-attack", layer: "ground" },
      "a real Buried Coil hit against an eligible ground target", 600);
    const beforeGroundContact = await readMatchEvidence(frame, moduleUrl);
    run.phase = "ground-contact-applytick";
    evidence.phase = run.phase;
    await persistRun();
    await advanceUntilMatch(frame, moduleUrl, { kind: "structure-contact", layer: "ground" },
      "the queued Buried Coil ground contact at its recorded apply boundary", 6);
    const groundAttack = await readMatchEvidence(frame, moduleUrl);
    const groundHit = groundAttack.structureAttacks.find(({ targetLayer }) => targetLayer === "ground");
    assert.ok(groundHit, "ground contact is recorded by the shared real session");
    const groundDamage = groundAttack.structureDamages.find(({ buildingId, targetId }) =>
      buildingId === groundHit.buildingId && targetId === groundHit.targetId);
    assert.ok(groundDamage, "the recorded coil launch resolves as a real ground damage event");
    assert.equal(groundDamage.targetLayer, "ground");
    assert.equal(groundDamage.tick, groundHit.tick + 1,
      "the queued ground contact resolves on its canonical next boundary");
    assert.ok(groundDamage.amount > 0);
    assert.equal(groundDamage.currentHealthBefore - groundDamage.currentHealthAfter,
      groundDamage.amount, "the actual ground HP delta matches the contact amount exactly");
    assert.equal(groundDamage.targetHealth, groundDamage.currentHealthAfter);
    assert.ok(groundDamage.targetHealth < groundDamage.targetMaxHealth,
      `the ground hit lowers the live target HP: ${JSON.stringify(groundDamage)}`);
    const groundMarker = frameLocator.locator(
      `.combat-marker[data-combat-id="${groundHit.targetId}"]`,
    );
    const groundHealthPresentation = await readCombatHealthPresentation(groundMarker);
    const groundCueDelta = groundAttack.audio.pcm.slice(beforeGroundContact.audio.pcm.length);
    evidence.groundContact = {
      attack: groundHit,
      audioPcmBefore: beforeGroundContact.audio.pcm.length,
      audioPcmAfter: groundAttack.audio.pcm.length,
      newCues: groundCueDelta,
      damage: groundDamage,
      healthPresentation: groundHealthPresentation,
    };
    await persistEvidence();
    assert.equal(groundHealthPresentation.current, String(groundDamage.targetHealth),
      "the live ground health bar publishes the exact post-contact HP");
    assert.equal(groundHealthPresentation.maximum, String(groundDamage.targetMaxHealth),
      "the live ground health bar publishes the exact maximum HP");
    assert.ok(groundHealthPresentation.rect.width > 0 && groundHealthPresentation.scaleX > 0 &&
      groundHealthPresentation.scaleX < 1,
    "the rendered ground health bar visibly scales below full after damage");
    assert.ok(groundCueDelta.some(({ cueId }) => cueId === "vital-damage"),
    "the actual ground damage schedules the original vital-damage audio cue");

    run.phase = "air-attack";
    evidence.phase = run.phase;
    await persistRun();
    await deployCard("copperskiff", 3_500, 14_500, "air target");
    await advanceUntilMatch(frame, moduleUrl, { kind: "structure-attack", layer: "air" },
      "a real Buried Coil hit against an eligible air target", 1_200);
    const beforeAirContact = await readMatchEvidence(frame, moduleUrl);
    const airHitBeforeContact = beforeAirContact.structureAttacks.find(({ targetLayer }) =>
      targetLayer === "air");
    assert.ok(airHitBeforeContact, "the queued air launch is captured before contact");
    run.phase = "air-contact-applytick";
    evidence.phase = run.phase;
    await persistRun();
    await advanceUntilMatch(frame, moduleUrl, { kind: "structure-contact", layer: "air" },
      "the queued Buried Coil air contact at its recorded apply boundary", 6);
    const airAttack = await readMatchEvidence(frame, moduleUrl, {
      targetId: airHitBeforeContact.targetId,
      tick: airHitBeforeContact.tick + 1,
    });
    const airHit = airAttack.structureAttacks.find(({ targetLayer }) => targetLayer === "air");
    assert.ok(airHit, "air contact is recorded by the shared real session");
    const airDamage = airAttack.structureDamages.find(({ buildingId, targetId }) =>
      buildingId === airHit.buildingId && targetId === airHit.targetId);
    assert.ok(airDamage, "the recorded coil launch resolves as a real air damage event");
    const airTargetBeforeContact = beforeAirContact.units.find(({ id }) => id === airHit.targetId);
    const airTargetAfterContact = airAttack.units.find(({ id }) => id === airHit.targetId);
    const airTargetDamageBatch = airAttack.currentDamageEvents.filter(({ targetId }) =>
      targetId === airHit.targetId);
    const airMarker = frameLocator.locator(
      `.combat-marker[data-combat-id="${airHit.targetId}"]`,
    );
    const airMarkerCount = await airMarker.count();
    const airHealthBarCount = airMarkerCount === 1
      ? await airMarker.locator(".combat-health").count()
      : 0;
    const airHealthPresentation = airHealthBarCount === 1
      ? await readCombatHealthPresentation(airMarker)
      : null;
    const airCueDelta = airAttack.audio.pcm.slice(beforeAirContact.audio.pcm.length);
    const airContactScreenshot = "buried-coil-air-contact-death-phone-390x844.png";
    await recordPageScreenshot(airContactScreenshot);
    evidence.airContact = {
      attack: airHit,
      airContactScreenshot,
      audioPcmBefore: beforeAirContact.audio.pcm.length,
      audioPcmAfter: airAttack.audio.pcm.length,
      damage: airDamage,
      damageBatch: airTargetDamageBatch,
      dom: airAttack.dom,
      healthPresentation: airHealthPresentation,
      markerCount: airMarkerCount,
      newCues: airCueDelta,
      targetAfter: airTargetAfterContact ?? null,
      targetBefore: airTargetBeforeContact ?? null,
      terminal: airAttack.terminal,
      tick: airAttack.tick,
    };
    await persistEvidence();
    assert.equal(airDamage.targetLayer, "air");
    assert.equal(airHit.targetCardId, "copperskiff",
      "the coil's real air target is the player's deployed Copperskiff");
    assert.equal(airDamage.tick, airHit.tick + 1,
      "the queued air contact resolves on its canonical next boundary");
    assert.equal(airDamage.amount, airHit.amount,
      "the damage event retains the exact launched coil damage amount");
    assert.equal(airHit.amount, 230,
      "the real air launch uses the admitted 230-damage coil profile");
    assert.ok(airTargetBeforeContact,
      "the actual air target is present in the shared session before contact");
    assert.equal(airTargetBeforeContact.hitpoints, airDamage.currentHealthBefore,
      "the contact event begins from the live pre-contact Copperskiff HP");
    assert.equal(airDamage.currentHealthBefore, 221,
      "the real Copperskiff reaches the exact observed overkill boundary");
    assert.ok(airTargetDamageBatch.length > 0,
      "all damage events against the target at the contact boundary are retained");
    const coilDamageBatchEntries = airTargetDamageBatch.filter(({ externalSourceId }) =>
      externalSourceId === `building:${airHit.buildingId}`);
    assert.equal(coilDamageBatchEntries.length, 1,
      "the contact boundary contains exactly one damage entry from this buried Coil");
    assert.deepEqual(coilDamageBatchEntries[0], {
      amount: airDamage.amount,
      currentHealthAfter: airDamage.currentHealthAfter,
      currentHealthBefore: airDamage.currentHealthBefore,
      externalSourceId: `building:${airHit.buildingId}`,
      targetId: airHit.targetId,
      tick: airDamage.tick,
    }, "the building-sourced replay event exactly matches the recorded Coil contact");
    let expectedBatchHealth = airTargetBeforeContact.hitpoints;
    for (const contact of airTargetDamageBatch) {
      assert.equal(contact.currentHealthBefore, expectedBatchHealth,
        "same-boundary target contacts apply in their recorded cumulative order");
      assert.equal(contact.currentHealthAfter,
        Math.max(0, expectedBatchHealth - contact.amount),
        "each same-boundary event applies the exact armor-free health clamp");
      expectedBatchHealth = contact.currentHealthAfter;
    }
    assert.equal(airDamage.currentHealthBefore,
      coilDamageBatchEntries[0].currentHealthBefore,
      "the Coil's own before value is derived from the ordered target damage batch");
    const actualAppliedAirDamage = Math.min(airDamage.currentHealthBefore, airDamage.amount);
    assert.equal(airDamage.currentHealthBefore - airDamage.currentHealthAfter,
      actualAppliedAirDamage,
      "the exact applied air damage is clamped to the target's remaining HP");
    assert.equal(airDamage.currentHealthAfter,
      Math.max(0, airDamage.currentHealthBefore - airDamage.amount),
      "the canonical armor-free damage system clamps the post-contact HP at zero");
    assert.equal(airDamage.targetHealth, airDamage.currentHealthAfter);
    assert.equal(airDamage.targetHealth, 0,
      "the actual overkill contact leaves the Copperskiff at zero live HP");
    assert.ok(airTargetAfterContact,
      "the actual air target remains represented in the session after its lethal hit");
    assert.equal(airTargetAfterContact.hitpoints, 0);
    assert.equal(airTargetAfterContact.hitpoints, expectedBatchHealth,
      "the final unit HP matches the completed same-boundary event sequence");
    assert.equal(airTargetAfterContact.alive, false,
      "the shared session records the Copperskiff dead at the contact boundary");
    assert.equal(airMarkerCount, 0,
      "the dead air target is removed from the actual combat marker DOM at contact");
    assert.ok(!airAttack.dom.combat.includes(`data-combat-id="${airHit.targetId}"`),
      "the captured released combat DOM has no stale Copperskiff marker after its lethal contact");
    assert.ok(airCueDelta.some(({ cueId }) => cueId === "unit-fall"),
      "the lethal air contact schedules the original unit-fall audio cue");
    if (airHealthPresentation !== null) {
      assert.equal(airHealthPresentation.current, String(airDamage.targetHealth),
        "a retained air health bar publishes the exact post-contact HP");
      assert.equal(airHealthPresentation.maximum, String(airDamage.targetMaxHealth),
        "a retained air health bar publishes the exact maximum HP");
      assert.ok(airHealthPresentation.rect.width > 0 &&
        airHealthPresentation.scaleX === 0,
      "the retained dead-air health bar visually clamps to zero HP");
    }
    assert.ok(airCueDelta.some(({ cueId }) => cueId === "vital-damage"),
    "the actual air damage schedules the original vital-damage audio cue");
    run.phase = "damaged-four-context-restores";
    evidence.phase = run.phase;
    await persistRun();
    await restoreCheckpointAtAllContexts("damaged");

    run.phase = "inflight-four-context-restores";
    evidence.phase = run.phase;
    await persistRun();
    await advanceUntilMatch(frame, moduleUrl, { kind: "projectile" },
      "a real in-flight battle projectile", 1_200);
    await restoreCheckpointAtAllContexts("inflight");

    run.phase = "reconcealment-four-context-restores";
    evidence.phase = run.phase;
    await persistRun();
    await advanceUntilMatch(frame, moduleUrl, { kind: "hidden-coil", side: "north" },
      "the revealed north Coil naturally reconcealing after losing its target", 1_800);
    await restoreCheckpointAtAllContexts("reconcealed");

    run.phase = "question-marked-lifetime-expiry";
    evidence.phase = run.phase;
    await persistRun();
    const expiredResult = await advanceUntilMatch(frame, moduleUrl, { kind: "coil-expiry" },
      "both live Buried Coils reaching their configured provisional lifetime", 2_400);
    assert.equal(expiredResult.matched, true,
      `both real structures reach their expiry event before a terminal state: ${JSON.stringify(expiredResult)}`);
    const lifetime = await readMatchEvidence(frame, moduleUrl);
    assert.equal(lifetime.structureLifetimes.filter(({ cause }) => cause === "expiry").length, 2);
    assert.ok(lifetime.structures.every(({ alive, deathCause }) => !alive && deathCause === "expiry"),
      `both actual structures expire under the visible QUESTION-marked provisional lifetime: ${JSON.stringify(lifetime.structures)}`);
    assert.ok(lifetime.structures.every((structure) => {
      const expiry = lifetime.structureLifetimes.find(({ buildingId, cause }) =>
        buildingId === structure.id && cause === "expiry");
      return Number.isInteger(structure.placedTick) &&
        expiry?.tick === structure.placedTick + QUESTION_MARKED_LIFETIME_TICKS;
    }),
    "the actual QUESTION-marked runtime lifetime expires at placedTick + 1800 (for placement tick 1, expiry tick 1801)");
    await restoreCheckpointAtAllContexts("expired");

    run.phase = "natural-terminal-and-restore";
    evidence.phase = run.phase;
    await persistRun();
    await advanceUntilMatch(frame, moduleUrl, { kind: "terminal" },
      "the live match reaching its own terminal condition", 18_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await settleGeometry(page);
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
    await settleGeometry(page);
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
      assert.fail("the full terminal screenshot restores byte-identically");
    }

    run.phase = "same-seed-restart";
    evidence.phase = run.phase;
    await persistRun();
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
    await settleGeometry(page);
    await recordPageScreenshot("buried-coil-same-deck-restart-phone-390x844.png");
    const restarted = await readMatchEvidence(frame, moduleUrl);
    assert.deepEqual(restarted.setup.deck, DECK);
    assert.equal(restarted.setup.seed, 0);
    assert.equal(restarted.tick, 0);
    assert.equal(restarted.replayLength, 0);
    assert.equal(restarted.sequence.south, 0);
    assert.ok(restarted.hand.includes("buried-coil"));

    run.phase = "post-restart-real-deployment";
    evidence.phase = run.phase;
    await persistRun();
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
      airDamage,
      groundAttack: groundAttack.structureAttacks.find(({ targetLayer }) => targetLayer === "ground") ?? null,
      groundDamage,
      lifetime: {
        events: lifetime.structureLifetimes,
        steps: expiredResult.steps,
        structures: lifetime.structures,
        tick: lifetime.tick,
      },
      naturalTerminalTick: terminal.tick,
      postRestartDrop: {
        cost: restartDropEvents[0].spend.cost,
        cycle: afterRestartDrop.sequence.south,
        tick: afterRestartDrop.tick,
      },
      restart: { deck: restarted.setup.deck, restartCount: 1, seed: restarted.setup.seed },
      setup: { deck: initial.setup.deck, seed: initial.setup.seed },
    };
    run.phase = "complete";
    evidence.phase = run.phase;
    await persistRun();
    assert.ok(successfulPaths.has("public/assets/buried-coil-portrait.webp"));
    assert.ok(successfulPaths.has("public/assets/buried-coil-hidden.webp"));
    assert.ok(successfulPaths.has("public/assets/buried-coil-revealed.svg"));
    assert.deepEqual(errors, [], "the actual release browser journey has no browser or asset errors");
    await persistEvidence();
    assert.equal(evidence.screenshotMismatches.length, 0,
      `full-viewport PNG restore mismatches were preserved and remain failures: ${JSON.stringify(evidence.screenshotMismatches)}`);
  } catch (error) {
    run.failure = { name: error?.name, message: String(error?.message ?? error),
      stack: String(error?.stack ?? "") };
    evidence.failure = run.failure;
    evidence.phase = run.phase;
    await persistRun();
    await persistEvidence();
    throw error;
  } finally {
    run.phaseAtExit = run.phase;
    await persistRun();
    try {
      await persistEvidence();
    } finally {
      await page.close();
      await browser.close();
      server.kill("SIGTERM");
    }
  }
});
