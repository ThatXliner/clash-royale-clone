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
  EDITABLE_DECK_CARD_IDS,
  projectSessionTroopBattleCard,
} from "../src/content/session-troop-roster.js";
import {
  EDITABLE_MIXED_DECK_CARD_IDS,
  createEditableGameSessionSetup,
} from "../src/content/editable-deck.js";
import { projectSessionNonUnitBattleCard } from "../src/content/session-card-catalog.js";
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
  "squall-orb",
  "ember-basin",
]);
const EXPECTED_AIR_SWARM_LORE = Object.freeze({
  brackenwheel: "Brackenwheel learned to clear jammed sluice gates by spinning a copperroot sickle through the reeds. After dusk, emberseed sparks trace a ring around her boots, and she counts each flicker as a warning from the river.",
  "gloamwing-cluster": "Gloamwings rise from the violet reeds at dusk to follow emberseeds down the riverbank. Five of them wheel around each warm spark until ferry bells call them home.",
  "coppershade-flock": "Coppershades roost in the offcuts piled outside the Rivermark river workshop. When the kiln wakes, all six glide over the canal and trade tiny sparks above their copper-lit nests.",
});
const EXPECTED_CARD_PORTRAIT_CELLS = Object.freeze([
  ...EXPECTED_ATLAS_CARD_CELLS,
  ...EXPECTED_INDIVIDUAL_PORTRAIT_IDS.map((id) => Object.freeze([id, null])),
  Object.freeze(["buried-coil", null]),
]);
const EXPECTED_COLLECTION_IDS = Object.freeze([
  ...EXPECTED_DEFAULT_ROSTER_IDS,
  ...EXPECTED_INDIVIDUAL_PORTRAIT_IDS,
  "buried-coil",
  "aether-well",
]);
const EXPECTED_COLLECTION_COUNT = 23;
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

function expectedStats(entity) {
  return {
    Count: String(entity.count),
    Health: entity.hitpoints === null ? "Not available" : format(entity.hitpoints),
    Damage: entity.damage === null ? "Not available" : `${format(entity.damage)} per attack`,
    "Hit speed": entity.hitSpeedTicks === null
      ? "Not available" : `${format(entity.hitSpeedTicks / 60)} s`,
    Range: entity.rangeMillitiles === null
      ? "Not available" : `${format(entity.rangeMillitiles / 1_000)} tiles`,
    Targets: entity.targetMode === "ground-and-air" ? "ground and air" : entity.targetMode,
    Moves: entity.movementMillitilesPerSecond === null
      ? "Not available" : `${format(entity.movementMillitilesPerSecond / 1_000)} tiles/s`,
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
        assert.deepEqual(profiles, card.entities.map(expectedStats), `${card.displayName} runtime facts`);
        assert.equal(await page.locator("[data-card-detail] .unit-profile").count(), card.entities.length);
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
        if (Object.hasOwn(EXPECTED_AIR_SWARM_LORE, card.id)) {
          assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
            EXPECTED_AIR_SWARM_LORE[card.id], `${card.displayName} shows its original lore`);
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
      ["buried-coil", "public/assets/buried-coil-portrait.webp"],
      ["kilnkeeper", "public/assets/kilnkeeper-portrait-painted.webp"],
      ["squall-orb", "public/assets/squall-orb-painted.webp"],
      ["ember-basin", "public/assets/ember-basin-portrait-painted-v2.webp"],
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
      "gloamwing-cluster", "coppershade-flock"]) {
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
      if (Object.hasOwn(EXPECTED_AIR_SWARM_LORE, cardId)) {
        assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
          EXPECTED_AIR_SWARM_LORE[cardId], `${cardId} phone detail keeps its original lore`);
      }
      assert.equal(await page.locator("[data-card-detail] .unit-profile .stat-cell").count(), 7,
        `${cardId} phone detail retains all seven stat cells`);
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
    const desktopDetailReviews = [];
    for (const cardId of ["sunthread-pair", "duskwing-trio",
      "gloamwing-cluster", "coppershade-flock"]) {
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
      if (Object.hasOwn(EXPECTED_AIR_SWARM_LORE, cardId)) {
        assert.equal(await page.locator("[data-card-detail] .card-lore p").innerText(),
          EXPECTED_AIR_SWARM_LORE[cardId], `${cardId} desktop detail keeps its original lore`);
      }
      assert.ok(layout.detail.bounds.x >= 0 && layout.detail.bounds.right <= 1440 &&
        layout.detail.scrollWidth <= layout.detail.clientWidth + 1,
      `${cardId} desktop detail panel and contents fit horizontally`);
      assert.equal(layout.idsUnique, true,
        `${cardId} keeps document IDs unique while collection and detail portraits are visible`);
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
    const smallFrameBox = await page.locator("[data-battle-frame-slot] iframe").boundingBox();
    const smallLayout = await cardFrameLayout(child);
    assert.deepEqual([smallLayout.viewport.width, smallLayout.viewport.height], [720, 1280],
      "small phones retain the source arena coordinate space");
    assert.ok(smallFrameBox && smallFrameBox.width > 0 && smallFrameBox.height > 0 &&
      smallFrameBox.width <= 390 && smallFrameBox.height <= 660,
    `the full arena scales to the 390x844 available area: ${JSON.stringify(smallFrameBox)}`);
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
      [expectedStats(projectSessionTroopBattleCard("stonehauler").entities[0])],
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
      ...["stonehauler", "gloamwing-cluster", "coppershade-flock"]
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
      if (projectile === null) return { projectile: null };
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
      "Coppershade launches a real projectile in the browser session");
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
