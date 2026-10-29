import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import test from "node:test";

import { createPlayableRoster, PLAYABLE_CARD_IDS } from "../src/content/playable-roster.js";
import {
  createSessionTroopWitnessQuestions,
  EDITABLE_DECK_CARD_IDS,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import {
  EDITABLE_MIXED_DECK_CARD_IDS,
  createEditableGameSessionSetup,
} from "../src/content/editable-deck.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
import { createChainQuestionFixture } from "../src/sim/live-battle-chain.js";
import { getCardPortrait } from "../src/ui/card-portrait-art.js";
import { GameSession } from "../src/sim/game-session.js";
import { buildRelease } from "../scripts/build-release.js";

const PLAYWRIGHT = process.env.GAME_BROWSER_PLAYWRIGHT ?? "playwright";
const CHROME = process.env.GAME_BROWSER_CHROME ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ARTIFACTS = process.env.APP_SHELL_ARTIFACTS ??
  new URL("../artifacts/app-001-round-1/", import.meta.url).pathname;
const WORKSPACE_ROOT = new URL("..", import.meta.url).pathname;
const ARENA_CONTROLLER_MODULE = "src/ui/arena-shell-entry.js";
const EXPECTED_ATLAS_CARD_CELLS = Object.freeze([
  Object.freeze(["coilblade", "0"]),
  Object.freeze(["mossguard", "1"]),
  Object.freeze(["copperskiff", "2"]),
  Object.freeze(["skymaul", "3"]),
  Object.freeze(["brassbolt", "4"]),
  Object.freeze(["reedsting", "5"]),
  Object.freeze(["briar-band", "6"]),
  Object.freeze(["cinderlings", "7"]),
]);
const EXPECTED_DEFAULT_ROSTER_IDS = Object.freeze(
  EXPECTED_ATLAS_CARD_CELLS.map(([id]) => id),
);
const EXPECTED_INDIVIDUAL_PORTRAIT_IDS = Object.freeze([
  "brackenwheel",
  "stonehauler",
  "thornscouts",
  "forgeguard",
  "cinder-host",
  "ironroot",
  "sunthread-pair",
  "duskwing-trio",
  "gloamwing-cluster",
  "coppershade-flock",
  "kilnkeeper",
  "stormkite",
  "squall-orb",
  "ember-basin",
]);
const EXPECTED_CARD_LORE = Object.freeze({
  brackenwheel: "Brackenwheel learned to clear jammed sluice gates by spinning a copperroot sickle through the reeds. After dusk, emberseed sparks trace a ring around her boots, and she counts each flicker as a warning from the river.",
  "gloamwing-cluster": "Gloamwings rise from the violet reeds at dusk to follow emberseeds down the riverbank. Five of them wheel around each warm spark until ferry bells call them home.",
  "coppershade-flock": "Coppershades roost in the offcuts piled outside the Rivermark river workshop. When the kiln wakes, all six glide over the canal and trade tiny sparks above their copper-lit nests.",
  stormkite: "On storm nights at the Rivermark weir, a lock-keeper flies a kite of copper ribs and waxed reed paper on one long braided wire. When a thread of lightning catches the kite, the wire hums and the keeper sends the spark leaping from one raider to the next.",
});
const EXPECTED_CARD_PORTRAIT_CELLS = Object.freeze([
  ...EXPECTED_ATLAS_CARD_CELLS,
  ...EXPECTED_INDIVIDUAL_PORTRAIT_IDS.map((id) => Object.freeze([id, null])),
  Object.freeze(["buried-coil", null]),
  Object.freeze(["aether-well", null]),
]);
const EXPECTED_COLLECTION_IDS = Object.freeze([
  ...EXPECTED_DEFAULT_ROSTER_IDS,
  ...EXPECTED_INDIVIDUAL_PORTRAIT_IDS,
  "buried-coil",
  "aether-well",
]);
const EXPECTED_COLLECTION_COUNT = 24;
const EXPECTED_REPLACEMENT_CARD_IDS = Object.freeze([
  ...EXPECTED_INDIVIDUAL_PORTRAIT_IDS,
  "buried-coil",
  "aether-well",
]);
const CARD_PORTRAIT_SCREENSHOTS = Object.freeze([
  "desktop-card-portraits-1440x933.png",
  "desktop-card-details-1440x933.png",
  "phone-card-portraits-390x844.png",
  "phone-card-portraits-full-390x844.png",
]);

async function screenshotEvidence(name) {
  const artifactPath = join(ARTIFACTS, name);
  const bytes = await readFile(artifactPath);
  return {
    path: relative(WORKSPACE_ROOT, artifactPath),
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

async function serverAddress(stream) {
  let output = "";
  for await (const chunk of stream) {
    output += chunk;
    const newline = output.indexOf("\n");
    if (newline >= 0) return JSON.parse(output.slice(0, newline));
  }
  throw new Error("app shell test server stopped before it was ready");
}

function format(number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(number);
}

const UNIT_DETAIL_STAT_FIELDS = Object.freeze([
  Object.freeze(["Health", "hitpoints"]),
  Object.freeze(["Damage", "damage"]),
  Object.freeze(["Hit speed", "hitSpeedTicks"]),
  Object.freeze(["Count", "count"]),
  Object.freeze(["Range", "rangeMillitiles"]),
  Object.freeze(["Targets", "targetMode"]),
  Object.freeze(["Moves", "movementMillitilesPerSecond"]),
]);

function questionReceiptsForCard(card) {
  if (!card.entities.some((entity) => entity.sourceConfidencePolicy?.fields?.length > 0 ||
      entity.damagePolicy?.kind === "question")) return new Map();
  return new Map(createSessionTroopWitnessQuestions(card.id)
    .map((record) => [record.key, record]));
}

function unitStatQuestion(entity, field, questions) {
  const sourceField = entity.sourceConfidencePolicy?.fields?.find((candidate) =>
    candidate.field === field);
  const damagePolicy = field === "damage" ? entity.damagePolicy : null;
  const questionKey = sourceField?.questionKey ??
    (damagePolicy?.kind === "question" ? damagePolicy.questionKey : null);
  if (questionKey === null || questionKey === undefined) return null;
  const record = questions.get(questionKey);
  assert.ok(record !== undefined && record.key === questionKey,
    `${entity.archetypeId}.${field} has a canonical session question receipt`);
  return record.disposition === "question" && record.authoritative === false &&
    record.confidence === "unverified" ? record : null;
}

function expectedStats(entity, questions = new Map()) {
  const suffix = (field) => unitStatQuestion(entity, field, questions) === null
    ? "" : " (QUESTION)";
  const questioned = (field, value) => `${value}${suffix(field)}`;
  return {
    Count: questioned("count", String(entity.count)),
    Health: questioned("hitpoints",
      entity.hitpoints === null ? "Not available" : format(entity.hitpoints)),
    Damage: questioned("damage", entity.damage === null
      ? "Not available" : `${format(entity.damage)} per attack`),
    "Hit speed": entity.hitSpeedTicks === null
      ? questioned("hitSpeedTicks", "Not available")
      : questioned("hitSpeedTicks", `${format(entity.hitSpeedTicks / 60)} s`),
    Range: entity.rangeMillitiles === null
      ? questioned("rangeMillitiles", "Not available")
      : questioned("rangeMillitiles", `${format(entity.rangeMillitiles / 1_000)} tiles`),
    Targets: questioned("targetMode",
      entity.targetMode === "ground-and-air" ? "ground and air" : entity.targetMode),
    Moves: entity.movementMillitilesPerSecond === null
      ? questioned("movementMillitilesPerSecond", "Not available")
      : questioned("movementMillitilesPerSecond",
        `${format(entity.movementMillitilesPerSecond / 1_000)} tiles/s`),
  };
}

function expectedStormkiteChainStats() {
  const fixture = createChainQuestionFixture();
  const suffix = " (QUESTION)";
  return {
    "Targets per attack": `${format(fixture.targetCap.value)} targets${suffix}`,
    "Damage per hop": `${format(fixture.damagePerHop.value)} damage${suffix}`,
    "Hop range": `${format(fixture.hopRangeMillitiles.value / 1_000)} tiles${suffix}`,
    "Hop delay": `${format(fixture.hopDelayTicks.value / 60)} s${suffix}`,
  };
}

function expectedQuestionClassification(entity) {
  const layer = entity.layer === "air" ? "Flying" : "Ground";
  const delivery = entity.delivery === "projectile" ? "ranged" : "melee";
  const target = entity.targetMode === "ground-and-air"
    ? "ground and air" : entity.targetMode;
  const meleeAreaQuestion = entity.meleeAreaPolicy?.authoritative === false &&
    entity.meleeAreaPolicy?.confidence === "question";
  const provisionalFields = [];
  if (meleeAreaQuestion) {
    provisionalFields.push("melee area/contact rule");
  }
  if (entity.layerPolicy?.kind === "question") {
    provisionalFields.push(`${layer.toLocaleLowerCase("en")} layer`);
  }
  if (entity.deliveryPolicy?.kind === "question") {
    provisionalFields.push(`${delivery} delivery`);
  }
  const otherProvisionalFields = provisionalFields.filter((field) =>
    field !== "melee area/contact rule");
  const confidenceNote = meleeAreaQuestion
    ? `The melee area/contact rule remains QUESTION and provisional for historical comparison.${otherProvisionalFields.length === 0
      ? "" : ` The ${otherProvisionalFields.join(" and ")} remain provisional for historical comparison.`}`
    : provisionalFields.length === 1
      ? `The ${provisionalFields[0]} remains provisional for historical comparison.`
      : `The ${provisionalFields.join(" and ")} remain provisional for historical comparison.`;
  const combatConfidenceNote = entity.archetypeId === "kilnkeeper" &&
    entity.sourceConfidencePolicy?.fields?.length > 0
    ? " The 5-elixir cost is source backed; combat values are unverified estimates and remain QUESTION for historical comparison."
    : "";
  return `Current game: ${layer} unit · ${delivery} attacks · targets ${target}. ${confidenceNote}${combatConfidenceNote}`;
}

async function renderedProfiles(page) {
  return page.locator("[data-card-detail] .unit-profile").evaluateAll((profiles) =>
    profiles.map((profile) => Object.fromEntries(
      [...profile.querySelectorAll(".stat-cell")].map((cell) => [
        cell.querySelector("span").textContent,
        cell.querySelector("strong").textContent,
      ]),
    )),
  );
}

async function assertUnitQuestionDisclosure(page, card, questions, width, height) {
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  assert.deepEqual(viewport, { width, height }, "the disclosure assertion uses the requested viewport");
  await page.locator("[data-card-detail] .unit-profile .stat-grid").scrollIntoViewIfNeeded();
  const profiles = await renderedProfiles(page);
  assert.deepEqual(profiles,
    card.entities.map((entity) => expectedStats(entity, questions)),
    `${card.displayName} detail values follow canonical field-question receipts at ${width}x${height}`);
  const expectedQuestionLabels = UNIT_DETAIL_STAT_FIELDS
    .filter(([, field]) => unitStatQuestion(card.entities[0], field, questions) !== null)
    .map(([label]) => label);
  const cellEvidence = await page.locator(
    "[data-card-detail] .unit-profile .stat-cell",
  ).evaluateAll((cells) => cells.map((cell) => {
    const label = cell.querySelector("span");
    const value = cell.querySelector("strong");
    const labelBounds = label.getBoundingClientRect();
    const bounds = value.getBoundingClientRect();
    return {
      label: label.textContent,
      text: value.textContent,
      labelVisible: labelBounds.width > 0 && labelBounds.height > 0 &&
        getComputedStyle(label).visibility !== "hidden" && getComputedStyle(label).display !== "none",
      valueVisible: bounds.width > 0 && bounds.height > 0 &&
        getComputedStyle(value).visibility !== "hidden" && getComputedStyle(value).display !== "none",
      labelLeft: labelBounds.left,
      labelRight: labelBounds.right,
      left: bounds.left,
      right: bounds.right,
    };
  }));
  const actualQuestionLabels = cellEvidence
    .filter(({ text }) => text.endsWith(" (QUESTION)"))
    .map(({ label }) => label);
  assert.deepEqual(actualQuestionLabels, expectedQuestionLabels,
    `${card.displayName} badges only fields whose receipts are QUESTION at ${width}x${height}`);
  assert.ok(cellEvidence.every(({ labelVisible, valueVisible, labelLeft, labelRight, left, right }) =>
    labelVisible && valueVisible && labelLeft >= 0 && labelRight <= width + 1 &&
    left >= 0 && right <= width + 1),
    `${card.displayName} question labels and values remain visible within the ${width}px viewport: ${JSON.stringify(cellEvidence)}`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width,
    `${card.displayName} details do not overflow the ${width}px viewport`);
  const cost = await page.locator("[data-card-detail] .detail-cost").innerText();
  assert.equal(cost, String(card.cost), `${card.displayName} cost remains unchanged`);
  assert.doesNotMatch(cost, /QUESTION/u,
    `${card.displayName} cost remains unmarked because it has no stat-field question receipt`);
  return {
    viewport,
    profiles,
    questionLabels: actualQuestionLabels,
    cost,
    statValues: cellEvidence,
  };
}

function expectedResourceStats(card) {
  const profile = card.buildingRuntime;
  const suffix = (field) => profile.policy[field]?.disposition === "question"
    ? " (QUESTION)" : "";
  return {
    Cost: `${format(card.cost)} elixir`,
    Health: `${format(profile.hitpoints)}${suffix("hitpoints")}`,
    Deploy: `${format(profile.deployTicks / 60)} s${suffix("deployTicks")}`,
    Generation: `${format(profile.generationAmount)} elixir${suffix("generationAmount")}`,
    Interval: `${format(profile.generationCadenceTicks / 60)} s${suffix("generationCadenceTicks")}`,
    Lifetime: `${format(profile.lifetimeTicks / 60)} s${suffix("lifetimeTicks")}`,
    Destroyed: `${format(profile.destructionAmount)} elixir${suffix("destructionAmount")}`,
    Role: "Resource · does not attack",
  };
}

async function assertAetherWellDetails(page) {
  const card = projectSessionNonUnitBattleCard("aether-well");
  const profile = card.buildingRuntime;
  assert.equal(profile.class, "resource");
  for (const [field, disposition] of [
    ["hitpoints", "question"],
    ["deployTicks", "question"],
    ["generationAmount", "question"],
    ["generationCadenceTicks", "source-aligned"],
    ["lifetimeTicks", "source-aligned"],
    ["destructionAmount", "source-aligned"],
  ]) {
    assert.equal(profile.policy[field]?.disposition, disposition,
      `Aether Well ${field} retains its canonical ${disposition} status`);
    assert.equal(profile.policy[field]?.value, profile[field],
      `Aether Well ${field} displays the value carried by its canonical receipt`);
  }
  assert.deepEqual(await renderedProfiles(page), [expectedResourceStats(card)],
    "Aether Well details use only its resource receipt and field-specific confidence");
  const profileText = await page.locator("[data-card-detail] .unit-profile").innerText();
  assert.match(profileText, /Resource structure · QUESTION/u);
  assert.doesNotMatch(profileText, /(?:Damage|First hit|Hit speed|Range|Splash radius|NaN|undefined)/iu,
    "Aether Well exposes no fabricated attack stats or missing values");
  assert.equal(await page.locator("[data-card-detail] .detail-description").innerText(),
    `Stationary resource structure · produces elixir over time and grants ${format(profile.destructionAmount)} elixir when destroyed. It does not attack.`);
  assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
    "At dusk, the Aether Well’s copper scoop gathers glowing emberseed from the quiet river water. Workshop keepers wind its rootwood crank to lift the seeds into stoppered flasks for the nearby repair shed.",
    "the live collection detail shows the accepted two-sentence field note");
}

async function captureAetherWellDetails(page, width, height) {
  await page.locator('[data-card-grid] [data-card-id="aether-well"]').click();
  await assertAetherWellDetails(page);
  const layout = await page.locator("[data-card-detail]").evaluate((detail) => {
    const box = detail.getBoundingClientRect();
    return { viewportWidth: innerWidth, viewportHeight: innerHeight,
      documentWidth: document.documentElement.scrollWidth,
      left: box.left, right: box.right, width: box.width };
  });
  assert.deepEqual([layout.viewportWidth, layout.viewportHeight, layout.documentWidth],
    [width, height, width]);
  assert.ok(layout.left >= 0 && layout.right <= width && layout.width > 0,
    `Aether Well details fit the ${width}px viewport: ${JSON.stringify(layout)}`);
  const screenshot = `aether-well-${width === 390 ? "phone-390x844" : "desktop-1440x933"}.png`;
  await page.screenshot({ path: join(ARTIFACTS, screenshot) });
  if (width === 390) await page.locator("[data-card-detail] .detail-back").click();
  return { layout, screenshot: await screenshotEvidence(screenshot) };
}

async function renderedDetailPortrait(page) {
  return page.locator("[data-card-detail]").evaluate(async (detail) => {
    const image = detail.querySelector(".detail-portrait .card-art-image");
    if (image === null) return null;
    await image.decode();
    const bounds = (node) => {
      if (node === null) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height,
        right: rect.right, bottom: rect.bottom };
    };
    const collectionImage = document.querySelector(
      '[data-card-grid] [data-card-id][aria-pressed="true"] .card-art-image',
    );
    const detailBack = detail.querySelector(".detail-back");
    const backStyle = detailBack === null ? null : getComputedStyle(detailBack);
    const nav = document.querySelector(".app-nav");
    const navStyle = getComputedStyle(nav);
    const ids = [...document.querySelectorAll("[id]")].map((node) => node.id);
    return {
      cardId: image.closest("[data-card-art]")?.dataset.cardArt ?? null,
      image: {
        src: image.getAttribute("src"),
        decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
        naturalSize: [image.naturalWidth, image.naturalHeight],
        visible: bounds(image).width > 0 && bounds(image).height > 0 &&
          getComputedStyle(image).visibility !== "hidden",
        bounds: bounds(image),
      },
      collectionImage: collectionImage === null ? null : {
        src: collectionImage.getAttribute("src"),
        bounds: bounds(collectionImage),
        visible: bounds(collectionImage).width > 0 && bounds(collectionImage).height > 0,
      },
      detail: {
        bounds: bounds(detail),
        scrollWidth: detail.scrollWidth,
        clientWidth: detail.clientWidth,
      },
      detailBack: detailBack === null ? null : {
        visible: backStyle.display !== "none" && backStyle.visibility !== "hidden" &&
          bounds(detailBack).width > 0 && bounds(detailBack).height > 0,
        bounds: bounds(detailBack),
      },
      nav: {
        visible: navStyle.display !== "none" && navStyle.visibility !== "hidden" &&
          bounds(nav).width > 0 && bounds(nav).height > 0,
        bounds: bounds(nav),
      },
      viewport: { width: innerWidth, height: innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      focusedElementId: document.activeElement?.id ?? null,
      idsUnique: ids.length === new Set(ids).size,
    };
  });
}

async function cardFrameTick(frame, moduleUrl) {
  return frame.evaluate(async (entryUrl) => {
    const { arenaHudController } = await import(entryUrl);
    return arenaHudController.state.sessionTick;
  }, moduleUrl);
}

async function cardFrameDeployment(frame, cardId, moduleUrl) {
  return frame.evaluate(async ({ expectedId, entryUrl }) => {
    const { arenaHudController } = await import(entryUrl);
    const event = arenaHudController.session.replay.find(({ side, type, deployment }) =>
      side === "south" && type === "session-deployed" &&
      deployment.cardId === expectedId);
    return event ?? null;
  }, { expectedId: cardId, entryUrl: moduleUrl });
}

async function cardFrameSpell(frame, cardId, moduleUrl) {
  return frame.evaluate(async ({ expectedId, entryUrl }) => {
    const { arenaHudController } = await import(entryUrl);
    return arenaHudController.session.replay.find(({ side, type, intent }) =>
      side === "south" && type === "session-spell-played" &&
      intent?.cardId === expectedId) ?? null;
  }, { expectedId: cardId, entryUrl: moduleUrl });
}

async function cardFrameDiagnostics(frame, moduleUrl) {
  return frame.evaluate(async (entryUrl) => {
    const { arenaHudController } = await import(entryUrl);
    const arena = document.querySelector('[data-ui="arena"]');
    return {
      arena: arena?.getBoundingClientRect().toJSON(),
      input: arenaHudController.input,
      pointers: globalThis.__appBattlePointerEvidence ?? [],
      state: arenaHudController.state,
      feedback: arenaHudController.placementFeedback,
    };
  }, moduleUrl);
}

async function cardFrameLayout(frame) {
  return frame.evaluate(() => {
    const boxes = (selector) => [...document.querySelectorAll(selector)].map((node) => {
      const bounds = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return {
        height: bounds.height,
        left: bounds.left,
        top: bounds.top,
        visible: style.display !== "none" && style.visibility !== "hidden" &&
          bounds.width > 0 && bounds.height > 0,
        width: bounds.width,
      };
    });
    return {
      viewport: { width: innerWidth, height: innerHeight },
      cardSlots: boxes('[data-ui="card-slot"]'),
      hand: boxes('[data-ui="hud-hand"] .hud-card'),
      next: boxes('[data-ui="hud-next"] .hud-card'),
      elixir: boxes('[data-ui="hud-elixir"]'),
      timer: boxes('[data-ui="hud-timer"]'),
      arena: boxes('[data-ui="arena"]'),
    };
  });
}

async function waitForCardFrameTick(frame, moduleUrl, minimum = 1) {
  let tick = 0;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    tick = await cardFrameTick(frame, moduleUrl);
    if (tick >= minimum) return tick;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return tick;
}

function pngBufferEvidence(png) {
  return Object.freeze({
    height: png.readUInt32BE(20),
    sha256: createHash("sha256").update(png).digest("hex"),
    width: png.readUInt32BE(16),
  });
}

function assertExactSessionBytes(actual, expected, label) {
  const hash = (value) => createHash("sha256").update(value).digest("hex");
  assert.ok(actual === expected,
    `${label}: session byte mismatch; expected length=${expected.length} sha256=${hash(expected)}; ` +
    `actual length=${actual.length} sha256=${hash(actual)}`);
}

function mapArenaBoundsIntoPage(frameDiagnostics, pageDiagnostics) {
  const arena = frameDiagnostics.boxesAfter.arena;
  const iframe = pageDiagnostics.boxesAfter.iframe;
  if (!arena || !iframe || frameDiagnostics.viewport.width <= 0 ||
      frameDiagnostics.viewport.height <= 0) {
    throw new TypeError("arena viewport coverage requires measured iframe and arena bounds");
  }
  const scaleX = iframe.width / frameDiagnostics.viewport.width;
  const scaleY = iframe.height / frameDiagnostics.viewport.height;
  return Object.freeze({
    arena: Object.freeze({
      left: iframe.left + arena.left * scaleX,
      top: iframe.top + arena.top * scaleY,
      right: iframe.left + arena.right * scaleX,
      bottom: iframe.top + arena.bottom * scaleY,
    }),
    scaleX,
    scaleY,
    viewport: pageDiagnostics.viewport,
  });
}

function arenaFitsPageViewport(coverage) {
  return coverage.arena.left >= 0 && coverage.arena.top >= 0 &&
    coverage.arena.right <= coverage.viewport.width &&
    coverage.arena.bottom <= coverage.viewport.height;
}

async function waitForFiniteLayoutTransitions(frame, {
  controllerUrl = null,
  expectedSessionBytes = null,
  expectedTick = null,
  phase,
} = {}) {
  return frame.evaluate(async ({ controllerUrl: entryUrl, expectedSessionBytes: expectedBytes,
    expectedTick: tick, phase: label }) => {
    const layoutProperties = /^(?:transform|translate|scale|rotate|left|right|top|bottom|inset(?:Block|Inline)?(?:Start|End)?|(?:min|max)?(?:width|height)|margin(?:Block|Inline)?(?:Start|End)?|padding(?:Block|Inline)?(?:Start|End)?|border(?:Top|Right|Bottom|Left)?Width|fontSize|lineHeight|flexBasis|gridTemplate(?:Columns|Rows)|(?:row|column)?Gap)$/iu;
    const describeAnimation = (animation) => {
      const effect = animation.effect;
      const target = effect?.target;
      const keyframes = effect && "getKeyframes" in effect ? effect.getKeyframes() : [];
      const properties = [...new Set(keyframes.flatMap((frame) => Object.keys(frame)
        .filter((key) => !["composite", "easing", "offset"].includes(key))))];
      const timing = effect?.getTiming?.() ?? null;
      const targetLabel = target instanceof Element
        ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ""}` +
          `${typeof target.className === "string" && target.className.trim()
            ? `.${target.className.trim().split(/\\s+/u).join(".")}` : ""}`
        : null;
      return {
        currentTime: animation.currentTime,
        duration: timing?.duration ?? null,
        iterations: timing?.iterations ?? null,
        keyframes: keyframes.map((frame) => Object.fromEntries(properties
          .filter((property) => property in frame).map((property) => [property, frame[property]]))),
        playState: animation.playState,
        properties,
        target: targetLabel,
        transitionProperty: animation.transitionProperty ?? null,
        type: animation.constructor.name,
      };
    };
    const allAnimations = () => [...document.getAnimations()];
    const isFiniteLayoutTransition = (animation) => {
      if (animation.constructor.name !== "CSSTransition" ||
          !["running", "pending"].includes(animation.playState)) return false;
      const timing = animation.effect?.getTiming?.();
      if (!timing || !Number.isFinite(timing.duration) || timing.iterations === Infinity) return false;
      const properties = describeAnimation(animation).properties;
      return properties.some((property) => layoutProperties.test(property));
    };
    const rect = (selector) => {
      const node = document.querySelector(selector);
      if (!node) return null;
      const { x, y, width, height, top, right, bottom, left } = node.getBoundingClientRect();
      return { x, y, width, height, top, right, bottom, left };
    };
    const paintTwoFrames = () => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)));
    await paintTwoFrames();
    const controller = entryUrl === null
      ? null : (await import(entryUrl)).arenaHudController;
    const sessionBytesBefore = controller?.session.serialize() ?? null;
    const tickBefore = controller?.session.state.tick ?? null;
    if (expectedBytes !== null && sessionBytesBefore !== expectedBytes) {
      throw new Error(`${label}: session bytes differ from the contact checkpoint before layout settlement`);
    }
    if (tick !== null && tickBefore !== tick) {
      throw new Error(`${label}: session tick ${tickBefore} differs from contact checkpoint tick ${tick}`);
    }
    const boxesBefore = {
      arena: rect('[data-ui="arena"]'),
      battleShell: rect(".battle-shell"),
      combatFrame: rect(".combat-frame"),
      iframe: rect("[data-battle-frame-slot] iframe"),
      stormkite: rect('.combat-marker[data-kind="stormkite"][data-side="south"]'),
      stormkiteHop: rect('.combat-effect-impact[data-kind="contact"][data-effect-key^="stormkite-chain-hop:"]'),
    };
    const runningBefore = allAnimations().filter((animation) =>
      ["running", "pending"].includes(animation.playState)).map(describeAnimation);
    const deadline = performance.now() + 1_500;
    const awaitedTransitions = [];
    for (;;) {
      const transitions = allAnimations().filter(isFiniteLayoutTransition);
      if (transitions.length === 0) break;
      awaitedTransitions.push(...transitions.map(describeAnimation));
      const remaining = deadline - performance.now();
      if (remaining <= 0) {
        throw new Error(`${label}: finite layout transitions did not settle within 1500ms: ` +
          JSON.stringify(transitions.map(describeAnimation)));
      }
      let timeoutHandle;
      const settled = await Promise.race([
        Promise.all(transitions.map((animation) => animation.finished.catch(() => null)))
          .then(() => true),
        new Promise((resolve) => {
          timeoutHandle = setTimeout(() => resolve(false), remaining);
        }),
      ]);
      clearTimeout(timeoutHandle);
      if (!settled) {
        throw new Error(`${label}: finite layout transitions did not settle within 1500ms: ` +
          JSON.stringify(transitions.map(describeAnimation)));
      }
    }
    await paintTwoFrames();
    const boxesAfter = {
      arena: rect('[data-ui="arena"]'),
      battleShell: rect(".battle-shell"),
      combatFrame: rect(".combat-frame"),
      iframe: rect("[data-battle-frame-slot] iframe"),
      stormkite: rect('.combat-marker[data-kind="stormkite"][data-side="south"]'),
      stormkiteHop: rect('.combat-effect-impact[data-kind="contact"][data-effect-key^="stormkite-chain-hop:"]'),
    };
    const sessionBytesAfter = controller?.session.serialize() ?? null;
    const tickAfter = controller?.session.state.tick ?? null;
    if (expectedBytes !== null && sessionBytesAfter !== expectedBytes) {
      throw new Error(`${label}: session bytes differ from the contact checkpoint after layout settlement`);
    }
    if (tick !== null && tickAfter !== tick) {
      throw new Error(`${label}: session tick ${tickAfter} differs from contact checkpoint tick ${tick}`);
    }
    return {
      awaitedTransitions,
      boxesAfter,
      boxesBefore,
      frameScale: document.documentElement.dataset.combatFrameScale ?? null,
      phase: label,
      runningAfter: allAnimations().filter((animation) =>
        ["running", "pending"].includes(animation.playState)).map(describeAnimation),
      runningBefore,
      sessionBytesAfter: sessionBytesAfter === null ? null : {
        matchesCheckpoint: expectedBytes === null || sessionBytesAfter === expectedBytes,
        length: sessionBytesAfter.length,
      },
      sessionBytesBefore: sessionBytesBefore === null ? null : {
        matchesCheckpoint: expectedBytes === null || sessionBytesBefore === expectedBytes,
        length: sessionBytesBefore.length,
      },
      sessionBytesStable: sessionBytesBefore === sessionBytesAfter,
      tickAfter,
      tickBefore,
      viewport: { devicePixelRatio, height: innerHeight, width: innerWidth },
      expectedTick: tick,
      tickMatchesCheckpoint: tick === null || tickAfter === tick,
    };
  }, { controllerUrl, expectedSessionBytes, expectedTick, phase });
}

test("player shell renders roster-derived cards and launches a paused shared battle frame", {
  timeout: 120_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "app-shell-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });
  const manifestBytes = await readFile(join(releaseRoot, "release-manifest.json"));
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const manifestSha256 = createHash("sha256").update(manifestBytes).digest("hex");
  assert.deepEqual(manifest.entrypoints, ["public/index.html"]);
  assert.ok(manifest.standaloneModules.includes("src/rl/environment.js"),
    "the configured RL module remains a standalone release entry");
  assert.ok(manifest.standaloneModules.includes(ARENA_CONTROLLER_MODULE),
    "the live arena controller is preserved as a standalone release module");
  assert.ok(manifest.files.some(({ path }) => path === "public/ui-arena-shell.html"),
    "the directly mounted arena remains part of the shipped release");

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  const address = await serverAddress(server.stdout);
  const origin = `http://${address.host}:${address.port}`;
  const arenaControllerUrl = new URL(`/${ARENA_CONTROLLER_MODULE}`, origin).href;
  const { chromium } = await import(PLAYWRIGHT);
  const browser = await chromium.launch({ executablePath: CHROME, headless: true });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 }, deviceScaleFactor: 1 });
  let cardPortraitEvidence = null;
  const questionDisclosureEvidence = [];
  const stormkiteLayoutEvidence = [];
  const recordStormkiteLayout = (phase, diagnostics) => {
    stormkiteLayoutEvidence.push({ diagnostics, phase });
    writeFileSync(join(ARTIFACTS, "stormkite-r25-layout-diagnostics.json"),
      `${JSON.stringify(stormkiteLayoutEvidence, null, 2)}\n`);
  };
  const failures = [];
  const requests = new Set();
  page.on("pageerror", (error) => failures.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(message.text());
  });
  page.on("requestfailed", (request) => failures.push(`${request.url()}: ${request.failure()?.errorText}`));
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin === origin && response.status() >= 200 && response.status() < 400) {
      requests.add(url.pathname.slice(1));
    }
  });

  try {
    assert.equal(EXPECTED_DEFAULT_ROSTER_IDS.length, 8,
      "the independently expected default roster remains exactly eight cards");
    assert.deepEqual(PLAYABLE_CARD_IDS, EXPECTED_DEFAULT_ROSTER_IDS,
      "the source playable roster matches the independently expected default eight");
    assert.deepEqual(EDITABLE_DECK_CARD_IDS,
      [...EXPECTED_DEFAULT_ROSTER_IDS, ...EXPECTED_INDIVIDUAL_PORTRAIT_IDS
        .filter((id) => id !== "squall-orb" && id !== "ember-basin")],
    "the independently expected troop collection contains the completed source roster");
    assert.deepEqual(EDITABLE_MIXED_DECK_CARD_IDS, EXPECTED_COLLECTION_IDS,
      "the editable mixed collection preserves the 8-card default and admits each supported choice");
    assert.equal(EXPECTED_COLLECTION_IDS.length, EXPECTED_COLLECTION_COUNT,
      "the expected mixed editable collection count matches its admitted card identities");
    await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.equal(await page.title(), "Moss & Ember — Card battler");
    assert.equal(await page.locator(".app-nav [data-nav-to]").count(), 4);
    assert.equal(await page.locator("#how-to-title").innerText(), "How to play");
    const guide = await page.locator(".how-to-list").innerText();
    for (const phrase of ["elixir", "click or tap", "eight cards", "four-card hand", "crowns"]) {
      assert.match(guide.toLocaleLowerCase("en"), new RegExp(phrase, "u"));
    }
    assert.equal(await page.locator("[data-deck-size]").first().innerText(), "8");
    assert.equal(await page.locator("[data-average-cost]").first().innerText(), "3.13");
    assert.equal(await page.locator("[data-home-deck] [data-card-id]").count(), 8);
    await page.screenshot({ path: join(ARTIFACTS, "phone-home-720x1280.png"), fullPage: true });

    const cardsTab = page.locator('[data-nav-to="cards"]');
    await cardsTab.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(),
      EXPECTED_COLLECTION_COUNT);
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Coilblade");
    const buriedCoilChoice = page.locator('[data-card-grid] [data-card-id="buried-coil"]');
    assert.equal(await buriedCoilChoice.count(), 1,
      "the admitted defensive structure remains an editable collection choice");
    await buriedCoilChoice.click();
    assert.equal(await page.locator("[data-card-detail] h2").innerText(), "Buried Coil");
    assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), 1,
      "Buried Coil uses its typed structure projection");
    const buriedCoilProfile = projectSessionNonUnitBattleCard("buried-coil").buildingRuntime;
    assert.equal(buriedCoilProfile.targetMode, "air_and_ground",
      "the accepted runtime profile retains its canonical air-and-ground target mode");
    assert.equal(buriedCoilProfile.areaDamageRadiusMillitiles, null,
      "the accepted runtime profile has no splash radius");
    assert.equal(buriedCoilProfile.policy.disposition, "question",
      "the defensive building profile remains provisional for historical comparison");
    assert.deepEqual(await renderedProfiles(page), [{
      Cost: "4 elixir",
      Health: `${format(buriedCoilProfile.hitpoints)} (QUESTION)`,
      Damage: `${format(buriedCoilProfile.damage)} per attack (QUESTION)`,
      Deploy: `${format(buriedCoilProfile.deployTicks / 60)} s (QUESTION)`,
      "First hit": `${format(buriedCoilProfile.firstHitTicks / 60)} s (QUESTION)`,
      "Hit speed": `${format(buriedCoilProfile.hitSpeedTicks / 60)} s (QUESTION)`,
      Lifetime: `${format(buriedCoilProfile.lifetimeTicks / 60)} s (QUESTION)`,
      Range: `${format(buriedCoilProfile.maxRangeMillitiles / 1_000)} tiles (QUESTION)`,
      "Splash radius": "None (QUESTION)",
      Targets: "ground and air (QUESTION)",
    }], "Buried Coil detail matches its canonical provisional defensive profile");
    const buriedCoilDescription = await page.locator("[data-card-detail] .detail-description").innerText();
    assert.equal(buriedCoilDescription,
      "Stationary defensive structure · single-target attacks against ground and air targets. Its combat profile is QUESTION; shown combat values remain provisional.",
      "Buried Coil summary follows its current single-target ground-and-air profile");
    assert.doesNotMatch(buriedCoilDescription, /splash damage|not available/iu,
      "Buried Coil summary does not invent splash damage or unavailable targets");
    await page.keyboard.press("Escape");

    for (const card of [...createPlayableRoster(),
      ...EDITABLE_MIXED_DECK_CARD_IDS
        .filter((id) => !EXPECTED_DEFAULT_ROSTER_IDS.includes(id) &&
          id !== "squall-orb" && id !== "ember-basin" && id !== "buried-coil" &&
          id !== "aether-well")
        .map((id) => projectSessionTroopBattleCard(id)),
      projectSessionNonUnitBattleCard("squall-orb"),
      projectSessionNonUnitBattleCard("ember-basin"),
      projectSessionNonUnitBattleCard("aether-well")]) {
      const questionReceipts = questionReceiptsForCard(card);
      const cardButton = page.locator(`[data-card-grid] [data-card-id="${card.id}"]`);
      await cardButton.click();
      assert.equal(await page.locator("[data-card-detail] h2").innerText(), card.displayName);
      assert.equal(await page.locator("[data-card-detail] .detail-cost").innerText(), String(card.cost));
      const detailPortrait = await renderedDetailPortrait(page);
      const expectedPortrait = getCardPortrait(card.id);
      assert.equal(detailPortrait?.cardId ?? null,
        expectedPortrait === null ? null : card.id,
      `${card.displayName} detail portrait matches its registered portrait availability`);
      if (expectedPortrait !== null) {
        assert.ok(detailPortrait.image.decoded && detailPortrait.image.visible &&
          detailPortrait.image.bounds.width > 0 && detailPortrait.image.bounds.height > 0,
        `${card.displayName} detail portrait decodes and renders: ${JSON.stringify(detailPortrait.image)}`);
        assert.equal(detailPortrait.image.src,
          await cardButton.locator(".card-art-image").getAttribute("src"),
        `${card.displayName} details keep the collection's registered portrait mapping`);
      }
      if (card.kind === "effect") {
        assert.match(await page.locator("[data-card-detail] .detail-description").innerText(),
          /center-cast area spell/iu);
        assert.match(await page.locator("[data-card-detail] .detail-description").innerText(),
          /estimated 2\.5-tile radius/u);
        const spellProfile = await page.locator("[data-card-detail] .spell-profile").innerText();
        assert.match(spellProfile, /RADIUS\s+2\.5 tiles \(estimate\)/u);
        assert.match(spellProfile, /TARGETS\s+ground and air \(estimate\)/u);
        assert.match(spellProfile, /CROWN TOWERS\s+30% \(207 damage per cast\) \(estimate\)/u);
        assert.match(await page.locator("[data-card-detail] .spell-profile").innerText(),
          /Projectile flight and knockback are not simulated/u);
        assert.doesNotMatch(await page.locator("[data-card-detail] .spell-profile").innerText(),
          /QUESTION|confidence/u);
        await page.screenshot({ path: join(ARTIFACTS, "phone-squall-orb-details-720x1280.png"),
          fullPage: true });
      } else if (card.kind === "structure" && card.id === "ember-basin") {
        const profile = card.buildingRuntime;
        const suffix = " (QUESTION)";
        const expectedProfile = {
          Cost: `${format(card.cost)} elixir`,
          Health: `${format(profile.hitpoints)}${suffix}`,
          Damage: `${format(profile.damage)} per attack${suffix}`,
          Deploy: `${format(profile.deployTicks / 60)} s${suffix}`,
          "First hit": `${format(profile.firstHitTicks / 60)} s${suffix}`,
          "Hit speed": `${format(profile.hitSpeedTicks / 60)} s${suffix}`,
          Lifetime: `${format(profile.lifetimeTicks / 60)} s${suffix}`,
          Range: `${format(profile.maxRangeMillitiles / 1_000)} tiles${suffix}`,
          "Splash radius": `${format(profile.areaDamageRadiusMillitiles / 1_000)} tiles${suffix}`,
          Targets: `ground${suffix}`,
        };
        assert.deepEqual(await renderedProfiles(page), [expectedProfile],
          "Ember Basin details display the shared structure profile and keep combat fields QUESTION");
        assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), 1);
        assert.equal(await page.locator("[data-card-detail] .detail-description").innerText(),
          "Stationary defensive structure · splash damage against ground targets within a 1-tile radius. Its combat profile is QUESTION; shown combat values remain provisional.",
          "Ember Basin keeps the accepted ground splash profile and provisional confidence");
        assert.match(await page.locator("[data-card-detail] .unit-profile").innerText(),
          /Cost is source backed; combat values are provisional profile estimates/u);
        assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
          "The Ember Basin stands where the creek turns, its copper lip warmed by emberseeds carried down from the Moss & Ember workshop. At dusk, twin braces hold its long copper-ribbed launch channel above the water, ready to turn any unwelcome visitor away.");
      } else if (card.id === "aether-well") {
        await assertAetherWellDetails(page);
      } else if (card.kind === "structure") {
        assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), 1,
          `${card.displayName} keeps its typed structure profile`);
        assert.match(await page.locator("[data-card-detail] .unit-profile").innerText(),
          /QUESTION/u, `${card.displayName} keeps provisional combat values visible`);
      } else {
        const profiles = await renderedProfiles(page);
        const expectedProfiles = card.entities.map((entity) =>
          expectedStats(entity, questionReceipts));
        if (card.id === "stormkite") expectedProfiles.push(expectedStormkiteChainStats());
        assert.deepEqual(profiles, expectedProfiles,
          `${card.displayName} runtime facts and canonical field-question disclosures`);
        assert.equal(await page.locator("[data-card-detail] .unit-profile").count(),
          card.entities.length + (card.id === "stormkite" ? 1 : 0));
        const detailDescription = await page.locator("[data-card-detail] .detail-description").innerText();
        const classificationProfiles = await page.locator("[data-card-detail] .unit-profile > p").allInnerTexts();
        for (const [index, entity] of card.entities.entries()) {
          if (entity.layerPolicy?.kind !== "question" && entity.deliveryPolicy?.kind !== "question" &&
              !(entity.meleeAreaPolicy?.authoritative === false &&
                entity.meleeAreaPolicy?.confidence === "question")) continue;
          const expectedClassification = expectedQuestionClassification(entity);
          assert.equal(classificationProfiles[index], expectedClassification,
            `${entity.displayName} profile states its current-game classification and provisional comparison status`);
          assert.ok(detailDescription.includes(expectedClassification),
            `${card.displayName} summary agrees with ${entity.displayName}'s runtime classification`);
        }
        if (Object.hasOwn(EXPECTED_CARD_LORE, card.id)) {
          assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
            EXPECTED_CARD_LORE[card.id], `${card.displayName} shows its original lore`);
        }
        if (card.id === "brackenwheel") {
          questionDisclosureEvidence.push(await assertUnitQuestionDisclosure(
            page, card, questionReceipts, 720, 1_280,
          ));
          const actualSetup = JSON.parse(createEditableGameSessionSetup(
            [...PLAYABLE_CARD_IDS.slice(0, 7), card.id],
          ));
          const actualSetupQuestions = new Map(JSON.parse(actualSetup.battleSetup).questions
            .map((record) => [record.key, record]));
          for (const [, field] of UNIT_DETAIL_STAT_FIELDS) {
            const receipt = unitStatQuestion(card.entities[0], field, questionReceipts);
            if (receipt === null) continue;
            assert.deepEqual(actualSetupQuestions.get(receipt.key), receipt,
              `${field} disclosure uses the receipt included in the selected editable GameSession setup`);
          }
        }
      }
      if (card.id === "briar-band") {
        const components = await page.locator("[data-card-detail] .unit-profile h3").allInnerTexts();
        assert.deepEqual(components, ["3 × Briar Runner", "3 × Briar Darter"]);
        assert.match(await page.locator("[data-card-detail] .detail-description").innerText(),
          /Briar Darters fire ranged attacks/u);
      }
      if (card.id === "stonehauler") {
        assert.equal(await page.locator("[data-card-detail] .unit-profile > p").innerText(),
          expectedQuestionClassification(card.entities[0]));
      }
      await page.keyboard.press("Escape");
      await page.waitForFunction((id) => document.activeElement?.dataset?.cardId === id, card.id);
      assert.equal(await page.evaluate(() => document.activeElement.dataset.cardId), card.id,
        `${card.displayName} remains keyboard reachable after closing details`);
    }

    await page.locator('[data-card-search]').fill("Stonehauler");
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 1);
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").getAttribute("data-card-id"), "stonehauler");
    await page.locator('[data-card-search]').fill("Bulwark");
    assert.match(await page.locator("[data-card-empty]").innerText(), /not in the playable collection yet/u);
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(), 0);
    await page.locator('[data-card-search]').fill("");
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    assert.equal(await page.locator("[data-deck-cards] [data-card-id]").count(), 8);
    assert.match(await page.locator("[data-view-active]").getAttribute("data-view-active"), /deck/u);
    await page.screenshot({ path: join(ARTIFACTS, "phone-deck-720x1280.png"), fullPage: true });

    await page.setViewportSize({ width: 1440, height: 933 });
    await page.locator('[data-nav-to="cards"]').click();
    const desktopPortraits = await page.locator("[data-card-grid] .card-art-image").evaluateAll(
      async (images) => {
        await Promise.all(images.map((image) => image.decode()));
        return images.map((image) => {
          const card = image.closest("[data-card-id]");
          const bounds = image.closest(".card-art-window").getBoundingClientRect();
          return {
            cardId: card?.dataset.cardId,
            cell: image.dataset.portraitCell ?? null,
            src: new URL(image.currentSrc || image.src, document.baseURI).pathname,
            decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
            naturalSize: [image.naturalWidth, image.naturalHeight],
            windowSize: [bounds.width, bounds.height],
          };
        });
      },
    );
    assert.deepEqual(desktopPortraits.map(({ cardId, cell }) => [cardId, cell]),
      EXPECTED_CARD_PORTRAIT_CELLS,
      "the complete mixed collection maps to its atlas and individual painted portraits");
    assert.ok(desktopPortraits.every(({ decoded, naturalSize, windowSize }) => decoded &&
      naturalSize[0] > 0 && naturalSize[1] > 0 && windowSize[0] > 0 && windowSize[1] > 0),
    `every collection portrait decodes and has a visible art window: ${JSON.stringify(desktopPortraits)}`);
    const manifestFileForUrl = (src) => manifest.files.find(({ path }) => path === src.slice(1));
    const manifestAtlasSource = manifest.files.find(({ path }) =>
      path === "public/assets/card-portraits-painted.webp");
    const directPortraits = new Map([
      ["stonehauler", "public/assets/stonehauler-painted.webp"],
      ["thornscouts", "public/assets/thornscouts-painted.webp"],
      ["forgeguard", "public/assets/forgeguard-painted.webp"],
      ["cinder-host", "public/assets/cinder-host-painted.webp"],
      ["ironroot", "public/assets/ironroot-painted.webp"],
      ["sunthread-pair", "public/assets/sunthread-pair-painted.webp"],
      ["duskwing-trio", "public/assets/duskwing-trio-painted.webp"],
      ["gloamwing-cluster", "public/assets/gloamwing-cluster-painted.webp"],
      ["coppershade-flock", "public/assets/coppershade-flock-painted.webp"],
      ["brackenwheel", "public/assets/brackenwheel-portrait-painted.webp"],
      ["stormkite", "public/assets/stormkite-portrait-painted.webp"],
      ["buried-coil", "public/assets/buried-coil-portrait.webp"],
      ["kilnkeeper", "public/assets/kilnkeeper-portrait-painted.webp"],
      ["squall-orb", "public/assets/squall-orb-painted.webp"],
      ["ember-basin", "public/assets/ember-basin-portrait-painted-v2.webp"],
      ["aether-well", "public/assets/aether-well-portrait-painted.webp"],
    ].map(([id, path]) => [id, manifest.files.find((file) => file.path === path)]));
    assert.ok(manifestAtlasSource && [...directPortraits.values()].every(Boolean),
      "the atlas and every individual original portrait are registered in the release manifest");
    const atlasOutputs = desktopPortraits.slice(0, 8).map(({ src }) => manifestFileForUrl(src));
    assert.ok(atlasOutputs.every((file) => file !== undefined),
      `each atlas URL resolves to its exact manifest-listed production output: ${JSON.stringify(desktopPortraits.map(({ src }) => src))}`);
    assert.ok(atlasOutputs.every((file) => file.size === manifestAtlasSource.size &&
      file.sha256 === manifestAtlasSource.sha256),
    "every emitted atlas URL retains the exact registered portrait bytes");
    const directOutputs = new Map(desktopPortraits.filter(({ cell }) => cell === null).map(({ cardId, src }) => {
      const output = manifestFileForUrl(src);
      const source = directPortraits.get(cardId);
      assert.ok(output && source && output.size === source.size && output.sha256 === source.sha256,
        `${cardId}'s emitted URL retains its exact registered portrait bytes`);
      return [cardId, output];
    }));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 1440,
      "the desktop collection does not overflow horizontally");
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[0]), fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    const brackenwheelCard = projectSessionTroopBattleCard("brackenwheel");
    const brackenwheelQuestions = questionReceiptsForCard(brackenwheelCard);
    await page.locator('[data-card-grid] [data-card-id="brackenwheel"]').click();
    const phoneBrackenwheelDisclosure = await assertUnitQuestionDisclosure(
      page, brackenwheelCard, brackenwheelQuestions, 390, 844,
    );
    const phoneQuestionScreenshot = "brackenwheel-phone-question-details-390x844.png";
    await page.screenshot({ path: join(ARTIFACTS, phoneQuestionScreenshot) });
    questionDisclosureEvidence.push({
      ...phoneBrackenwheelDisclosure,
      screenshot: await screenshotEvidence(phoneQuestionScreenshot),
    });
    await page.locator("[data-card-detail] .detail-back").click();
    const phonePortraits = await page.locator("[data-card-grid] .card-art-image").evaluateAll(
      async (images) => {
        await Promise.all(images.map((image) => image.decode()));
        return images.map((image) => ({
          cardId: image.closest("[data-card-id]")?.dataset.cardId,
          decoded: image.complete && image.naturalWidth > 0 && image.naturalHeight > 0,
          window: image.closest(".card-art-window").getBoundingClientRect().toJSON(),
        }));
      },
    );
    assert.deepEqual(phonePortraits.map(({ cardId }) => cardId),
      EXPECTED_CARD_PORTRAIT_CELLS.map(([cardId]) => cardId),
      "every collection portrait remains present on a 390px phone");
    assert.ok(phonePortraits.every(({ decoded, window }) => decoded &&
      window.width > 0 && window.height > 0 && window.right <= 390),
    `all ${EXPECTED_CARD_PORTRAIT_CELLS.length} mapped portraits remain decoded and inside the phone viewport: ${JSON.stringify(phonePortraits)}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390,
      "the phone collection does not overflow horizontally");
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[2]) });
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[3]), fullPage: true });

    cardPortraitEvidence = {
      mapping: desktopPortraits.map(({ cardId, cell, src, decoded, naturalSize }) => ({
        cardId, cell, src, decoded, naturalSize,
      })),
      desktop: { viewport: { width: 1440, height: 933 }, horizontalOverflow: false },
      phone: { viewport: { width: 390, height: 844 }, horizontalOverflow: false },
      assetManifest: {
        sources: { atlas: manifestAtlasSource, direct: Object.fromEntries(directPortraits) },
        outputs: { atlas: atlasOutputs[0], direct: Object.fromEntries(directOutputs) },
      },
    };

    const phoneDetailReviews = [];
    for (const cardId of ["sunthread-pair", "duskwing-trio",
      "gloamwing-cluster", "coppershade-flock", "stormkite"]) {
      await page.locator(`[data-card-grid] [data-card-id="${cardId}"]`).click();
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      const layout = await renderedDetailPortrait(page);
      assert.equal(layout?.cardId, cardId);
      assert.ok(layout.image.decoded && layout.image.visible && layout.image.bounds.width > 0 &&
        layout.image.bounds.height > 0,
      `${cardId} has a decoded portrait in its phone detail panel: ${JSON.stringify(layout.image)}`);
      assert.equal(layout.image.src, layout.collectionImage?.src,
        `${cardId} detail and collection use the same portrait asset`);
      assert.equal(layout.viewport.width, 390);
      assert.equal(layout.documentWidth, 390,
        `${cardId} phone detail has no horizontal page overflow: ${JSON.stringify(layout)}`);
      assert.ok(layout.detail.bounds.x >= 0 && layout.detail.bounds.right <= 390 &&
        layout.detail.scrollWidth <= layout.detail.clientWidth + 1,
      `${cardId} phone detail panel and contents fit horizontally: ${JSON.stringify(layout.detail)}`);
      assert.ok(layout.detailBack?.visible && layout.detailBack.bounds.width >= 44 &&
        layout.detailBack.bounds.height >= 44,
      `${cardId} keeps a visible, usable Cards control on phone`);
      assert.ok(layout.nav.visible && layout.nav.bounds.y >= 0 && layout.nav.bounds.bottom <= 844,
        `${cardId} keeps phone navigation inside the viewport`);
      assert.equal(layout.focusedElementId, "selected-card-title",
        `${cardId} selection moves keyboard focus to its detail heading`);
      assert.equal(layout.idsUnique, true,
        `${cardId} portrait markup does not duplicate document IDs`);
      assert.equal(await page.locator("[data-card-detail] .card-lore p").count(), 1,
        `${cardId} phone detail retains its lore`);
      if (Object.hasOwn(EXPECTED_CARD_LORE, cardId)) {
        assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
          EXPECTED_CARD_LORE[cardId], `${cardId} phone detail keeps its original lore`);
      }
      assert.equal(await page.locator("[data-card-detail] .unit-profile .stat-cell").count(),
        cardId === "stormkite" ? 11 : 7,
        `${cardId} phone detail retains its unit and QUESTION stat cells`);
      if (cardId === "stormkite") {
        assert.equal(await page.locator(".chain-question-profile .stat-cell").count(), 4);
        assert.equal(await page.locator(".chain-question-rules > li").count(), 7);
        assert.deepEqual(await page.locator(".chain-question-rules .stat-flag").allInnerTexts(),
          Array(7).fill("QUESTION"));
        assert.deepEqual(await page.locator(".chain-question-rules > li").evaluateAll((items) =>
          items.map((item) => [item.querySelector("strong").textContent,
            item.querySelector("span").textContent])), [
          ["Target selection", "Hits its first target, then jumps to the nearest enemy it has not hit. Equal-distance ties follow a fixed order."],
          ["Eligible targets", "Alive, targetable ground or air troops and structures."],
          ["Range measurement", "Measured edge to edge, including the boundary."],
          ["Skipped targets", "A target that is dead before selection is skipped."],
          ["Lethal hop", "Defeating a target does not stop the chain; the next jump starts from that target's spot."],
          ["If Stormkite falls", "Defeat on or before the first hit cancels the chain. After that, its remaining jumps continue."],
          ["Impact order", "Ready attacks land before the next jump is resolved."],
        ]);
      }
      const phoneScreenshot = `${cardId}-phone-390x844.png`;
      const fullPhoneScreenshot = `${cardId}-phone-390x844-full.png`;
      await page.screenshot({ path: join(ARTIFACTS, phoneScreenshot) });
      await page.screenshot({ path: join(ARTIFACTS, fullPhoneScreenshot), fullPage: true });
      phoneDetailReviews.push({ cardId, ...layout,
        screenshots: [phoneScreenshot, fullPhoneScreenshot] });
      await page.locator("[data-card-detail] .detail-back").click();
    }

    const phoneAetherDetails = await captureAetherWellDetails(page, 390, 844);

    await page.setViewportSize({ width: 1440, height: 933 });
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.locator('[data-card-grid] [data-card-id="brackenwheel"]').click();
    const desktopBrackenwheelDisclosure = await assertUnitQuestionDisclosure(
      page, brackenwheelCard, brackenwheelQuestions, 1_440, 933,
    );
    const desktopQuestionScreenshot = "brackenwheel-desktop-question-details-1440x933.png";
    await page.screenshot({ path: join(ARTIFACTS, desktopQuestionScreenshot) });
    questionDisclosureEvidence.push({
      ...desktopBrackenwheelDisclosure,
      screenshot: await screenshotEvidence(desktopQuestionScreenshot),
    });
    const desktopDetailReviews = [];
    for (const cardId of ["sunthread-pair", "duskwing-trio",
      "gloamwing-cluster", "coppershade-flock", "stormkite"]) {
      await page.locator(`[data-card-grid] [data-card-id="${cardId}"]`).click();
      const layout = await renderedDetailPortrait(page);
      assert.equal(layout?.cardId, cardId);
      assert.ok(layout.image.decoded && layout.image.visible && layout.image.bounds.width > 0 &&
        layout.image.bounds.height > 0,
      `${cardId} has a decoded portrait in its desktop detail panel`);
      assert.ok(layout.collectionImage?.visible,
        `${cardId} remains visible in the desktop collection beside its detail portrait`);
      assert.equal(layout.image.src, layout.collectionImage.src,
        `${cardId} desktop detail and collection use the same portrait asset`);
      assert.equal(layout.viewport.width, 1440);
      assert.equal(layout.documentWidth, 1440,
        `${cardId} desktop detail has no horizontal page overflow`);
      if (Object.hasOwn(EXPECTED_CARD_LORE, cardId)) {
        assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
          EXPECTED_CARD_LORE[cardId], `${cardId} desktop detail keeps its original lore`);
      }
      assert.ok(layout.detail.bounds.x >= 0 && layout.detail.bounds.right <= 1440 &&
        layout.detail.scrollWidth <= layout.detail.clientWidth + 1,
      `${cardId} desktop detail panel and contents fit horizontally`);
      assert.equal(layout.idsUnique, true,
        `${cardId} keeps document IDs unique while collection and detail portraits are visible`);
      if (cardId === "stormkite") {
        assert.equal(await page.locator(".chain-question-profile .stat-cell").count(), 4);
        assert.equal(await page.locator(".chain-question-rules > li").count(), 7);
        assert.match(await page.locator(".chain-question-profile > p").innerText(),
          /unverified for historical comparison/u);
      }
      const screenshot = `${cardId}-desktop-1440x933.png`;
      await page.screenshot({ path: join(ARTIFACTS, screenshot) });
      desktopDetailReviews.push({ cardId, ...layout, screenshot });
    }
    cardPortraitEvidence.detailReviews = {
      phone: phoneDetailReviews,
      desktop: desktopDetailReviews,
    };

    const desktopAetherDetails = await captureAetherWellDetails(page, 1440, 933);
    cardPortraitEvidence.resourceDetails = {
      phone: phoneAetherDetails,
      desktop: desktopAetherDetails,
    };
    cardPortraitEvidence.questionDisclosure = questionDisclosureEvidence;

    await page.setViewportSize({ width: 1440, height: 933 });
    await page.locator('[data-card-grid] [data-card-id="briar-band"]').click();
    assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), 2);
    await page.screenshot({ path: join(ARTIFACTS, CARD_PORTRAIT_SCREENSHOTS[1]), fullPage: true });
    const detailScreenshotNames = [
      "sunthread-pair-phone-390x844.png",
      "sunthread-pair-phone-390x844-full.png",
      "duskwing-trio-phone-390x844.png",
      "duskwing-trio-phone-390x844-full.png",
      "gloamwing-cluster-phone-390x844.png",
      "gloamwing-cluster-phone-390x844-full.png",
      "coppershade-flock-phone-390x844.png",
      "coppershade-flock-phone-390x844-full.png",
      "sunthread-pair-desktop-1440x933.png",
      "duskwing-trio-desktop-1440x933.png",
      "gloamwing-cluster-desktop-1440x933.png",
      "coppershade-flock-desktop-1440x933.png",
      "aether-well-phone-390x844.png",
      "aether-well-desktop-1440x933.png",
      "brackenwheel-phone-question-details-390x844.png",
      "brackenwheel-desktop-question-details-1440x933.png",
    ];
    cardPortraitEvidence.screenshots = await Promise.all(
      [...CARD_PORTRAIT_SCREENSHOTS, ...detailScreenshotNames].map(screenshotEvidence));

    await page.setViewportSize({ width: 720, height: 1280 });
    await page.locator('[data-nav-to="home"]').click();
    await page.locator('[data-nav-to="cards"]').click();
    await page.locator('[data-card-grid] [data-card-id="briar-band"]').click();
    assert.equal((await page.locator("[data-card-detail] .detail-back").innerText()).replace(/\s+/gu, " ").trim(), "← Cards");
    assert.equal(await page.locator("[data-card-detail] .stat-cell").count(), 14);
    await page.evaluate(() => window.scrollTo(0, 0));
    const phoneDetail = await page.locator("[data-card-detail]").evaluate((detail) => ({
      bottom: detail.getBoundingClientRect().bottom,
      top: detail.getBoundingClientRect().top,
      viewportHeight: window.innerHeight,
    }));
    assert.ok(phoneDetail.top >= 0 && phoneDetail.bottom <= phoneDetail.viewportHeight,
      `phone card details fit in the viewport: ${JSON.stringify(phoneDetail)}`);
    await page.screenshot({ path: join(ARTIFACTS, "phone-card-details-720x1280.png"), fullPage: true });
    await page.locator("[data-card-detail] .detail-back").click();
    await page.locator('[data-nav-to="home"]').click();
    await page.locator('[data-nav-to="battle"]').click();
    const frame = page.frameLocator("[data-battle-frame-slot] iframe");
    await frame.locator('[data-ui="arena"]').waitFor({ state: "attached", timeout: 8_000 });
    const frameBox = await page.locator("[data-battle-frame-slot] iframe").boundingBox();
    assert.ok(frameBox && frameBox.width > 0 && frameBox.height > 0,
      `battle iframe is laid out: ${JSON.stringify(frameBox)}`);
    await frame.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
    await page.waitForFunction(() => document.querySelector("[data-battle-frame-slot] iframe") !== null);
    const child = page.frames().find((candidate) => candidate.url().includes("app-frame=1"));
    assert.ok(child, "Battle mounts the real arena entry inside the shell");
    assert.equal(new URL(child.url()).pathname, "/public/ui-arena-shell.html",
      "Battle runs the packaged HTML entry, not a source-only development route");
    const loadedModuleUrls = await child.evaluate(() =>
      [...document.querySelectorAll('script[type="module"][src]')].map((script) =>
        new URL(script.getAttribute("src"), document.baseURI).href));
    assert.ok(loadedModuleUrls.length > 0 && loadedModuleUrls.every((url) =>
      new URL(url).origin === origin),
    `the shipped iframe bootstraps only from its same-origin release modules: ${JSON.stringify(loadedModuleUrls)}`);
    assert.ok(manifest.files.some(({ path }) => path === ARENA_CONTROLLER_MODULE),
      "the exact controller module imported by the test is present in the release manifest");
    const battleViewport = await child.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      shell: document.querySelector(".battle-shell")?.getBoundingClientRect().toJSON(),
    }));
    assert.deepEqual([battleViewport.width, battleViewport.height], [720, 1280],
      `Battle keeps its original input coordinate space inside a uniformly scaled frame: ${JSON.stringify({ frameBox, battleViewport })}`);
    assert.equal(await child.locator('[data-ui="card-slot"]').count(), 4,
      "the arena keeps four physical card targets");
    assert.equal(await child.locator('[data-ui="hud-hand"] .hud-card').count(), 4,
      "all four cards are mirrored in the player hand");
    const controlLayout = await cardFrameLayout(child);
    const controlBoxes = [...controlLayout.cardSlots, ...controlLayout.hand,
      ...controlLayout.next, ...controlLayout.elixir, ...controlLayout.timer,
      ...controlLayout.arena];
    assert.ok(controlBoxes.every((box) => box.visible && box.left >= 0 && box.top >= 0 &&
      box.left + box.width <= controlLayout.viewport.width + 1 &&
      box.top + box.height <= controlLayout.viewport.height + 1),
    `all four cards, next, elixir, timer, and field fit in the scaled 720x1280 frame: ${JSON.stringify({ controlLayout, frameBox })}`);
    assert.equal(await child.locator("[data-ui='deck-choice-open']").getAttribute("hidden") !== null, true,
      "the product battle uses the standard eight-card lineup");
    const runningTick = await waitForCardFrameTick(child, arenaControllerUrl);
    assert.ok(runningTick > 0, "Home enters and resumes the real Battle session");
    await page.screenshot({ path: join(ARTIFACTS, "phone-battle-720x1280.png") });
    const cardId = await child.locator('[data-ui="card-slot"]').first().getAttribute("data-card-id");
    await child.locator('[data-ui="card-slot"]').first().click();
    assert.equal(await child.locator(`[data-ui="hud-hand"] [data-card-id="${cardId}"]`)
      .getAttribute("data-selected"), "true",
    "a trusted card-slot click selects a card through the scaled iframe");
    await child.evaluate(() => {
      globalThis.__appBattlePointerEvidence = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__appBattlePointerEvidence.push({
          clientX: event.clientX,
          clientY: event.clientY,
          isTrusted: event.isTrusted,
        });
      }, true);
    });
    const arenaBox = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(arenaBox);
    await page.mouse.click(arenaBox.x + arenaBox.width / 2,
      arenaBox.y + arenaBox.height * 0.79);
    let deployed = null;
    for (let attempt = 0; attempt < 120 && deployed === null; attempt += 1) {
      deployed = await cardFrameDeployment(child, cardId, arenaControllerUrl);
      if (deployed === null) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(deployed, `a trusted arena click deploys from the scaled hand into the south field: ${JSON.stringify(await cardFrameDiagnostics(child, arenaControllerUrl))}`);
    assert.equal(deployed.deployment.cardId, cardId);
    assert.ok(deployed.deployment.point.y < 15_000,
      "scaled pointer coordinates preserve the legal south-side placement");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(100);
    const smallFrameGeometry = await page.evaluate(() => {
      const slot = document.querySelector("[data-battle-frame-slot]");
      const iframe = slot?.querySelector("iframe");
      if (!slot || !iframe) return null;
      const box = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
          width: rect.width,
          height: rect.height,
        };
      };
      const slotBox = box(slot);
      const style = getComputedStyle(slot);
      const pixels = (name) => Number.parseFloat(style.getPropertyValue(name)) || 0;
      const borderLeft = pixels("border-left-width");
      const borderRight = pixels("border-right-width");
      const borderTop = pixels("border-top-width");
      const borderBottom = pixels("border-bottom-width");
      const paddingLeft = pixels("padding-left");
      const paddingRight = pixels("padding-right");
      const paddingTop = pixels("padding-top");
      const paddingBottom = pixels("padding-bottom");
      return {
        viewport: { width: innerWidth, height: innerHeight },
        slot: slotBox,
        contentBox: {
          left: slotBox.left + borderLeft + paddingLeft,
          right: slotBox.right - borderRight - paddingRight,
          top: slotBox.top + borderTop + paddingTop,
          bottom: slotBox.bottom - borderBottom - paddingBottom,
        },
        frame: box(iframe),
      };
    });
    const smallFrameBox = smallFrameGeometry?.frame ?? null;
    const smallLayout = await cardFrameLayout(child);
    assert.deepEqual([smallLayout.viewport.width, smallLayout.viewport.height], [720, 1280],
      "small phones retain the source arena coordinate space");
    const { viewport, contentBox, frame: iframeBox } = smallFrameGeometry ?? {};
    assert.ok(viewport?.width === 390 && viewport?.height === 844 &&
      contentBox?.right > contentBox?.left && contentBox?.bottom > contentBox?.top &&
      iframeBox?.width > 0 && iframeBox?.height > 0 &&
      iframeBox.left >= contentBox.left && iframeBox.right <= contentBox.right &&
      iframeBox.top >= contentBox.top && iframeBox.bottom <= contentBox.bottom &&
      iframeBox.left >= 0 && iframeBox.top >= 0 && iframeBox.right <= viewport.width &&
      iframeBox.bottom <= viewport.height,
    `the full arena stays inside the measured 390x844 slot content box and viewport: ${JSON.stringify(smallFrameGeometry)}`);
    const smallControlBoxes = [...smallLayout.cardSlots, ...smallLayout.hand,
      ...smallLayout.next, ...smallLayout.elixir, ...smallLayout.timer,
      ...smallLayout.arena];
    assert.ok(smallControlBoxes.every((box) => box.visible && box.left >= 0 && box.top >= 0 &&
      box.left + box.width <= 720 + 1 && box.top + box.height <= 1280 + 1),
    `all battle controls remain visible on a 390x844 phone: ${JSON.stringify({ smallLayout, smallFrameBox })}`);
    await page.screenshot({ path: join(ARTIFACTS, "phone-small-battle-390x844.png") });
    await page.setViewportSize({ width: 720, height: 1280 });
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.waitForTimeout(100);
    const pausedTick = await cardFrameTick(child, arenaControllerUrl);
    assert.ok(pausedTick >= runningTick, "leaving Battle keeps the same session state");
    await page.waitForTimeout(100);
    assert.equal(await cardFrameTick(child, arenaControllerUrl), pausedTick, "leaving Battle pauses the shared session");
    await page.locator('[data-nav-to="battle"]').click();
    await page.waitForTimeout(220);
    assert.ok(await cardFrameTick(child, arenaControllerUrl) > pausedTick, "Deck returns to the same resumed Battle session");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    const replaceSlot = page.locator('[data-replace-slot="1"]');
    await replaceSlot.focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-replacement-panel]").isVisible(), true,
      "the selected slot opens a clear replacement flow");
    assert.equal(await page.locator("[data-replacement-title]").innerText(),
      "Replace slot 2 · Mossguard");
    assert.deepEqual(await page.locator("[data-replacement-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.replacementCardId)),
    EXPECTED_REPLACEMENT_CARD_IDS,
    "every missing collection card can replace the selected slot");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.replacementCardId),
      "brackenwheel", "the first replacement remains keyboard reachable");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.dataset?.replacementCardId),
      "stonehauler", "the replacement choice is reachable by keyboard");
    await page.keyboard.press("Enter");
    let deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(deckIds.length, 8);
    assert.equal(new Set(deckIds).size, 8, "the deck editor keeps eight unique slots");
    assert.equal(deckIds[1], "stonehauler", "Stonehauler replaces the selected Mossguard slot");
    assert.equal(await page.locator("[data-deck-cards] [data-card-id=\"mossguard\"]").count(), 0);
    const costs = new Map([...createPlayableRoster(), projectSessionTroopBattleCard("stonehauler")]
      .map(({ id, cost }) => [id, cost]));
    const expectedAverage = deckIds.reduce((sum, id) => sum + costs.get(id), 0) / 8;
    assert.equal(await page.locator("[data-average-cost]").first().innerText(), expectedAverage.toFixed(2));
    assert.match(await page.locator("[data-deck-status]").innerText(), /Stonehauler replaced Mossguard/u);
    await page.screenshot({ path: join(ARTIFACTS, "custom-deck-390x844.png"), fullPage: true });

    await page.locator('[data-nav-to="cards"]').click();
    assert.equal(await page.locator("[data-card-grid] [data-card-id]").count(),
      EXPECTED_COLLECTION_COUNT,
      "the collection includes every supported editable choice");
    await page.locator('[data-card-grid] [data-card-id="stonehauler"]').click();
    assert.deepEqual(await renderedProfiles(page),
      [expectedStats(projectSessionTroopBattleCard("stonehauler").entities[0],
        questionReceiptsForCard(projectSessionTroopBattleCard("stonehauler")))],
    "Stonehauler details show the live setup projection");
    assert.equal(await page.locator("[data-card-detail] .detail-cost").innerText(), "5");
    await page.screenshot({ path: join(ARTIFACTS, "custom-card-stonehauler-390x844.png"), fullPage: true });
    await page.locator('.app-nav [data-nav-to="deck"]').click();
    assert.deepEqual(await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId)), deckIds,
    "the selected order survives navigating to collection and back");

    await page.locator('[data-replace-slot="2"]').focus();
    await page.keyboard.press("Enter");
    await page.locator('[data-replacement-card-id="gloamwing-cluster"]').focus();
    await page.keyboard.press("Enter");
    deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(deckIds[2], "gloamwing-cluster",
      "Gloamwing Cluster replaces the selected Copperskiff slot");
    assert.equal(new Set(deckIds).size, 8);
    assert.match(await page.locator("[data-deck-status]").innerText(),
      /Gloamwing Cluster replaced Copperskiff/u);
    await page.screenshot({ path: join(ARTIFACTS, "custom-deck-gloamwing-390x844.png"),
      fullPage: true });

    await page.locator('[data-replace-slot="3"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-replacement-title]").innerText(),
      "Replace slot 4 · Skymaul");
    await page.locator('[data-replacement-card-id="coppershade-flock"]').click();
    deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(deckIds[3], "coppershade-flock",
      "Coppershade Flock replaces the selected Skymaul slot");
    assert.equal(new Set(deckIds).size, 8);
    assert.match(await page.locator("[data-deck-status]").innerText(),
      /Coppershade Flock replaced Skymaul/u);
    const finalDeckCosts = new Map([
      ...createPlayableRoster(),
      ...["stonehauler", "gloamwing-cluster", "coppershade-flock", "stormkite"]
        .map((id) => projectSessionTroopBattleCard(id)),
    ].map(({ id, cost }) => [id, cost]));
    const finalAverageCost = deckIds.reduce((sum, id) => sum + finalDeckCosts.get(id), 0) / 8;
    assert.equal(await page.locator("[data-average-cost]").first().innerText(),
      finalAverageCost.toFixed(2), "the deck summary reflects both admitted air swarms");
    await page.screenshot({ path: join(ARTIFACTS, "custom-deck-coppershade-390x844.png"),
      fullPage: true });

    await page.locator('[data-nav-to="battle"]').click();
    await child.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
    const waitForFrameDeck = async () => child.waitForFunction(async ({ expectedIds, entryUrl }) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.stringify(JSON.parse(arenaHudController.session.serialize()).setup.deck) ===
        JSON.stringify(expectedIds);
    }, { expectedIds: deckIds, entryUrl: arenaControllerUrl }, { timeout: 8_000 });
    await waitForFrameDeck();
    assert.match(await page.locator("[data-battle-label]").innerText(), /CUSTOM DECK/u);
    const frameSetup = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.parse(arenaHudController.session.serialize()).setup;
    }, arenaControllerUrl);
    assert.deepEqual(frameSetup.deck, deckIds,
      "Battle launches the actual selected eight-card setup");
    assert.deepEqual(frameSetup, JSON.parse(createEditableGameSessionSetup(deckIds)),
      "Battle uses the canonical editable setup helper");
    const editableOpeningHand = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return arenaHudController.session.state.decks.south.hand;
    }, arenaControllerUrl);
    assert.ok(editableOpeningHand.includes("gloamwing-cluster"));
    assert.ok(editableOpeningHand.includes("coppershade-flock"),
      "the selected deck opens with Coppershade Flock available to the player");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-gloamwing-390x844.png") });

    await page.evaluate((ids) => {
      document.querySelector("[data-battle-frame-slot] iframe").contentWindow.postMessage({
        active: false,
        channel: "moss-and-ember-battle",
        deckIds: [...ids.slice(0, 7), ids[0]],
      }, window.location.origin);
    }, deckIds);
    await child.evaluate((ids) => window.postMessage({
      active: false,
      channel: "moss-and-ember-battle",
      deckIds: ids,
    }, window.location.origin), deckIds);
    await page.waitForTimeout(100);
    assert.deepEqual(await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.parse(arenaHudController.session.serialize()).setup.deck;
    }, arenaControllerUrl), deckIds, "duplicate IDs and messages from the frame itself cannot replace the deck");

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    const customPausedTick = await cardFrameTick(child, arenaControllerUrl);
    await page.waitForTimeout(100);
    assert.equal(await cardFrameTick(child, arenaControllerUrl), customPausedTick,
      "leaving Battle pauses the custom setup without discarding it");
    await page.locator('[data-nav-to="battle"]').click();
    await waitForFrameDeck();
    const resumedCustomTick = await waitForCardFrameTick(child, arenaControllerUrl, customPausedTick + 1);
    assert.ok(resumedCustomTick > customPausedTick,
      "returning to Battle resumes the same custom setup");

    const gloamwingSlot = child.locator('[data-ui="card-slot"][data-card-id="gloamwing-cluster"]');
    await gloamwingSlot.waitFor({ state: "visible" });
    await gloamwingSlot.click();
    assert.equal(await child.locator('[data-ui="hud-hand"] [data-card-id="gloamwing-cluster"]')
      .getAttribute("data-selected"), "true", "Gloamwing can be selected in the live custom deck");
    const customArena = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(customArena);
    await page.mouse.click(customArena.x + customArena.width / 2,
      customArena.y + customArena.height * 0.79);
    let gloamwingDeployment = null;
    for (let attempt = 0; attempt < 120 && gloamwingDeployment === null; attempt += 1) {
      gloamwingDeployment = await cardFrameDeployment(child, "gloamwing-cluster", arenaControllerUrl);
      if (gloamwingDeployment === null) await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.ok(gloamwingDeployment, "the custom air swarm deploys through the real session input");
    assert.equal(gloamwingDeployment.deployment.cardId, "gloamwing-cluster");
    assert.equal(gloamwingDeployment.deployment.entityIds.length, 5);
    assert.equal(gloamwingDeployment.spend.cost, 2);
    assert.ok(gloamwingDeployment.deployment.point.y < 15_000,
      "Gloamwing placement is on the player's side");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-gloamwing-deployed-390x844.png") });

    const continuation = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.enterManualStepMode();
      const checkpoint = arenaHudController.serialize();
      arenaHudController.stepMany(180);
      const forward = arenaHudController.serialize();
      arenaHudController.restore(checkpoint);
      const restored = arenaHudController.serialize();
      arenaHudController.stepMany(180);
      return {
        checkpoint,
        exactAtRestore: restored === checkpoint,
        forward,
        replayed: arenaHudController.serialize(),
        restoredDeck: JSON.parse(arenaHudController.session.serialize()).setup.deck,
      };
    }, arenaControllerUrl);
    assert.equal(continuation.exactAtRestore, true, "custom browser snapshot restores byte for byte");
    assert.equal(continuation.replayed, continuation.forward,
      "custom battle continuation remains deterministic after restore");
    assert.deepEqual(continuation.restoredDeck, deckIds,
      "restoring a battle snapshot retains all eight selected card IDs");

    const coppershadeBefore = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const state = arenaHudController.session.state;
      return {
        elixir: state.elixir.sides.south.amount,
        hand: state.decks.south.hand,
        sequence: state.decks.south.sequence,
        tick: state.tick,
      };
    }, arenaControllerUrl);
    assert.ok(coppershadeBefore.hand.includes("coppershade-flock"),
      "Gloamwing's deck cycle leaves Coppershade ready in the custom hand");
    await child.evaluate(() => {
      globalThis.__appCoppershadePointerEvidence = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__appCoppershadePointerEvidence.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    const coppershadeSlot = child.locator(
      '[data-ui="card-slot"][data-card-id="coppershade-flock"]');
    await coppershadeSlot.waitFor({ state: "visible" });
    await coppershadeSlot.click();
    assert.equal(await child.locator(
      '[data-ui="hud-hand"] [data-card-id="coppershade-flock"]')
      .getAttribute("data-selected"), "true",
    "Coppershade can be selected from the actual custom battle hand");
    const coppershadeArena = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(coppershadeArena);
    await page.mouse.click(coppershadeArena.x + coppershadeArena.width * 0.5,
      coppershadeArena.y + coppershadeArena.height * 0.79);
    const committedCoppershade = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.stepMany(1);
      const state = arenaHudController.session.state;
      const deployment = arenaHudController.session.replay.find(({ side, type, deployment: value }) =>
        side === "south" && type === "session-deployed" &&
        value.cardId === "coppershade-flock") ?? null;
      const trustedPointer = [...globalThis.__appCoppershadePointerEvidence]
        .reverse().find(({ isTrusted }) => isTrusted) ?? null;
      return {
        deployment,
        elixir: state.elixir.sides.south.amount,
        hand: state.decks.south.hand,
        sequence: state.decks.south.sequence,
        tick: state.tick,
        trustedPointer,
      };
    }, arenaControllerUrl);
    assert.ok(committedCoppershade.deployment,
      "the trusted browser gesture commits a Coppershade deployment");
    assert.equal(committedCoppershade.deployment.spend.cost, 5,
      "Coppershade spends its five elixir in the live session");
    assert.equal(committedCoppershade.deployment.deployment.entityIds.length, 6);
    assert.ok(committedCoppershade.deployment.deployment.point.y < 15_000,
      "the trusted Coppershade deployment is legal on the player's side");
    assert.equal(committedCoppershade.sequence, coppershadeBefore.sequence + 1,
      "Coppershade advances the actual custom deck cycle");
    assert.ok(!committedCoppershade.hand.includes("coppershade-flock"),
      "the played Coppershade leaves the hand after the cycle");
    assert.ok(committedCoppershade.elixir < coppershadeBefore.elixir,
      "the Coppershade deployment lowers the player's elixir");
    assert.equal(committedCoppershade.trustedPointer?.isTrusted, true,
      "Coppershade's arena placement came from a trusted Chrome pointer event");
    await page.screenshot({ path: join(ARTIFACTS,
      "custom-battle-coppershade-deployed-390x844.png") });

    const coppershadeProjectileEvidence = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      let state = controller.session.state;
      const coppershadeIds = new Set(state.battle.units.filter(({ cardId, side }) =>
        side === "south" && cardId === "coppershade-flock").map(({ id }) => id));
      let projectile = null;
      for (let tick = 0; tick < 360 && projectile === null; tick += 1) {
        controller.stepMany(1);
        state = controller.session.state;
        projectile = state.battle.projectiles.find(({ attackerId }) =>
          coppershadeIds.has(attackerId)) ?? null;
      }
      if (projectile === null) {
        const sourceIds = new Set([...coppershadeIds]);
        return {
          battleTick: state.tick,
          coppershadeUnits: state.battle.units.filter(({ cardId, side }) =>
            side === "south" && cardId === "coppershade-flock").map(({ id, alive, hitpoints,
            position, attack }) => ({ id, alive, hitpoints, position, attack })),
          opposingUnits: state.battle.units.filter(({ side, alive }) =>
            side === "north" && alive).map(({ id, cardId, layer, hitpoints, position }) =>
            ({ id, cardId, layer, hitpoints, position })),
          projectileCount: state.battle.projectiles.length,
          relevantEvents: controller.session.replay.filter((event) =>
            sourceIds.has(event.sourceId) || sourceIds.has(event.attackerId) ||
            (event.type === "death" && sourceIds.has(event.targetId))).slice(-30),
          setupHasProjectileProfiles: Object.hasOwn(
            JSON.parse(controller.session.serialize()).setup, "projectileRuntimeProfiles"),
          projectile: null,
        };
      }
      const attacker = state.battle.units.find(({ id }) => id === projectile.attackerId);
      const target = state.battle.units.find(({ id }) => id === projectile.targetId);
      const checkpoint = controller.serialize();
      const checkpointProjectile = state.battle.projectiles.find(({ id }) => id === projectile.id);
      controller.restore(checkpoint);
      const restored = controller.serialize();
      const restoredProjectile = controller.session.state.battle.projectiles
        .find(({ id }) => id === projectile.id) ?? null;
      controller.stepMany(120);
      const forward = controller.serialize();
      controller.restore(checkpoint);
      controller.stepMany(120);
      return {
        attackerCardId: attacker?.cardId ?? null,
        attackerSide: attacker?.side ?? null,
        checkpointProjectile,
        exactAtRestore: restored === checkpoint,
        impactTick: projectile.impactTick,
        launchTick: projectile.launchTick,
        projectile,
        replayExact: controller.serialize() === forward,
        restoredProjectileExact: JSON.stringify(restoredProjectile) ===
          JSON.stringify(checkpointProjectile),
        targetCardId: target?.cardId ?? null,
        targetLayer: target?.layer ?? null,
        targetSide: target?.side ?? null,
      };
    }, arenaControllerUrl);
    assert.ok(coppershadeProjectileEvidence.projectile,
      `Coppershade launches a real projectile in the browser session: ${JSON.stringify({
        before: coppershadeBefore,
        deployment: committedCoppershade.deployment?.deployment,
        projectileEvidence: coppershadeProjectileEvidence,
      })}`);
    assert.equal(coppershadeProjectileEvidence.attackerCardId, "coppershade-flock");
    assert.equal(coppershadeProjectileEvidence.attackerSide, "south");
    assert.equal(coppershadeProjectileEvidence.targetSide, "north");
    assert.equal(coppershadeProjectileEvidence.targetLayer, "air",
      "the browser projectile targets a legal airborne opponent");
    assert.ok(coppershadeProjectileEvidence.impactTick >
      coppershadeProjectileEvidence.launchTick,
    "the Coppershade projectile is observed in flight before impact");
    assert.equal(coppershadeProjectileEvidence.exactAtRestore, true,
      "restoring the in-flight Coppershade projectile reproduces exact session bytes");
    assert.equal(coppershadeProjectileEvidence.restoredProjectileExact, true,
      "the airborne target and projectile persist exactly across restore");
    assert.equal(coppershadeProjectileEvidence.replayExact, true,
      "the restored Coppershade projectile continuation replays exactly");
    await page.screenshot({ path: join(ARTIFACTS,
      "custom-battle-coppershade-projectile-390x844.png") });

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.locator('[data-replace-slot="3"]').focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("[data-replacement-title]").innerText(),
      "Replace slot 4 · Coppershade Flock");
    await page.locator('[data-replacement-card-id="stormkite"]').click();
    deckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(deckIds[3], "stormkite",
      "Stormkite replaces Coppershade Flock in a new saved eight-card deck");
    assert.equal(new Set(deckIds).size, 8);
    assert.match(await page.locator("[data-deck-status]").innerText(),
      /Stormkite replaced Coppershade Flock/u);
    await page.screenshot({ path: join(ARTIFACTS, "custom-deck-stormkite-390x844.png"),
      fullPage: true });
    await page.locator('[data-nav-to="battle"]').click();
    await waitForFrameDeck();
    const stormkiteOpening = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return {
        hand: arenaHudController.session.state.decks.south.hand,
        setup: JSON.parse(arenaHudController.session.serialize()).setup,
      };
    }, arenaControllerUrl);
    assert.deepEqual(stormkiteOpening.setup, JSON.parse(createEditableGameSessionSetup(deckIds)),
      "the new Stormkite battle mounts the selected canonical deck setup");
    assert.ok(stormkiteOpening.hand.includes("stormkite"),
      "Stormkite is available in the new custom match opening hand");

    const stormkiteSlot = child.locator('[data-ui="card-slot"][data-card-id="stormkite"]');
    await stormkiteSlot.waitFor({ state: "visible" });
    await stormkiteSlot.click();
    assert.equal(await child.locator(
      '[data-ui="hud-hand"] [data-card-id="stormkite"]').getAttribute("data-selected"),
    "true", "the selected Stormkite deck card is playable from the live hand");
    await child.evaluate(() => {
      globalThis.__appStormkitePointerEvidence = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__appStormkitePointerEvidence.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
    });
    const stormkiteArena = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(stormkiteArena);
    await page.mouse.click(stormkiteArena.x + stormkiteArena.width * 0.5,
      stormkiteArena.y + stormkiteArena.height * 0.79);
    const committedStormkite = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.stepMany(1);
      const replay = controller.session.replay;
      const deployment = replay.find(({ side, type, deployment: value }) =>
        side === "south" && type === "session-deployed" &&
        value.cardId === "stormkite") ?? null;
      const art = document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      );
      const notice = document.querySelector('[data-ui="policy-question"]');
      const pointer = [...globalThis.__appStormkitePointerEvidence]
        .reverse().find(({ isTrusted }) => isTrusted) ?? null;
      return {
        art: art === null ? null : {
          action: art.dataset.spriteAction,
          bodyCssPixels: Number(art.dataset.bodyCssPixels),
          direction: art.dataset.spriteDirection,
          href: art.querySelector("image")?.getAttribute("href") ?? null,
          pivot: art.dataset.pivot,
          width: art.style.width,
        },
        deployment,
        policyNotice: notice?.textContent ?? "",
        pointer,
        setup: JSON.parse(controller.session.serialize()).setup,
      };
    }, arenaControllerUrl);
    assert.ok(committedStormkite.deployment,
      "the trusted arena input commits Stormkite through the canonical GameSession");
    assert.equal(committedStormkite.deployment.spend.cost,
      projectSessionTroopBattleCard("stormkite").cost);
    assert.ok(committedStormkite.deployment.deployment.point.y < 15_000,
      "the player Stormkite is placed on the legal south side");
    assert.equal(committedStormkite.pointer?.isTrusted, true,
      "Stormkite's arena placement came from a trusted Chrome pointer event");
    assert.equal(committedStormkite.art?.bodyCssPixels, 13);
    assert.equal(committedStormkite.art?.pivot, "32:54");
    assert.match(committedStormkite.art?.href ?? "", /stormkite-battle-sprite\.png$/u);
    assert.match(committedStormkite.policyNotice, /Stormkite chain hops: QUESTION/u);
    assert.ok(committedStormkite.setup.projectileRuntimeProfiles);
    assert.equal(JSON.parse(committedStormkite.setup.battleSetup).chainQuestionPolicy.cardId,
      "stormkite");
    const stormkiteNoticeLayout = async (viewportLabel, expectedWidth) => {
      const details = child.locator(
        '[data-ui="policy-question"] details.policy-question-details',
      );
      const summary = details.locator("summary");
      const metrics = await child.evaluate(() => {
        const notice = document.querySelector('[data-ui="policy-question"]');
        const summary = notice?.querySelector("summary");
        const rect = (node) => {
          if (!node) return null;
          const { x, y, width, height, top, right, bottom, left } =
            node.getBoundingClientRect();
          return { bottom, height, left, right, top, width, x, y };
        };
        const fontPx = Number.parseFloat(getComputedStyle(notice).fontSize);
        const frameScale = Number(document.documentElement.dataset.combatFrameScale);
        return {
          arena: rect(document.querySelector('[data-ui="arena"]')),
          audio: rect(document.querySelector('[data-ui="audio-toggle"]')),
          fontPx,
          frameScale,
          crowns: rect(document.querySelector('[data-ui="hud-crowns"]')),
          hudTimer: rect(document.querySelector('[data-ui="hud-timer"]')),
          notice: rect(notice),
          parentFontPx: fontPx * frameScale,
          summary: rect(summary),
          summaryText: summary?.textContent ?? "",
          viewport: { height: innerHeight, width: innerWidth },
        };
      });
      metrics.parentViewport = page.viewportSize();
      assert.equal(metrics.parentViewport.width, expectedWidth,
        `${viewportLabel} policy notice uses the requested real app viewport`);
      assert.equal(metrics.viewport.width, 720,
        `${viewportLabel} policy notice is measured in the canonical 720px arena frame`);
      assert.ok(metrics.parentFontPx >= 12,
        `${viewportLabel} policy notice text is at least 12 parent CSS px: ` +
          JSON.stringify(metrics));
      assert.match(metrics.summaryText, /QUESTION/u);
      assert.match(metrics.summaryText, /Stormkite/u);
      assert.ok(metrics.notice && metrics.summary && metrics.audio && metrics.arena &&
        metrics.hudTimer && metrics.crowns,
      `${viewportLabel} notice, summary, timer, crowns, sound control, and arena are rendered`);
      const overlaps = (left, right) => left.left < right.right &&
        left.right > right.left && left.top < right.bottom && left.bottom > right.top;
      assert.equal(overlaps(metrics.notice, metrics.audio), false,
        `${viewportLabel} closed notice does not overlap the sound control: ` +
          JSON.stringify(metrics));
      assert.equal(overlaps(metrics.notice, metrics.hudTimer), false,
        `${viewportLabel} closed notice does not overlap the visible timer: ` +
          JSON.stringify(metrics));
      assert.equal(overlaps(metrics.notice, metrics.crowns), false,
        `${viewportLabel} closed notice does not overlap the crown count: ` +
          JSON.stringify(metrics));
      return metrics;
    };
    const stormkiteSummary = child.locator(
      '[data-ui="policy-question"] details.policy-question-details summary',
    );
    const readPolicyFrameGeometry = () => child.evaluate(() => {
      const rect = (node) => {
        if (!node) return null;
        const { x, y, width, height, top, right, bottom, left } = node.getBoundingClientRect();
        return { bottom, height, left, right, top, width, x, y };
      };
      return {
        arena: rect(document.querySelector('[data-ui="arena"]')),
        bodyScroll: { left: document.body.scrollLeft, top: document.body.scrollTop },
        battleShell: rect(document.querySelector(".battle-shell")),
        documentScroll: { left: document.documentElement.scrollLeft,
          top: document.documentElement.scrollTop },
      };
    });
    const assertPolicyFrameDidNotScroll = (before, after, label) => {
      assert.deepEqual(after.bodyScroll, before.bodyScroll,
        `${label} does not move the arena body scroll position`);
      assert.deepEqual(after.documentScroll, before.documentScroll,
        `${label} does not move the document scroll position`);
      assert.deepEqual(after.battleShell, before.battleShell,
        `${label} keeps the shell in place`);
      assert.deepEqual(after.arena, before.arena,
        `${label} keeps the battle arena in place`);
    };
    assert.match(await stormkiteSummary.textContent(), /QUESTION · Stormkite/u,
      "the compact notice names the affected card");
    const phone390FrameBeforeDisclosure = await readPolicyFrameGeometry();
    await stormkiteSummary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await child.locator(
      '[data-ui="policy-question"] details.policy-question-details',
    ).evaluate((node) => node.open), true,
    "the live match exposes full Stormkite policy details to keyboard users");
    const expandedStormkiteNotice = await child.evaluate(() => {
      const details = document.querySelector(
        '[data-ui="policy-question"] details.policy-question-details',
      );
      const list = details?.querySelector(".policy-question-detail-list");
      const notice = details?.closest('[data-ui="policy-question"]');
      const rect = (node) => {
        if (!node) return null;
        const { top, right, bottom, left, width, height } = node.getBoundingClientRect();
        return { bottom, height, left, right, top, width };
      };
      return {
        cardIds: [...(list?.querySelectorAll(".policy-question-detail-card") ?? [])]
          .map((card) => card.dataset.cardId),
        audio: rect(document.querySelector('[data-ui="audio-toggle"]')),
        crowns: rect(document.querySelector('[data-ui="hud-crowns"]')),
        detailsText: list?.textContent ?? "",
        hudTimer: rect(document.querySelector('[data-ui="hud-timer"]')),
        hand: rect(document.querySelector('[data-ui="hud-hand"]')),
        list: rect(list),
        notice: rect(notice),
        nav: null,
        summary: details?.querySelector("summary")?.textContent ?? "",
      };
    });
    assert.deepEqual(expandedStormkiteNotice.cardIds, ["stormkite"]);
    assert.match(expandedStormkiteNotice.detailsText, /Stormkite chain hops: QUESTION/u);
    assert.ok(expandedStormkiteNotice.list.height > 0,
      "the expanded native disclosure shows its full card policy");
    const expandedOverlaps = (left, right) => left.left < right.right &&
      left.right > right.left && left.top < right.bottom && left.bottom > right.top;
    assert.equal(expandedOverlaps(expandedStormkiteNotice.notice,
      expandedStormkiteNotice.hudTimer), false,
    "expanded QUESTION details do not cover the visible timer");
    assert.equal(expandedOverlaps(expandedStormkiteNotice.notice,
      expandedStormkiteNotice.crowns), false,
    "expanded QUESTION details do not cover the crown count");
    assert.equal(expandedOverlaps(expandedStormkiteNotice.notice,
      expandedStormkiteNotice.audio), false,
    "expanded QUESTION details do not cover the sound control");
    assert.ok(expandedStormkiteNotice.list.bottom < expandedStormkiteNotice.hand.top,
      "the expanded disclosure stays above the hand controls");
    const phone390FrameWhileOpen = await readPolicyFrameGeometry();
    assertPolicyFrameDidNotScroll(phone390FrameBeforeDisclosure, phone390FrameWhileOpen,
      "390×844 keyboard disclosure");
    await page.keyboard.press("Enter");
    assert.equal(await child.locator(
      '[data-ui="policy-question"] details.policy-question-details',
    ).evaluate((node) => node.open), false,
    "the live match closes its policy details with Enter");
    const phone390FrameAfterDisclosure = await readPolicyFrameGeometry();
    assertPolicyFrameDidNotScroll(phone390FrameBeforeDisclosure, phone390FrameAfterDisclosure,
      "390×844 disclosure close");
    await stormkiteSummary.evaluate((node) => node.blur());
    questionDisclosureEvidence.push({
      liveBattle: true,
      phone390: await stormkiteNoticeLayout("390×844", 390),
    });
    await page.screenshot({ path: join(ARTIFACTS,
      "custom-battle-stormkite-deployed-390x844.png") });

    const sessionBeforeContactResize = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return { manualStepModeEntered: arenaHudController.enterManualStepMode(),
        sessionBytes: arenaHudController.session.serialize(),
        tick: arenaHudController.session.state.tick };
    }, arenaControllerUrl);
    assert.equal(sessionBeforeContactResize.manualStepModeEntered, true,
      "the live match enters manual-step mode before the responsive resize barrier");
    await page.setViewportSize({ width: 320, height: 844 });
    const compactPageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "320x844-notice-readability" });
    const compactFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: sessionBeforeContactResize.sessionBytes,
      expectedTick: sessionBeforeContactResize.tick,
      phase: "arena-320x844-notice-readability",
    });
    const phone320FrameBeforeDisclosure = await readPolicyFrameGeometry();
    const compactSummary = child.locator(
      '[data-ui="policy-question"] details.policy-question-details summary',
    );
    await compactSummary.focus();
    await page.keyboard.press("Enter");
    assert.equal(await child.locator(
      '[data-ui="policy-question"] details.policy-question-details',
    ).evaluate((node) => node.open), true,
    "the compact 320×844 viewport opens the native QUESTION details by keyboard");
    const phone320FrameWhileOpen = await readPolicyFrameGeometry();
    assertPolicyFrameDidNotScroll(phone320FrameBeforeDisclosure, phone320FrameWhileOpen,
      "320×844 keyboard disclosure");
    await page.keyboard.press("Enter");
    assert.equal(await child.locator(
      '[data-ui="policy-question"] details.policy-question-details',
    ).evaluate((node) => node.open), false,
    "the compact 320×844 viewport closes the native QUESTION details by keyboard");
    const phone320FrameAfterDisclosure = await readPolicyFrameGeometry();
    assertPolicyFrameDidNotScroll(phone320FrameBeforeDisclosure, phone320FrameAfterDisclosure,
      "320×844 disclosure close");
    await compactSummary.evaluate((node) => node.blur());
    const compactNotice = await stormkiteNoticeLayout("320×844", 320);
    assertExactSessionBytes(await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return arenaHudController.session.serialize();
    }, arenaControllerUrl), sessionBeforeContactResize.sessionBytes,
    "320×844 notice layout preserves exact battle bytes");
    assert.equal(compactPageSettlement.sessionBytesStable, true);
    assert.equal(compactFrameSettlement.sessionBytesStable, true);
    questionDisclosureEvidence.push({
      compact320: compactNotice,
      page: compactPageSettlement,
      arena: compactFrameSettlement,
    });
    await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-question-notice-320x844.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    const return390PageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "390x844-notice-readability-return" });
    const return390FrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: sessionBeforeContactResize.sessionBytes,
      expectedTick: sessionBeforeContactResize.tick,
      phase: "arena-390x844-notice-readability-return",
    });
    assert.equal(return390PageSettlement.sessionBytesStable, true);
    assert.equal(return390FrameSettlement.sessionBytesStable, true);
    await page.setViewportSize({ width: 1440, height: 933 });
    const desktopNotice = await stormkiteNoticeLayout("1440×933", 1440);
    await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-question-notice-desktop-1440x933.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    questionDisclosureEvidence.push({ desktop1440: desktopNotice });
    await page.setViewportSize({ width: 540, height: 960 });
    const contactResizePageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "540x960-resize-before-manual-step" });
    const contactResizeFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: sessionBeforeContactResize.sessionBytes,
      expectedTick: sessionBeforeContactResize.tick,
      phase: "arena-540x960-resize-before-manual-step",
    });
    recordStormkiteLayout("540x960-resize-before-manual-step",
      { arena: contactResizeFrameSettlement, page: contactResizePageSettlement });
    const resizedStormkiteArt = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const art = document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      );
      const marker = art?.closest(".combat-marker");
      const rect = (node) => {
        if (!node) return null;
        const { x, y, width, height, top, right, bottom, left } = node.getBoundingClientRect();
        return { x, y, width, height, top, right, bottom, left };
      };
      return { action: art?.dataset.spriteAction ?? null,
        bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
        frameScale: Number(document.documentElement.dataset.combatFrameScale),
        markerRect: rect(marker),
        rect: rect(art),
        sessionBytes: arenaHudController.session.serialize(),
        tick: arenaHudController.session.state.tick,
        viewport: { height: innerHeight, width: innerWidth }, width: art?.style.width ?? null };
    }, arenaControllerUrl);
    recordStormkiteLayout("540x960-resized-art-before-manual-step", {
      art: { ...resizedStormkiteArt, sessionBytes: undefined },
      arena: contactResizeFrameSettlement,
      page: contactResizePageSettlement,
    });
    assertExactSessionBytes(resizedStormkiteArt.sessionBytes,
      sessionBeforeContactResize.sessionBytes,
      "manual-step contact resize leaves the exact GameSession bytes unchanged");
    assert.equal(resizedStormkiteArt.tick, sessionBeforeContactResize.tick,
      "manual-step contact resize leaves the GameSession tick unchanged");
    const stormkiteContact = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      for (let elapsed = 0; elapsed < 720; elapsed += 1) {
        const events = controller.stepMany(1);
        const art = document.querySelector(
          '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
        );
        const marker = document.querySelector(
          '.combat-marker[data-kind="stormkite"][data-side="south"]',
        );
        const sourceId = Number(marker?.dataset.combatId);
        const hop = events.find((event) => event.type === "chain-hop-settled" &&
          ["pending", "complete"].includes(event.status) &&
          event.lineage?.primaryProjectileIdentity?.sourceId === sourceId);
        if (art?.dataset.spriteAction !== "contact" || !hop) continue;
        const identity = hop.lineage.primaryProjectileIdentity;
        const impactKey = `stormkite-chain-hop:${sourceId}:${identity.attackSequence}:` +
          `${hop.lineage.hopOrdinal}:${hop.tick}`;
        const impact = [...document.querySelectorAll(
          '.combat-effect-impact[data-kind="contact"]',
        )].find((node) => node.dataset.effectKey === impactKey);
        if (!impact) continue;
        const impactBox = impact.getBoundingClientRect();
        const checkpoint = controller.serialize();
        return {
          checkpoint,
          hop: { impactHeight: impactBox.height, impactKey, impactWidth: impactBox.width,
            ownerKind: hop.owner.kind, tick: hop.tick },
          sessionBytes: controller.session.serialize(),
          tick: controller.session.state.tick,
        };
      }
      return null;
    }, arenaControllerUrl);
    assert.ok(stormkiteContact,
      "Stormkite reaches an actual canonical contact in the live browser session");
    const contactPageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "normal-540x960-after-hop-contact" });
    const contactFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-normal-540x960-after-hop-contact",
    });
    const stableStormkiteArt = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const art = document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      );
      const marker = art?.closest(".combat-marker");
      const impact = [...document.querySelectorAll(
        '.combat-effect-impact[data-kind="contact"][data-effect-key^="stormkite-chain-hop:"]',
      )].find((node) => node.getBoundingClientRect().width > 0);
      const rect = (node) => {
        if (!node) return null;
        const { x, y, width, height, top, right, bottom, left } = node.getBoundingClientRect();
        return { x, y, width, height, top, right, bottom, left };
      };
      return { action: art?.dataset.spriteAction ?? null,
        bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
        direction: art?.dataset.spriteDirection ?? null,
        frame: art?.dataset.spriteFrame ?? null,
        frameScale: Number(document.documentElement.dataset.combatFrameScale),
        hop: impact ? { box: rect(impact), key: impact.dataset.effectKey,
          kind: impact.dataset.kind } : null,
        markerRect: rect(marker),
        pivot: art?.dataset.pivot ?? null,
        rect: rect(art),
        sessionBytes: arenaHudController.session.serialize(),
        tick: arenaHudController.session.state.tick,
        viewport: { height: innerHeight, width: innerWidth }, width: art?.style.width ?? null };
    }, arenaControllerUrl);
    recordStormkiteLayout("normal-540x960-contact-art-before-dimension-assertions", {
      art: { ...stableStormkiteArt, sessionBytes: undefined },
      arena: contactFrameSettlement,
      page: contactPageSettlement,
    });
    assertExactSessionBytes(stableStormkiteArt.sessionBytes, stormkiteContact.sessionBytes,
      "stable contact render leaves the exact canonical GameSession bytes unchanged");
    assert.equal(stableStormkiteArt.tick, stormkiteContact.tick);
    assert.equal(stableStormkiteArt.bodyCssPixels, 13,
      "the 540×960 battle frame retains the phone-sized character scale");
    assert.equal(stableStormkiteArt.action, "contact");
    assert.ok(stormkiteContact.hop,
      "the captured contact frame includes a canonical secondary-hop receipt");
    assert.equal(stormkiteContact.hop.tick + 1, stormkiteContact.tick,
      "the flash appears on the exact state tick after the hop commits");
    assert.ok(["unit", "building", "crown-tower"].includes(stormkiteContact.hop.ownerKind));
    assert.equal(stableStormkiteArt.hop?.key, stormkiteContact.hop.impactKey);
    assert.ok(stableStormkiteArt.hop?.box.width > 0 && stableStormkiteArt.hop?.box.height > 0,
      "the existing contact flash occupies visible arena pixels at the target");
    assert.ok(["east", "north", "south", "west"].includes(stableStormkiteArt.direction));
    assert.equal(stableStormkiteArt.pivot, "32:54");
    assert.ok(Math.abs(Number.parseFloat(stableStormkiteArt.width) -
      64 * 13 / 13 / stableStormkiteArt.frameScale) < 0.0001,
    `Stormkite frame width must preserve the authored 64px cell: ` +
      `actual=${stableStormkiteArt.width}, frameScale=${stableStormkiteArt.frameScale}, ` +
      `rect=${JSON.stringify(stableStormkiteArt.rect)}, ` +
      `viewport=${JSON.stringify(stableStormkiteArt.viewport)}`);

    await page.setViewportSize({ width: 390, height: 844 });
    const phonePageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "phone-390x844-before-contact-capture" });
    const phoneFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-390x844-before-contact-capture",
    });
    recordStormkiteLayout("phone-390x844-before-contact-capture",
      { arena: phoneFrameSettlement, page: phonePageSettlement });
    const phoneViewportPng = await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-chain-hop-page-viewport-390x844.png") });
    const phoneViewportPixels = pngBufferEvidence(phoneViewportPng);
    assert.deepEqual({ width: phoneViewportPixels.width, height: phoneViewportPixels.height },
      { width: 390, height: 844 },
      "the contact capture is a 390×844 page-viewport screenshot");
    const phoneContactState = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const art = document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      );
      return { action: art?.dataset.spriteAction ?? null,
        bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
        tick: controller.session.state.tick };
    }, arenaControllerUrl);
    assert.equal(phoneContactState.action, "contact");
    assert.equal(phoneContactState.bodyCssPixels, 13,
      "Stormkite keeps its authored phone-sized body at 390×844");
    assert.equal(phoneContactState.tick, stormkiteContact.tick);
    const phoneHopBox = await child.locator(
      '.combat-effect-impact[data-effect-key^="stormkite-chain-hop:"]',
    ).boundingBox();
    assert.ok(phoneHopBox?.width > 0 && phoneHopBox?.height > 0,
      "the secondary-hop flash remains visible on the 390×844 phone viewport");
    await child.locator('[data-ui="arena"]').screenshot({
      path: join(ARTIFACTS, "stormkite-chain-hop-arena-element-390x844.png"),
    });
    recordStormkiteLayout("phone-390x844-contact-captured", {
      arena: phoneFrameSettlement,
      page: phonePageSettlement,
      pageViewportPng: phoneViewportPixels,
      stormkite: phoneContactState,
    });

    await page.setViewportSize({ width: 540, height: 960 });
    const normalPageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "normal-540x960-before-contact-capture" });
    const normalFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-normal-540x960-before-contact-capture",
    });
    recordStormkiteLayout("normal-540x960-before-contact-capture",
      { arena: normalFrameSettlement, page: normalPageSettlement });
    const stormkiteBattleScene = child.locator('[data-ui="arena"]');
    const normalContactArenaPng = await stormkiteBattleScene.screenshot({
      path: join(ARTIFACTS, "stormkite-contact-normal-arena-element.png"),
    });
    const normalContactViewportPng = await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-contact-normal-page-viewport-540x960.png") });
    const normalContactArenaPixels = pngBufferEvidence(normalContactArenaPng);
    const normalContactViewportPixels = pngBufferEvidence(normalContactViewportPng);
    assert.deepEqual({ width: normalContactViewportPixels.width,
      height: normalContactViewportPixels.height }, { width: 540, height: 960 },
    "the 540×960 capture is the browser page viewport; the iframe arena element is measured separately");
    recordStormkiteLayout("normal-540x960-contact-captured", {
      arenaElementPng: normalContactArenaPixels,
      pageViewportPng: normalContactViewportPixels,
      settlement: normalFrameSettlement,
    });
    const restoredNormalContact = await child.evaluate(async ({ entryUrl, checkpoint }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.restore(checkpoint);
      return { action: document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      )?.dataset.spriteAction ?? null,
      sessionBytes: controller.session.serialize(), tick: controller.session.state.tick };
    }, { entryUrl: arenaControllerUrl, checkpoint: stormkiteContact.checkpoint });
    assert.equal(restoredNormalContact.action, "contact");
    assertExactSessionBytes(restoredNormalContact.sessionBytes, stormkiteContact.sessionBytes,
      "normal contact restore keeps the exact canonical GameSession bytes");
    assert.equal(restoredNormalContact.tick, stormkiteContact.tick);
    const normalRestorePageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "normal-540x960-after-contact-restore" });
    const normalRestoreFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-normal-540x960-after-contact-restore",
    });
    recordStormkiteLayout("normal-540x960-after-contact-restore",
      { arena: normalRestoreFrameSettlement, page: normalRestorePageSettlement });
    const normalRestoredArenaPng = await stormkiteBattleScene.screenshot({
      path: join(ARTIFACTS, "stormkite-contact-normal-restored-arena-element.png"),
    });
    const normalRestoredViewportPng = await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-contact-normal-restored-page-viewport-540x960.png") });
    const normalRestoredArenaPixels = pngBufferEvidence(normalRestoredArenaPng);
    const normalRestoredViewportPixels = pngBufferEvidence(normalRestoredViewportPng);
    const normalArenaViewportCoverage = {
      before: mapArenaBoundsIntoPage(normalFrameSettlement, normalPageSettlement),
      after: mapArenaBoundsIntoPage(normalRestoreFrameSettlement, normalRestorePageSettlement),
    };
    assert.ok(arenaFitsPageViewport(normalArenaViewportCoverage.before) &&
      arenaFitsPageViewport(normalArenaViewportCoverage.after),
    `the measured arena lies inside the 540×960 page viewport: ` +
      JSON.stringify(normalArenaViewportCoverage));
    assert.deepEqual(normalArenaViewportCoverage.before, normalArenaViewportCoverage.after,
      "the exact arena-to-viewport geometry is stable across same-checkpoint restore");
    const normalPixelComparison = {
      arenaElement: { exactBytes: normalRestoredArenaPng.equals(normalContactArenaPng),
        original: normalContactArenaPixels, restored: normalRestoredArenaPixels },
      arenaViewportCoverage: normalArenaViewportCoverage,
      pageViewport: { exactBytes: normalRestoredViewportPng.equals(normalContactViewportPng),
        original: normalContactViewportPixels, restored: normalRestoredViewportPixels },
    };
    writeFileSync(join(ARTIFACTS, "stormkite-r25-normal-pixel-comparison.json"),
      `${JSON.stringify(normalPixelComparison, null, 2)}\n`);
    recordStormkiteLayout("normal-540x960-pixel-comparison", normalPixelComparison);
    assert.ok(normalPixelComparison.pageViewport.exactBytes,
      `normal same-checkpoint 540×960 page-viewport PNG bytes differ: ` +
      JSON.stringify(normalPixelComparison));

    await page.emulateMedia({ reducedMotion: "reduce" });
    const reducedContact = await child.evaluate(async ({ entryUrl, checkpoint }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.restore(checkpoint);
      const art = document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      );
      const impact = document.querySelector(
        '.combat-effect-impact[data-effect-key^="stormkite-chain-hop:"]',
      );
      const impactBox = impact?.getBoundingClientRect();
      return { action: art?.dataset.spriteAction ?? null,
        bodyCssPixels: Number(document.documentElement.dataset.combatBodyCssPixels),
        hopFlash: impact ? { kind: impact.dataset.kind, width: impactBox.width } : null,
        sessionBytes: controller.session.serialize(), tick: controller.session.state.tick };
    }, { entryUrl: arenaControllerUrl, checkpoint: stormkiteContact.checkpoint });
    assert.equal(reducedContact.action, "idle",
      "reduced motion suppresses the one-tick Stormkite contact cue");
    assert.equal(reducedContact.bodyCssPixels, 13);
    assert.equal(reducedContact.hopFlash?.kind, "contact",
      "the committed hop remains clear as a static target flash under reduced motion");
    assert.ok(reducedContact.hopFlash.width > 0);
    assertExactSessionBytes(reducedContact.sessionBytes, stormkiteContact.sessionBytes,
      "reduced-motion contact keeps the exact canonical GameSession bytes");
    assert.equal(reducedContact.tick, stormkiteContact.tick);
    const reducedPageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "reduced-540x960-before-contact-capture" });
    const reducedFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-reduced-540x960-before-contact-capture",
    });
    recordStormkiteLayout("reduced-540x960-before-contact-capture",
      { arena: reducedFrameSettlement, page: reducedPageSettlement });
    const reducedContactArenaPng = await stormkiteBattleScene.screenshot({
      path: join(ARTIFACTS, "stormkite-contact-reduced-arena-element.png"),
    });
    const reducedContactViewportPng = await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-contact-reduced-page-viewport-540x960.png") });
    const reducedContactArenaPixels = pngBufferEvidence(reducedContactArenaPng);
    const reducedContactViewportPixels = pngBufferEvidence(reducedContactViewportPng);
    assert.deepEqual({ width: reducedContactViewportPixels.width,
      height: reducedContactViewportPixels.height }, { width: 540, height: 960 });
    const restoredReducedContact = await child.evaluate(async ({ entryUrl, checkpoint }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      controller.restore(checkpoint);
      return { action: document.querySelector(
        '.combat-marker[data-kind="stormkite"][data-side="south"] .combat-art[data-art-id="stormkite"]',
      )?.dataset.spriteAction ?? null,
      sessionBytes: controller.session.serialize(), tick: controller.session.state.tick };
    }, { entryUrl: arenaControllerUrl, checkpoint: stormkiteContact.checkpoint });
    assert.equal(restoredReducedContact.action, "idle");
    assertExactSessionBytes(restoredReducedContact.sessionBytes, stormkiteContact.sessionBytes,
      "reduced-motion restore keeps the exact canonical GameSession bytes");
    assert.equal(restoredReducedContact.tick, stormkiteContact.tick);
    const reducedRestorePageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "reduced-540x960-after-contact-restore" });
    const reducedRestoreFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-reduced-540x960-after-contact-restore",
    });
    recordStormkiteLayout("reduced-540x960-after-contact-restore",
      { arena: reducedRestoreFrameSettlement, page: reducedRestorePageSettlement });
    const reducedRestoredArenaPng = await stormkiteBattleScene.screenshot({
      path: join(ARTIFACTS, "stormkite-contact-reduced-restored-arena-element.png"),
    });
    const reducedRestoredViewportPng = await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-contact-reduced-restored-page-viewport-540x960.png") });
    const reducedArenaViewportCoverage = {
      before: mapArenaBoundsIntoPage(reducedFrameSettlement, reducedPageSettlement),
      after: mapArenaBoundsIntoPage(reducedRestoreFrameSettlement, reducedRestorePageSettlement),
    };
    assert.ok(arenaFitsPageViewport(reducedArenaViewportCoverage.before) &&
      arenaFitsPageViewport(reducedArenaViewportCoverage.after),
    `the reduced-motion arena lies inside the 540×960 page viewport: ` +
      JSON.stringify(reducedArenaViewportCoverage));
    assert.deepEqual(reducedArenaViewportCoverage.before, reducedArenaViewportCoverage.after,
      "reduced-motion arena-to-viewport geometry is stable across restore");
    const reducedPixelComparison = {
      arenaElement: { exactBytes: reducedRestoredArenaPng.equals(reducedContactArenaPng),
        original: reducedContactArenaPixels,
        restored: pngBufferEvidence(reducedRestoredArenaPng) },
      arenaViewportCoverage: reducedArenaViewportCoverage,
      pageViewport: { exactBytes: reducedRestoredViewportPng.equals(reducedContactViewportPng),
        original: reducedContactViewportPixels,
        restored: pngBufferEvidence(reducedRestoredViewportPng) },
    };
    writeFileSync(join(ARTIFACTS, "stormkite-r25-reduced-pixel-comparison.json"),
      `${JSON.stringify(reducedPixelComparison, null, 2)}\n`);
    recordStormkiteLayout("reduced-540x960-pixel-comparison", reducedPixelComparison);
    assert.ok(reducedPixelComparison.pageViewport.exactBytes,
      `reduced same-checkpoint 540×960 page-viewport PNG bytes differ: ` +
      JSON.stringify(reducedPixelComparison));
    await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-battle-reduced-page-viewport-540x960.png") });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.setViewportSize({ width: 1440, height: 933 });
    await child.evaluate(async ({ entryUrl, checkpoint }) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.restore(checkpoint);
      return arenaHudController.session.state.tick;
    }, { entryUrl: arenaControllerUrl, checkpoint: stormkiteContact.checkpoint });
    const desktopPageSettlement = await waitForFiniteLayoutTransitions(page,
      { phase: "desktop-1440x933-before-contact-capture" });
    const desktopFrameSettlement = await waitForFiniteLayoutTransitions(child, {
      controllerUrl: arenaControllerUrl,
      expectedSessionBytes: stormkiteContact.sessionBytes,
      expectedTick: stormkiteContact.tick,
      phase: "arena-desktop-1440x933-before-contact-capture",
    });
    recordStormkiteLayout("desktop-1440x933-before-contact-capture",
      { arena: desktopFrameSettlement, page: desktopPageSettlement });
    const desktopContactViewportPng = await page.screenshot({ path: join(ARTIFACTS,
      "stormkite-battle-contact-page-viewport-1440x933.png") });
    const desktopContactPixels = pngBufferEvidence(desktopContactViewportPng);
    assert.deepEqual({ width: desktopContactPixels.width, height: desktopContactPixels.height },
      { width: 1440, height: 933 }, "the desktop capture is a 1440×933 page viewport");
    recordStormkiteLayout("desktop-1440x933-contact-captured",
      { pageViewportPng: desktopContactPixels });
    await page.setViewportSize({ width: 390, height: 844 });
    await child.evaluate(async ({ entryUrl, checkpoint }) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.restore(checkpoint);
    }, { entryUrl: arenaControllerUrl, checkpoint: stormkiteContact.checkpoint });

    const terminal = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      let chunks = 0;
      while (!arenaHudController.state.terminal && chunks < 12) {
        arenaHudController.fastForwardSegment(1_200);
        chunks += 1;
      }
      return { chunks, state: arenaHudController.state };
    }, arenaControllerUrl);
    assert.equal(terminal.state.terminal, true, "the custom match reaches a real terminal state");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-terminal-390x844.png") });
    await child.locator('[data-ui="restart"]').click();
    const restarted = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return {
        restartCount: arenaHudController.state.restartCount,
        sessionBytes: arenaHudController.session.serialize(),
        sessionTick: arenaHudController.state.sessionTick,
        setup: JSON.parse(arenaHudController.session.serialize()).setup,
      };
    }, arenaControllerUrl);
    assert.equal(restarted.restartCount, 1);
    assert.equal(restarted.sessionTick, 0);
    assert.deepEqual(restarted.setup.deck, deckIds,
      "Restart keeps the selected custom deck order");
    assert.deepEqual(restarted.setup, JSON.parse(createEditableGameSessionSetup(deckIds)),
      "Restart reconstructs the same canonical setup");
    assert.equal(restarted.sessionBytes,
      new GameSession(createEditableGameSessionSetup(deckIds)).serialize(),
      "Restart restores the same serialized eight-card session opening");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-restart-390x844.png") });

    await page.locator('.app-nav [data-nav-to="deck"]').click();
    await page.locator('[data-replace-slot="2"]').click();
    await page.locator('[data-replacement-card-id="squall-orb"]').click();
    const spellDeckIds = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(spellDeckIds[2], "squall-orb",
      "the editable deck can replace a troop with Squall Orb");
    assert.equal(spellDeckIds.length, 8);
    assert.equal(new Set(spellDeckIds).size, 8);

    await page.locator('[data-nav-to="battle"]').click();
    await child.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 8_000 });
    await child.waitForFunction(async ({ expectedIds, entryUrl }) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.stringify(JSON.parse(arenaHudController.session.serialize()).setup.deck) ===
        JSON.stringify(expectedIds);
    }, { expectedIds: spellDeckIds, entryUrl: arenaControllerUrl }, { timeout: 8_000 });
    const spellSetup = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return JSON.parse(arenaHudController.session.serialize()).setup;
    }, arenaControllerUrl);
    assert.deepEqual(spellSetup.deck, spellDeckIds);
    assert.equal(JSON.parse(spellSetup.battleSetup).spellProfileReceipts.profiles[0].profileId,
      "squall-orb-radius-v2",
    "the selected browser deck launches its explicit bounded radius profile");
    assert.ok((await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      return arenaHudController.session.state.decks.south.hand;
    }, arenaControllerUrl)).includes("squall-orb"),
    "Squall Orb is playable from the actual selected deck opening");

    const squallTarget = await child.evaluate(async (entryUrl) => {
      const { arenaHudController } = await import(entryUrl);
      arenaHudController.enterManualStepMode();
      arenaHudController.stepMany(1);
      const target = arenaHudController.session.state.battle.units
        .filter(({ alive, side }) => alive && side === "north")
        .sort((left, right) => left.id - right.id)[0];
      if (!target) throw new Error("the AI did not deploy a spell target");
      globalThis.__appBattlePointerEvidence = [];
      document.querySelector('[data-ui="arena"]').addEventListener("pointerup", (event) => {
        globalThis.__appBattlePointerEvidence.push({ isTrusted: event.isTrusted,
          clientX: event.clientX, clientY: event.clientY });
      }, true);
      return { hitpoints: target.hitpoints, id: target.id, point: target.position };
    }, arenaControllerUrl);
    const spellSlot = child.locator('[data-ui="card-slot"][data-card-id="squall-orb"]');
    await spellSlot.waitFor({ state: "visible" });
    await spellSlot.click();
    assert.equal(await child.locator('[data-ui="hud-hand"] [data-card-id="squall-orb"]')
      .getAttribute("data-selected"), "true");
    const spellArenaBox = await child.locator('[data-ui="arena"]').boundingBox();
    assert.ok(spellArenaBox);
    const spellArenaMetrics = await child.locator('[data-ui="arena"]').evaluate((arena) => ({
      borderLeft: arena.clientLeft,
      borderTop: arena.clientTop,
      clientHeight: arena.clientHeight,
      clientWidth: arena.clientWidth,
      rectHeight: arena.getBoundingClientRect().height,
      rectWidth: arena.getBoundingClientRect().width,
    }));
    const arenaScaleX = spellArenaBox.width / spellArenaMetrics.rectWidth;
    const arenaScaleY = spellArenaBox.height / spellArenaMetrics.rectHeight;
    const spellClientPoint = {
      x: spellArenaBox.x + (spellArenaMetrics.borderLeft +
        spellArenaMetrics.clientWidth * (squallTarget.point.x / 18_000)) * arenaScaleX,
      y: spellArenaBox.y + (spellArenaMetrics.borderTop + spellArenaMetrics.clientHeight *
        ((32_000 - squallTarget.point.y) / 32_000)) * arenaScaleY,
    };
    await page.mouse.move(spellClientPoint.x, spellClientPoint.y);
    const telegraph = child.locator(".squall-orb-radius-preview");
    await telegraph.waitFor({ state: "visible" });
    assert.equal(await telegraph.getAttribute("data-radius-millitiles"), "2500",
      "the browser shows the estimated radius around the trusted pointer location");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-squall-radius-preview-390x844.png") });
    await page.mouse.click(spellClientPoint.x, spellClientPoint.y);

    const spellCastEvidence = await child.evaluate(async ({ entryUrl, targetId }) => {
      const { arenaHudController } = await import(entryUrl);
      const controller = arenaHudController;
      const selectedState = controller.session.state;
      const tickBeforeImpact = selectedState.tick;
      const targetBeforeImpact = selectedState.battle.units.find(({ id }) => id === targetId);
      const firstEvents = controller.stepMany(1);
      const pendingState = controller.session.state;
      const checkpoint = controller.serialize();
      controller.restore(checkpoint);
      const exactAtRestore = controller.serialize() === checkpoint;
      const restoredPending = controller.session.state.battle.pendingSpellIntents.filter((intent) =>
        intent.side === "south" && intent.cardId === "squall-orb");
      const trustedPointer = [...(globalThis.__appBattlePointerEvidence ?? [])]
        .reverse().find(({ isTrusted }) => isTrusted) ?? null;
      const arena = document.querySelector('[data-ui="arena"]');
      const borderRect = arena.getBoundingClientRect();
      const arenaRect = {
        bottom: borderRect.top + arena.clientTop + arena.clientHeight,
        left: borderRect.left + arena.clientLeft,
        top: borderRect.top + arena.clientTop,
        width: arena.clientWidth,
        height: arena.clientHeight,
      };
      const pointerPoint = trustedPointer === null ? null : {
        x: Math.floor((trustedPointer.clientX - arenaRect.left) * 18_000 / arenaRect.width),
        y: Math.floor((arenaRect.bottom - trustedPointer.clientY) * 32_000 / arenaRect.height),
      };
      const continuationEvents = controller.stepMany(2);
      const replay = controller.session.replay;
      const targetAfterImpact = controller.session.state.battle.units.find(({ id }) => id === targetId);
      return {
        cast: replay.find(({ side, type, intent }) => side === "south" &&
          type === "session-spell-played" && intent?.cardId === "squall-orb") ?? null,
        continuationResolved: continuationEvents.some(({ profileId, type }) =>
          type === "spell-intent-resolved" && profileId === "squall-orb-radius-v2"),
        areaHit: continuationEvents.find(({ effectId, targetId: hitTargetId, type }) =>
          type === "spell-area-hit" && effectId === 1 && hitTargetId === targetId) ?? null,
        deckSequence: pendingState.decks.south.sequence,
        elixirAmount: pendingState.elixir.sides.south.amount,
        exactAtRestore,
        firstEventTypes: firstEvents.map(({ type }) => type),
        pending: restoredPending,
        pointerPoint,
        targetAfterHitpoints: targetAfterImpact.hitpoints,
        targetBeforeHitpoints: targetBeforeImpact.hitpoints,
        tickBeforeImpact,
      };
    }, { entryUrl: arenaControllerUrl, targetId: squallTarget.id });
    assert.ok(spellCastEvidence.cast);
    assert.equal(spellCastEvidence.cast.intent.profileId, "squall-orb-radius-v2");
    assert.deepEqual(spellCastEvidence.cast.intent.point, spellCastEvidence.pointerPoint,
      "the typed spell intent uses the exact trusted browser pointer coordinate");
    assert.ok(Math.abs(spellCastEvidence.cast.intent.point.x - squallTarget.point.x) <= 75 &&
      Math.abs(spellCastEvidence.cast.intent.point.y - squallTarget.point.y) <= 75,
    `the trusted point lands within one phone-screen pixel of the AI troop at ${JSON.stringify(squallTarget.point)}: ${JSON.stringify(spellCastEvidence.cast.intent.point)}`);
    assert.equal(spellCastEvidence.cast.resolution, null,
      "the first manual tick leaves the estimated impact pending");
    assert.equal(spellCastEvidence.deckSequence, 1, "the cast cycles the selected deck");
    assert.equal(spellCastEvidence.elixirAmount, 6, "the cast spends its four elixir");
    assert.equal(spellCastEvidence.pending[0].impactTick, spellCastEvidence.tickBeforeImpact + 2);
    assert.equal(spellCastEvidence.exactAtRestore, true,
      "browser restore reproduces the pending center impact exactly");
    assert.equal(spellCastEvidence.continuationResolved, true,
      "the restored browser session resolves the pending spell deterministically");
    assert.equal(spellCastEvidence.areaHit?.damage, 689,
      "the resolved center cast damages the AI troop inside its radius");
    assert.equal(spellCastEvidence.targetBeforeHitpoints - spellCastEvidence.targetAfterHitpoints, 689,
      "the AI troop loses exactly the resolved spell damage");
    const impactRing = child.locator(".combat-effect-area");
    await impactRing.waitFor({ state: "attached" });
    assert.equal(await impactRing.count(), 1,
      "the actual browser renders the restored radius impact ring");
    await page.screenshot({ path: join(ARTIFACTS, "custom-battle-squall-impact-390x844.png") });
    const trustedSpellPointer = await child.evaluate(() =>
      globalThis.__appBattlePointerEvidence.some(({ isTrusted }) => isTrusted));
    assert.equal(trustedSpellPointer, true,
      "the spell center came from a trusted Chrome pointer gesture");

    assert.deepEqual(failures, []);
    for (const path of requests) {
      assert.ok(manifest.files.some((file) => file.path === path),
        `successful browser request is included in the release manifest: ${path}`);
    }
    writeFileSync(join(ARTIFACTS, "browser-evidence.json"), `${JSON.stringify({
      cardIds: createPlayableRoster().map(({ id }) => id),
      editablePoolIds: [...EXPECTED_COLLECTION_IDS],
      cardPortraits: cardPortraitEvidence,
      release: {
        entrypoints: manifest.entrypoints,
        standaloneModules: manifest.standaloneModules,
        fileCount: manifest.fileCount,
        manifestSha256,
      },
      deployment: {
        cardId: deployed.deployment.cardId,
        point: deployed.deployment.point,
        trustedInput: true,
      },
      requestPaths: [...requests].sort(),
      battleFrame: { box: frameBox, smallBox: smallFrameBox, viewport: battleViewport },
      editableDeck: {
        averageCost: finalAverageCost,
        ids: deckIds,
        replacements: [
          { added: "stonehauler", removed: "mossguard", slot: 1 },
          { added: "gloamwing-cluster", removed: "copperskiff", slot: 2 },
          { added: "coppershade-flock", removed: "skymaul", slot: 3 },
        ],
        launchedSetup: frameSetup,
        invalidMessagesIgnored: true,
        pauseResume: { pausedTick: customPausedTick, resumedTick: resumedCustomTick },
        openingHand: editableOpeningHand,
        deployments: [
          {
            cardId: gloamwingDeployment.deployment.cardId,
            entityCount: gloamwingDeployment.deployment.entityIds.length,
            cost: gloamwingDeployment.spend.cost,
            point: gloamwingDeployment.deployment.point,
            trustedInput: true,
          },
          {
            cardId: committedCoppershade.deployment.deployment.cardId,
            entityCount: committedCoppershade.deployment.deployment.entityIds.length,
            cost: committedCoppershade.deployment.spend.cost,
            point: committedCoppershade.deployment.deployment.point,
            trustedInput: committedCoppershade.trustedPointer.isTrusted,
          },
        ],
        snapshot: {
          gloamwing: {
            exactAtRestore: continuation.exactAtRestore,
            replayExact: continuation.replayed === continuation.forward,
            restoredDeck: continuation.restoredDeck,
          },
          coppershade: {
            attackerCardId: coppershadeProjectileEvidence.attackerCardId,
            attackerSide: coppershadeProjectileEvidence.attackerSide,
            projectile: coppershadeProjectileEvidence.projectile,
            exactAtRestore: coppershadeProjectileEvidence.exactAtRestore,
            projectileRestoredExactly: coppershadeProjectileEvidence.restoredProjectileExact,
            replayExact: coppershadeProjectileEvidence.replayExact,
            targetCardId: coppershadeProjectileEvidence.targetCardId,
            targetLayer: coppershadeProjectileEvidence.targetLayer,
            targetSide: coppershadeProjectileEvidence.targetSide,
          },
        },
        terminal: { reached: terminal.state.terminal, sessionTick: terminal.state.sessionTick,
          chunks: terminal.chunks },
        restart: { deck: restarted.setup.deck, restartCount: restarted.restartCount,
          sessionTick: restarted.sessionTick },
      },
      editableSquallSpell: {
        deck: spellDeckIds,
        profileId: "squall-orb-radius-v2",
        centerPoint: spellCastEvidence.cast.intent.point,
        centerTelegraphRadiusMillitiles: 2_500,
        impactHit: { damage: spellCastEvidence.areaHit.damage,
          targetId: squallTarget.id, hitpointsBefore: spellCastEvidence.targetBeforeHitpoints,
          hitpointsAfter: spellCastEvidence.targetAfterHitpoints },
        impactRingVisible: true,
        trustedPointer: trustedSpellPointer,
        elixirAfterCast: spellCastEvidence.elixirAmount,
        pendingImpactRestoreExact: spellCastEvidence.exactAtRestore,
        resolvedAfterRestore: spellCastEvidence.continuationResolved,
      },
      viewports: [
        { width: 720, height: 1280 },
        { width: 390, height: 844 },
        { width: 1440, height: 933 },
      ],
      result: "passed",
    }, null, 2)}\n`);
  } finally {
    await page.close();
    await browser.close();
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
});

test("keyboard scrolling reaches the last Stormkite QUESTION detail in the compact public battle", {
  timeout: 90_000,
}, async (t) => {
  mkdirSync(ARTIFACTS, { recursive: true });
  const temporary = await mkdtemp(join(tmpdir(), "stormkite-keyboard-release-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const releaseRoot = join(temporary, "artifact");
  await buildRelease({ output: releaseRoot });

  const server = spawn(process.execPath, [
    new URL("./game-browser-journey-server.js", import.meta.url).pathname,
    `--root=${releaseRoot}`,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let browser = null;
  let context = null;
  try {
    const address = await serverAddress(server.stdout);
    const origin = `http://${address.host}:${address.port}`;
    const controllerUrl = new URL(`/${ARENA_CONTROLLER_MODULE}`, origin).href;
    const { chromium } = await import(PLAYWRIGHT);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    context = await browser.newContext({
      deviceScaleFactor: 1,
      viewport: { width: 320, height: 568 },
    });
    const page = await context.newPage();
    const failures = [];
    page.on("pageerror", (error) => failures.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") failures.push(message.text());
    });

    await page.goto(`${origin}/public/index.html`, { waitUntil: "networkidle" });
    assert.deepEqual(await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
      { width: 320, height: 568 }, "the keyboard audit uses the compact public-app viewport");

    const openingDeckIds = await page.locator("[data-home-deck] [data-card-id]").evaluateAll((nodes) =>
      nodes.map((node) => node.dataset.cardId));
    assert.equal(openingDeckIds.length, 8, "the public app starts with its saved eight-card deck");
    const replaceCard = async (slot, cardId) => {
      await page.locator('.app-nav [data-nav-to="deck"]').click();
      const slotButton = page.locator(`[data-replace-slot="${slot}"]`);
      await slotButton.focus();
      await page.keyboard.press("Enter");
      await page.locator(`[data-replacement-card-id="${cardId}"]`).click();
      const selected = await page.locator("[data-deck-cards] [data-card-id]").evaluateAll((nodes) =>
        nodes.map((node) => node.dataset.cardId));
      assert.equal(selected[slot], cardId, `${cardId} is selected in deck slot ${slot + 1}`);
      assert.equal(selected.length, 8, "the selected deck still contains eight cards");
      assert.equal(new Set(selected).size, 8, "the selected deck contains no duplicate cards");
      await page.locator('[data-nav-to="battle"]').click();
      await page.waitForFunction(() =>
        document.querySelector("[data-battle-frame-slot] iframe") !== null,
      null, { timeout: 10_000 });
      const child = page.frames().find((frame) => frame.url().includes("app-frame=1"));
      assert.ok(child, "the public app mounted its real battle frame");
      await child.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 10_000 });
      await child.waitForFunction(async ({ entryUrl, expectedDeck }) => {
        const { arenaHudController } = await import(entryUrl);
        const snapshot = JSON.parse(arenaHudController.session.serialize());
        return JSON.stringify(snapshot.setup.deck) === JSON.stringify(expectedDeck);
      }, { entryUrl: controllerUrl, expectedDeck: selected }, { timeout: 10_000 });
      await child.evaluate(async (entryUrl) => {
        const { arenaHudController } = await import(entryUrl);
        arenaHudController.enterManualStepMode();
      }, controllerUrl);
      return { child, deck: selected };
    };
    const remountSelectedBattle = async (expectedDeck) => {
      await page.locator('.app-nav [data-nav-to="deck"]').click();
      await page.locator('[data-nav-to="battle"]').click();
      await page.waitForFunction(() =>
        document.querySelector("[data-battle-frame-slot] iframe") !== null,
      null, { timeout: 10_000 });
      const child = page.frames().find((frame) => frame.url().includes("app-frame=1"));
      assert.ok(child, "the selected deck remounts the public battle frame");
      await child.locator('[data-ui="arena"]').waitFor({ state: "visible", timeout: 10_000 });
      await child.waitForFunction(async ({ entryUrl, deck }) => {
        const { arenaHudController } = await import(entryUrl);
        const snapshot = JSON.parse(arenaHudController.session.serialize());
        return JSON.stringify(snapshot.setup.deck) === JSON.stringify(deck);
      }, { entryUrl: controllerUrl, deck: expectedDeck }, { timeout: 10_000 });
      await child.evaluate(async (entryUrl) => {
        const { arenaHudController } = await import(entryUrl);
        arenaHudController.enterManualStepMode();
      }, controllerUrl);
      return child;
    };

    const evidence = [];
    const recordEvidence = () => writeFileSync(join(ARTIFACTS, "keyboard-policy-evidence.json"),
      `${JSON.stringify({ viewport: { width: 320, height: 568 }, cases: evidence }, null, 2)}\n`);
    const auditDetails = async ({ name, expectedCardIds, expectedNames, deck, reducedMotion }) => {
      await page.emulateMedia({ reducedMotion: reducedMotion ? "reduce" : "no-preference" });
      const child = page.frames().find((frame) => frame.url().includes("app-frame=1"));
      assert.ok(child, `${name}: public battle frame remains mounted`);
      const notice = child.locator('[data-ui="policy-question"]');
      await notice.waitFor({ state: "visible", timeout: 5_000 });
      assert.equal(await notice.getAttribute("data-disposition"), "question");
      const summary = notice.locator("summary.policy-question-summary");
      const expectedSummary = `QUESTION · ${expectedNames.join(" + ")} · Details`;
      assert.equal((await summary.innerText()).replace(/\s+/gu, " ").trim(), expectedSummary,
        `${name}: the native disclosure names every card with QUESTION fields`);

      const sessionBefore = await child.evaluate(async (entryUrl) => {
        const { arenaHudController } = await import(entryUrl);
        return {
          bytes: arenaHudController.session.serialize(),
          tick: arenaHudController.state.sessionTick,
        };
      }, controllerUrl);
      const layoutBefore = await child.evaluate(() => {
        const rect = (selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return box === undefined ? null : box?.toJSON() ?? null;
        };
        return {
          arena: rect('[data-ui="arena"]'),
          audio: rect('[data-ui="audio-toggle"]'),
          crown: rect('[data-ui="opponent-hud"]'),
          timer: rect('[data-ui="hud-timer"]'),
          viewport: { width: innerWidth, height: innerHeight },
          windowScroll: { x: scrollX, y: scrollY },
        };
      });

      await child.locator('[data-ui="audio-toggle"]').focus();
      await page.keyboard.press("Tab");
      assert.equal(await summary.evaluate((node) => node.ownerDocument.activeElement === node), true,
        `${name}: a real Tab from the Sound control focuses the QUESTION summary`);
      await page.keyboard.press("Enter");
      assert.equal(await notice.locator("details").evaluate((node) => node.open), true,
        `${name}: Enter opens the native details disclosure`);
      const detailList = notice.locator(".policy-question-detail-list");
      assert.equal(await detailList.getAttribute("role"), "region");
      assert.equal(await detailList.getAttribute("aria-label"),
        `QUESTION details for ${expectedNames.join(" and ")}`);
      assert.equal(await detailList.getAttribute("tabindex"), "0",
        `${name}: the overflowing detail list is keyboard focusable`);
      await page.keyboard.press("Tab");
      assert.equal(await detailList.evaluate((node) => node.ownerDocument.activeElement === node), true,
        `${name}: a real Tab enters the scrollable details region`);
      const focusStyle = await detailList.evaluate((node) => {
        const style = getComputedStyle(node);
        return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth };
      });
      assert.notEqual(focusStyle.outlineStyle, "none",
        `${name}: keyboard focus is visibly indicated on the scroll region`);

      const contentBeforeScroll = await detailList.evaluate((node) => ({
        cardIds: [...node.querySelectorAll(".policy-question-detail-card")]
          .map((card) => card.dataset.cardId),
        clientHeight: node.clientHeight,
        maxScroll: node.scrollHeight - node.clientHeight,
        scrollHeight: node.scrollHeight,
        scrollTop: node.scrollTop,
      }));
      assert.deepEqual(contentBeforeScroll.cardIds, expectedCardIds,
        `${name}: all canonical QUESTION details remain present and ordered`);
      if (contentBeforeScroll.maxScroll > 0) {
        await page.keyboard.press("PageDown");
        await child.waitForFunction(() => {
          const node = document.querySelector('[data-ui="policy-question"] .policy-question-detail-list');
          return node !== null && node.scrollTop > 0;
        }, null, { timeout: 4_000 });
      }
      await page.keyboard.press("End");
      await child.waitForFunction(() => {
        const node = document.querySelector('[data-ui="policy-question"] .policy-question-detail-list');
        return node !== null && node.scrollTop >= node.scrollHeight - node.clientHeight - 0.5;
      }, null, { timeout: 4_000 });
      await child.evaluate(() => new Promise((resolve) => requestAnimationFrame(() =>
        requestAnimationFrame(resolve))));

      const finalState = await child.evaluate(() => {
        const list = document.querySelector('[data-ui="policy-question"] .policy-question-detail-list');
        const cards = [...list.querySelectorAll(".policy-question-detail-card")];
        const finalParagraph = cards.at(-1)?.querySelector("p");
        const textNode = finalParagraph?.firstChild;
        const range = document.createRange();
        range.setStart(textNode, textNode.textContent.length - 1);
        range.setEnd(textNode, textNode.textContent.length);
        const character = range.getBoundingClientRect();
        const listRect = list.getBoundingClientRect();
        const rect = (selector) => {
          const box = document.querySelector(selector)?.getBoundingClientRect();
          return box === undefined ? null : box?.toJSON() ?? null;
        };
        return {
          ariaLabel: list.getAttribute("aria-label"),
          cardIds: cards.map((card) => card.dataset.cardId),
          clientHeight: list.clientHeight,
          focusName: document.activeElement?.className ?? "",
          focusOutlineStyle: getComputedStyle(list).outlineStyle,
          lastCardName: cards.at(-1)?.querySelector("h2")?.textContent ?? "",
          lastCharacter: character.toJSON(),
          lastText: finalParagraph?.textContent ?? "",
          listRect: listRect.toJSON(),
          maxScroll: list.scrollHeight - list.clientHeight,
          scrollHeight: list.scrollHeight,
          scrollTop: list.scrollTop,
          geometry: {
            arena: rect('[data-ui="arena"]'),
            audio: rect('[data-ui="audio-toggle"]'),
            crown: rect('[data-ui="opponent-hud"]'),
            timer: rect('[data-ui="hud-timer"]'),
            viewport: { width: innerWidth, height: innerHeight },
            windowScroll: { x: scrollX, y: scrollY },
          },
        };
      });
      assert.deepEqual(finalState.cardIds, expectedCardIds,
        `${name}: the final reading position retains every QUESTION card`);
      assert.equal(finalState.lastText,
        "Stormkite chain hops: QUESTION. Target choice, hop limits and timing remain unverified.",
        `${name}: the complete Stormkite QUESTION record remains available`);
      assert.ok(finalState.lastCharacter.top >= finalState.listRect.top - 0.5 &&
        finalState.lastCharacter.bottom <= finalState.listRect.bottom + 0.5,
      `${name}: the last Stormkite text line is inside the detail region at scroll end: ${JSON.stringify(finalState)}`);
      assert.ok(finalState.scrollTop >= finalState.maxScroll - 0.5,
        `${name}: End reaches the actual scroll boundary`);
      assert.deepEqual(finalState.geometry, layoutBefore,
        `${name}: keyboard reading does not move the arena, crown, timer, audio control, viewport, or document`);
      const sessionAfter = await child.evaluate(async (entryUrl) => {
        const { arenaHudController } = await import(entryUrl);
        return {
          bytes: arenaHudController.session.serialize(),
          tick: arenaHudController.state.sessionTick,
        };
      }, controllerUrl);
      assert.deepEqual(sessionAfter, sessionBefore,
        `${name}: scrolling the QUESTION text leaves the deterministic battle session unchanged`);

      const screenshotName = `keyboard-${name}-320x568.png`;
      const screenshotBytes = await page.screenshot({ path: join(ARTIFACTS, screenshotName) });
      const screenshot = pngBufferEvidence(screenshotBytes);
      assert.deepEqual([screenshot.width, screenshot.height], [320, 568],
        `${name}: the evidence is a real 320×568 public-app viewport`);
      evidence.push({
        deck,
        focusStyle,
        finalState,
        layoutBefore,
        reducedMotion,
        screenshot: { name: screenshotName, ...screenshot },
        sessionTick: sessionBefore.tick,
      });
      recordEvidence();

      await page.keyboard.press("Shift+Tab");
      assert.equal(await summary.evaluate((node) => node.ownerDocument.activeElement === node), true,
        `${name}: Shift+Tab returns from the scroll region to the summary`);
      await page.keyboard.press("Enter");
      assert.equal(await notice.locator("details").evaluate((node) => node.open), false,
        `${name}: Enter on the focused summary closes the disclosure again`);
      assert.deepEqual(failures, [], `${name}: no browser errors occurred`);
      return { child, deck: expectedCardIds };
    };

    const solo = await replaceCard(3, "stormkite");
    const soloAudit = await auditDetails({
      name: "solo-stormkite-normal",
      expectedCardIds: ["stormkite"],
      expectedNames: ["Stormkite"],
      deck: solo.deck,
      reducedMotion: false,
    });
    assert.equal(solo.deck[3], "stormkite");

    const mixed = await replaceCard(2, "buried-coil");
    const mixedIds = ["buried-coil", "stormkite"];
    const normalAudit = await auditDetails({
      name: "mixed-buried-coil-stormkite-normal",
      expectedCardIds: mixedIds,
      expectedNames: ["Buried Coil", "Stormkite"],
      deck: mixed.deck,
      reducedMotion: false,
    });
    assert.equal(mixed.deck[2], "buried-coil");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await remountSelectedBattle(mixed.deck);
    const reducedAudit = await auditDetails({
      name: "mixed-buried-coil-stormkite-reduced",
      expectedCardIds: mixedIds,
      expectedNames: ["Buried Coil", "Stormkite"],
      deck: mixed.deck,
      reducedMotion: true,
    });

    await page.emulateMedia({ reducedMotion: "no-preference" });
    const brackenwheel = await replaceCard(2, "brackenwheel");
    const brackenwheelIds = ["brackenwheel", "stormkite"];
    const brackenwheelAudit = await auditDetails({
      name: "mixed-brackenwheel-stormkite-normal",
      expectedCardIds: brackenwheelIds,
      expectedNames: ["Brackenwheel", "Stormkite"],
      deck: brackenwheel.deck,
      reducedMotion: false,
    });
    assert.equal(brackenwheel.deck[2], "brackenwheel");
    assert.ok(soloAudit.child && normalAudit.child && reducedAudit.child && brackenwheelAudit.child);
    assert.deepEqual(failures, [], "the compact public battle emits no browser errors");
  } finally {
    if (context !== null) await context.close().catch(() => {});
    if (browser !== null) await browser.close().catch(() => {});
    server.kill("SIGTERM");
    await once(server, "exit").catch(() => {});
  }
});
