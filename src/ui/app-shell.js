import { createPlayableRoster, PLAYABLE_CARD_IDS } from "../content/playable-roster.js";
import {
  createSessionTroopWitnessQuestions,
  projectSessionTroopBattleCard,
} from "../content/session-troop-roster.js";
import {
  EDITABLE_DECK_CARD_IDS,
  EDITABLE_MIXED_DECK_CARD_IDS,
} from "../content/editable-deck.js";
import { projectSessionNonUnitBattleCard } from "../content/session-card-catalog.js";
import { createSessionRadiusSpellProfileReceipts } from "../content/session-spell-profile-receipts.js";
import { getCardPortrait } from "./card-portrait-art.js";
import { getCardLore } from "./card-lore.js";

function unitStatQuestion(entity, field, questions) {
  const sourceField = entity.sourceConfidencePolicy?.fields?.find((candidate) =>
    candidate.field === field);
  const damagePolicy = field === "damage" ? entity.damagePolicy : null;
  const questionKey = sourceField?.questionKey ??
    (damagePolicy?.kind === "question" ? damagePolicy.questionKey : null);
  if (questionKey === null || questionKey === undefined) return null;
  const record = questions.get(questionKey);
  if (record === undefined || record.key !== questionKey) {
    throw new TypeError(`session troop stat ${entity.archetypeId}.${field} lacks its canonical question receipt`);
  }
  return record.disposition === "question" && record.authoritative === false &&
    record.confidence === "unverified" ? record : null;
}

const cards = [
  ...createPlayableRoster(),
  ...EDITABLE_MIXED_DECK_CARD_IDS.filter((id) => !PLAYABLE_CARD_IDS.includes(id))
    .map((id) => EDITABLE_DECK_CARD_IDS.includes(id)
      ? projectSessionTroopBattleCard(id) : projectSessionNonUnitBattleCard(id)),
];
const UNIT_DETAIL_STAT_FIELDS = Object.freeze([
  "count",
  "hitpoints",
  "damage",
  "hitSpeedTicks",
  "rangeMillitiles",
  "targetMode",
  "movementMillitilesPerSecond",
]);
const cardById = new Map(cards.map((card) => [card.id, card]));
const radiusSpellProfile = createSessionRadiusSpellProfileReceipts().profiles[0];
const unitQuestionFlagsByCardId = new Map(cards
  .filter((card) => card.entities.some((entity) =>
    entity.sourceConfidencePolicy?.fields?.length > 0 ||
    entity.damagePolicy?.kind === "question"))
  .map((card) => {
    const receipts = new Map(createSessionTroopWitnessQuestions(card.id)
      .map((record) => [record.key, record]));
    return [card.id, new Map(card.entities.map((entity) => [
      entity,
      new Map(UNIT_DETAIL_STAT_FIELDS.map((field) => [
        field,
        unitStatQuestion(entity, field, receipts) !== null,
      ])),
    ]))];
  }));
const emptyQuestionFlags = new Map();
const KIND_LABELS = Object.freeze({ unit: "Troop", effect: "Spell", structure: "Building" });
const KIND_COUNT_WORDS = Object.freeze({
  unit: Object.freeze(["troop", "troops"]),
  effect: Object.freeze(["spell", "spells"]),
  structure: Object.freeze(["building", "buildings"]),
});
const RARITY_LABELS = Object.freeze({
  standard: "Standard",
  uncommon: "Uncommon",
  special: "Special",
  mythic: "Mythic",
  heroic: "Heroic",
});
const CHIP_TARGETS = Object.freeze({
  ground: "Hits ground",
  air: "Hits air",
  "ground-and-air": "Hits ground and air",
  air_and_ground: "Hits ground and air",
  structures: "Targets buildings",
  none: "Does not attack",
});
// The last column collects every cost at or above its value.
const CURVE_COSTS = Object.freeze([1, 2, 3, 4, 5, 6, 7]);
const PHONE_LAYOUT_QUERY = "(max-width: 760px)";
const root = document.querySelector(".app-shell");
const views = new Map([...document.querySelectorAll("[data-app-view]")]
  .map((view) => [view.dataset.appView, view]));
const navButtons = [...document.querySelectorAll("[data-nav-to]")];
const cardGrid = document.querySelector("[data-card-grid]");
const deckCards = document.querySelector("[data-deck-cards]");
const homeDeck = document.querySelector("[data-home-deck]");
const heroCrew = document.querySelector("[data-hero-crew]");
const deckCurve = document.querySelector("[data-deck-curve]");
const cardDetails = document.querySelector("[data-card-detail]");
const emptyCollection = document.querySelector("[data-card-empty]");
const search = document.querySelector("[data-card-search]");
const battleFrameSlot = document.querySelector("[data-battle-frame-slot]");
const replacementPanel = document.querySelector("[data-replacement-panel]");
const replacementChoices = document.querySelector("[data-replacement-choices]");
const deckStatus = document.querySelector("[data-deck-status]");
const battleLabel = document.querySelector("[data-battle-label]");
let selectedCardId = PLAYABLE_CARD_IDS[0];
let currentDeckIds = [...PLAYABLE_CARD_IDS];
let selectedSlotIndex = null;
let lastReplacedSlotIndex = null;
let currentView = "home";
let battleFrame = null;
let battleFrameReady = false;
let battleFrameScale = 1;

const formatter = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

function html(value) {
  return String(value).replace(/[&<>]/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
  })[character]).replaceAll(String.fromCharCode(34), "&quot;")
    .replaceAll(String.fromCharCode(39), "&#39;");
}

function capitalize(text) {
  return text.charAt(0).toLocaleUpperCase("en") + text.slice(1);
}

function countLabel(count) {
  return `${formatter.format(count)} ${count === 1 ? "unit" : "units"}`;
}

function cardCountLabel(card) {
  if (card.kind === "effect") return "one spell";
  if (card.kind === "structure") return "one building";
  return countLabel(card.formation.totalCount);
}

function kindLabel(card) {
  return KIND_LABELS[card.kind] ?? "Card";
}

function rarityKey(card) {
  return Object.hasOwn(RARITY_LABELS, card.rarity) ? card.rarity : "standard";
}

function rarityLabel(card) {
  return Object.hasOwn(RARITY_LABELS, card.rarity) ? RARITY_LABELS[card.rarity] : null;
}

function accessibleKind(card) {
  return card.kind === "unit"
    ? `troop, ${countLabel(card.formation.totalCount)}`
    : kindLabel(card).toLocaleLowerCase("en");
}

function roleSummary(card) {
  if (card.kind === "effect") {
    return card.id === radiusSpellProfile.fact.cardId ? "Spell · area" : "Spell";
  }
  if (card.kind === "structure") {
    const profileClass = card.buildingRuntime?.class;
    if (profileClass === "resource") return "Building · makes elixir";
    if (profileClass === "defensive") return "Building · defends";
    return "Building";
  }
  return `Troop · ${countLabel(card.formation.totalCount)}`;
}

function pluralName(name, count) {
  if (count === 1) return name;
  if (/[^aeiou]y$/iu.test(name)) return `${name.slice(0, -1)}ies`;
  if (/s$/iu.test(name)) return name;
  return `${name}s`;
}

function tileValue(millitiles) {
  return millitiles === null ? "Not available" : `${formatter.format(millitiles / 1_000)} tiles`;
}

function secondsValue(ticks) {
  return ticks === null ? "Not available" : `${formatter.format(ticks / 60)} s`;
}

function speedValue(millitilesPerSecond) {
  return millitilesPerSecond === null
    ? "Not available" : `${formatter.format(millitilesPerSecond / 1_000)} tiles/s`;
}

function targetLabel(mode) {
  if (mode === "ground-and-air" || mode === "air_and_ground") return "ground and air";
  if (mode === "ground") return "ground";
  if (mode === "air") return "air";
  if (mode === "structures") return "structures";
  if (mode === "none") return "no targets";
  return "not available";
}

function classificationHasQuestion(entity) {
  return entity.deliveryPolicy?.kind === "question" || entity.layerPolicy?.kind === "question" ||
    (entity.meleeAreaPolicy?.authoritative === false &&
      entity.meleeAreaPolicy?.confidence === "question");
}

function questionClassificationCopy(entity) {
  const delivery = entity.delivery === "projectile" ? "ranged" : "melee";
  const layer = entity.layer === "air" ? "Flying" : "Ground";
  const provisionalFields = [];
  if (entity.meleeAreaPolicy?.authoritative === false &&
      entity.meleeAreaPolicy?.confidence === "question") {
    provisionalFields.push("melee area/contact rule");
  }
  if (entity.layerPolicy?.kind === "question") {
    provisionalFields.push(`${layer.toLocaleLowerCase("en")} layer`);
  }
  if (entity.deliveryPolicy?.kind === "question") {
    provisionalFields.push(`${delivery} delivery`);
  }
  const meleeAreaQuestion = entity.meleeAreaPolicy?.authoritative === false &&
    entity.meleeAreaPolicy?.confidence === "question";
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
  return `Current game: ${layer} unit · ${delivery} attacks · targets ${targetLabel(entity.targetMode)}. ${confidenceNote}${combatConfidenceNote}`;
}

function descriptionFor(card) {
  if (card.id === radiusSpellProfile.fact.cardId) {
    const fact = radiusSpellProfile.fact;
    return `Center-cast area spell · ${formatter.format(fact.damage)} damage to enemy ground troops, flying troops, buildings and crown towers within an estimated ${formatter.format(fact.areaDamageRadiusMillitiles / 1_000)}-tile radius. Crown-tower damage is an estimated ${100 + fact.crownTowerDamagePercent}% of troop damage. Impact takes about ${formatter.format(fact.impactDelayTicks / 60)} seconds. Projectile flight and knockback are not simulated.`;
  }
  if (card.kind === "structure") {
    const profile = card.buildingRuntime;
    if (profile?.class === "defensive") {
      const targets = targetLabel(profile.targetMode);
      const attack = profile.areaDamageRadiusMillitiles === null
        ? `single-target attacks against ${targets} targets`
        : `splash damage against ${targets} targets within a ${formatter.format(
          profile.areaDamageRadiusMillitiles / 1_000)}-tile radius`;
      const confidence = profile.policy?.disposition === "question"
        ? "Its combat profile is QUESTION; shown combat values remain provisional."
        : "Its combat values use the current shared defensive profile.";
      return `Stationary defensive structure · ${attack}. ${confidence}`;
    }
    if (profile?.class === "resource") {
      return `Stationary resource structure · produces elixir over time and grants ${formatter.format(
        profile.destructionAmount)} elixir when destroyed. It does not attack.`;
    }
    return "Stationary structure · combat targeting is not available in the current profile.";
  }
  if (card.entities.length === 1) {
    const [entity] = card.entities;
    if (classificationHasQuestion(entity)) return questionClassificationCopy(entity);
    const layer = entity.layer === "air" ? "Flying" : "Ground";
    const attack = entity.delivery === "projectile" ? "ranged attacks" : "melee attacks";
    return `${layer} unit · ${attack} · targets ${targetLabel(entity.targetMode)}.`;
  }
  if (card.entities.some(classificationHasQuestion)) {
    const deployed = card.entities.map((entity) =>
      `${formatter.format(entity.count)} ${pluralName(entity.displayName, entity.count)}`);
    const profiles = card.entities.map((entity) => {
      const profile = classificationHasQuestion(entity)
        ? questionClassificationCopy(entity)
        : `${entity.layer === "air" ? "Flying" : "Ground"} unit · ${entity.delivery === "projectile" ? "ranged" : "melee"} attacks · targets ${targetLabel(entity.targetMode)}.`;
      return `${entity.displayName}: ${profile}`;
    });
    return `Deploys ${deployed.join(" and ")} together. ${profiles.join(" ")}`;
  }
  const deployed = card.entities.map((entity) =>
    `${formatter.format(entity.count)} ${pluralName(entity.displayName, entity.count)}`);
  const details = card.entities.map((entity) => {
    const verb = entity.delivery === "projectile"
      ? entity.count === 1 ? "fires ranged attacks" : "fire ranged attacks"
      : entity.count === 1 ? "makes melee attacks" : "make melee attacks";
    return `${pluralName(entity.displayName, entity.count)} ${verb} against ${targetLabel(entity.targetMode)} targets`;
  });
  return `Deploys ${deployed.join(" and ")} together. ${details.join("; ")}.`;
}

function chip(label, provisional = false) {
  return { label, provisional };
}

// Plain role chips read only the projection and receipt data shown below them.
// A chip backed by a provisional field is drawn dashed and announced as such.
function roleChips(card) {
  if (card.kind === "effect") {
    if (card.id !== radiusSpellProfile.fact.cardId) return [chip("Spell")];
    const { fact, policies } = radiusSpellProfile;
    return [
      chip("Spell"),
      chip("Hits an area"),
      chip(CHIP_TARGETS[fact.targetMode] ?? "Targets not available",
        policies?.targetMode?.disposition === "question"),
    ];
  }
  if (card.kind === "structure") {
    const profile = card.buildingRuntime;
    const chips = [chip("Building"), chip("Stays in place")];
    if (profile?.class === "resource") {
      return [...chips, chip("Makes elixir"), chip("Does not attack")];
    }
    if (profile?.class === "defensive") {
      const policy = profile.policy ?? {};
      const provisional = (field) => policy.disposition === "question" ||
        policy[field]?.disposition === "question";
      chips.push(chip(CHIP_TARGETS[profile.targetMode ?? card.targetMode] ?? "Defends",
        provisional("targetMode")));
      chips.push(chip(profile.areaDamageRadiusMillitiles === null ? "One target at a time" : "Splash",
        provisional("areaDamageRadiusMillitiles")));
    }
    return chips;
  }
  const { entities } = card;
  const layers = [...new Set(entities.map((entity) => entity.layer === "air" ? "flying" : "ground"))];
  const deliveries = [...new Set(entities.map((entity) =>
    entity.delivery === "projectile" ? "ranged" : "melee"))];
  const chips = [
    chip(capitalize(layers.join(" and ")),
      entities.some((entity) => entity.layerPolicy?.kind === "question")),
    chip(capitalize(deliveries.join(" and ")),
      entities.some((entity) => entity.deliveryPolicy?.kind === "question")),
  ];
  if (entities.length === 1) {
    const flags = unitQuestionFlagsByCardId.get(card.id)?.get(entities[0]);
    chips.push(chip(CHIP_TARGETS[entities[0].targetMode] ?? "Targets not available",
      flags?.get("targetMode") === true));
  }
  if (card.formation.totalCount > 1) chips.push(chip(countLabel(card.formation.totalCount)));
  return chips;
}

function hasQuestionStat(card) {
  if (card.kind === "effect") return false;
  if (card.kind === "structure") {
    const policy = card.buildingRuntime?.policy ?? {};
    return policy.disposition === "question" ||
      Object.values(policy).some((record) => record?.disposition === "question");
  }
  const flags = unitQuestionFlagsByCardId.get(card.id);
  return flags !== undefined &&
    [...flags.values()].some((fields) => [...fields.values()].some(Boolean));
}

function artMarkup(cardId) {
  const portrait = getCardPortrait(cardId);
  const imageMarkup = portrait === null ? "" : `<span class="card-art-window">
      <img class="card-art-image${portrait.cell === null ? "" : " card-art-atlas"}"${portrait.cell === null ? "" : ` data-portrait-cell="${portrait.cell}"`} src="${html(portrait.src)}" alt="" decoding="async">
    </span>`;
  return `<span class="card-art" data-card-art="${html(cardId)}" aria-hidden="true">${imageMarkup}</span>`;
}

function kindBadge(card) {
  return card.kind === "unit" ? "" : `<span class="kind-badge">${html(kindLabel(card))}</span>`;
}

// One framed card face: rarity material, painted portrait, copper cost tag.
function cardFaceMarkup(card, { badges = "", info = "", tag = true } = {}) {
  return `<span class="card-face" data-rarity="${rarityKey(card)}"><span class="face-window">${artMarkup(card.id)}${tag ? `<span class="seed-tag" aria-hidden="true">${card.cost}</span>` : ""}${badges === "" ? "" : `<span class="face-badges" aria-hidden="true">${badges}</span>`}<span class="rarity-glyph" aria-hidden="true"></span></span>${info}</span>`;
}

function compactCardMarkup(card) {
  return `<button class="mini-card" type="button" data-card-id="${html(card.id)}" aria-label="Inspect ${html(card.displayName)}, ${cardCountLabel(card)}, ${card.cost} elixir">${cardFaceMarkup(card, {
    badges: kindBadge(card),
    info: `<span class="mini-card-name">${html(card.displayName)}</span>`,
  })}</button>`;
}

function deckCardMarkup(card, index) {
  const selected = index === selectedSlotIndex;
  const recentlyReplaced = index === lastReplacedSlotIndex;
  const confirmation = recentlyReplaced ? '<span class="deck-slot-confirmation">Updated</span>' : "";
  return `<article class="deck-slot${selected ? " is-selected" : ""}${recentlyReplaced ? " is-recently-replaced" : ""}" data-slot-index="${index}">
    <button class="deck-card-button" type="button" data-card-id="${html(card.id)}" aria-label="Inspect ${html(card.displayName)}, ${cardCountLabel(card)}, ${card.cost} elixir in slot ${index + 1}">${cardFaceMarkup(card, {
      badges: `<span class="slot-number">${index + 1}</span>${kindBadge(card)}`,
      info: `<span class="deck-card-copy"><strong>${html(card.displayName)}</strong><small>${html(roleSummary(card))}</small>${confirmation}</span>`,
    })}</button>
    <button class="deck-replace-button" type="button" data-replace-slot="${index}" aria-expanded="${selected}" aria-controls="deck-replacement-panel" aria-label="Replace ${html(card.displayName)} in slot ${index + 1}"><span class="swap-glyph" aria-hidden="true">⇄</span>Replace</button>
  </article>`;
}

function collectionCardMarkup(card) {
  const inDeck = currentDeckIds.includes(card.id);
  return `<button class="collection-card" type="button" data-card-id="${html(card.id)}" aria-pressed="${card.id === selectedCardId}" aria-label="${html(card.displayName)}, ${accessibleKind(card)}, costs ${card.cost} elixir${inDeck ? ", in your deck" : ""}">${cardFaceMarkup(card, {
    badges: `${inDeck ? '<span class="deck-badge">In deck</span>' : ""}${kindBadge(card)}`,
    info: `<span class="collection-card-info"><strong>${html(card.displayName)}</strong><small>${html(roleSummary(card))}</small></span>`,
  })}</button>`;
}

function statValueMarkup(value) {
  const match = /^([\d.,]+)( .+)?$/u.exec(value);
  if (match === null) return html(value);
  return `<span class="stat-num">${html(match[1])}</span>${match[2] === undefined
    ? "" : `<span class="stat-unit">${html(match[2])}</span>`}`;
}

function statCell(label, value, flag = null, lead = false) {
  const marker = flag === null ? "" : ` <span class="stat-flag">(${flag})</span>`;
  const state = flag === null ? "" : ` data-flag="${flag === "QUESTION" ? "question" : "estimate"}"`;
  const empty = value === "Not available" ? " data-empty" : "";
  return `<div class="stat-cell${lead ? " is-lead" : ""}"${state}${empty}><span>${label}</span><strong>${statValueMarkup(value)}${marker}</strong></div>`;
}

function statGridMarkup(entries, leadLabels) {
  const lead = entries.filter(([label]) => leadLabels.includes(label));
  const rest = entries.filter(([label]) => !leadLabels.includes(label));
  return `<div class="stat-grid">${[
    ...lead.map(([label, value, flag]) => statCell(label, value, flag, true)),
    ...rest.map(([label, value, flag]) => statCell(label, value, flag)),
  ].join("")}</div>`;
}

function radiusSpellProfileMarkup(card) {
  const { fact } = radiusSpellProfile;
  const radius = tileValue(fact.areaDamageRadiusMillitiles);
  const target = targetLabel(fact.targetMode);
  const impactDelay = formatter.format(fact.impactDelayTicks / 60);
  const crown = `${formatter.format(100 + fact.crownTowerDamagePercent)}% (${formatter.format(
    Math.floor((fact.damage * (100 + fact.crownTowerDamagePercent) + 50) / 100))} damage per cast)`;
  return `<section class="unit-profile spell-profile" aria-label="${html(card.displayName)} spell profile">
    <h3>Center cast · estimated values</h3>
    ${statGridMarkup([
      ["Area damage", `${formatter.format(fact.damage)} per target`, null],
      ["Radius", radius, "estimate"],
      ["Targets", target, "estimate"],
      ["Crown towers", crown, "estimate"],
      ["Impact delay", `about ${impactDelay} seconds`, "estimate"],
    ], ["Area damage", "Radius", "Impact delay"])}
    <p>Radius, target coverage, tower damage, rounding and impact timing are estimates. Projectile flight and knockback are not simulated.</p>
  </section>`;
}

function unitProfileMarkup(entity, questionFlags, solo) {
  const heading = entity.count === 1
    ? html(entity.displayName) : `${formatter.format(entity.count)} × ${html(entity.displayName)}`;
  const delivery = entity.delivery === "projectile" ? "Ranged" : "Melee";
  const layer = entity.layer === "air" ? "Flying" : "Ground";
  const visuallyHidden = solo ? ' class="visually-hidden"' : "";
  const flag = (field) => questionFlags.get(field) === true ? "QUESTION" : null;
  const values = [
    ["Count", formatter.format(entity.count), "count"],
    ["Health", entity.hitpoints === null
      ? "Not available" : formatter.format(entity.hitpoints), "hitpoints"],
    ["Damage", entity.damage === null
      ? "Not available" : `${formatter.format(entity.damage)} per attack`, "damage"],
    ["Hit speed", secondsValue(entity.hitSpeedTicks), "hitSpeedTicks"],
    ["Range", tileValue(entity.rangeMillitiles), "rangeMillitiles"],
    ["Targets", targetLabel(entity.targetMode), "targetMode"],
    ["Moves", speedValue(entity.movementMillitilesPerSecond), "movementMillitilesPerSecond"],
  ];
  const classification = classificationHasQuestion(entity)
    ? html(questionClassificationCopy(entity))
    : `${layer} · ${delivery} · Targets ${html(targetLabel(entity.targetMode))}`;
  return `<section class="unit-profile${solo ? " is-solo" : ""}" aria-label="${heading} statistics">
    <h3${visuallyHidden}>${heading}</h3><p${visuallyHidden}>${classification}</p>
    ${statGridMarkup(values.map(([label, value, field]) =>
      [label, value, flag(field)]), ["Health", "Damage", "Hit speed"])}
  </section>`;
}

function structureProfileMarkup(card) {
  const profile = card.buildingRuntime;
  if (profile === undefined) return "";
  const policy = profile.policy ?? {};
  if (profile.class === "resource") {
    const question = Object.values(policy).some((record) =>
      record?.disposition === "question");
    const flag = (field) => policy[field]?.disposition === "question" ? "QUESTION" : null;
    const values = [
      ["Cost", `${formatter.format(card.cost)} elixir`, null],
      ["Health", formatter.format(profile.hitpoints), flag("hitpoints")],
      ["Deploy", secondsValue(profile.deployTicks), flag("deployTicks")],
      ["Generation", `${formatter.format(profile.generationAmount)} elixir`, flag("generationAmount")],
      ["Interval", secondsValue(profile.generationCadenceTicks), flag("generationCadenceTicks")],
      ["Lifetime", secondsValue(profile.lifetimeTicks), flag("lifetimeTicks")],
      ["Destroyed", `${formatter.format(profile.destructionAmount)} elixir`, flag("destructionAmount")],
      ["Role", "Resource · does not attack", null],
    ];
    return `<section class="unit-profile structure-profile" aria-label="${html(card.displayName)} statistics">
      <h3>Resource structure · ${question ? "QUESTION" : "current profile"}</h3>
      <p>${question
        ? "Some resource fields remain QUESTION; source-aligned values keep their existing status."
        : "Values are from the current shared structure profile."}</p>
      ${statGridMarkup(values, ["Health", "Generation", "Interval"])}
    </section>`;
  }
  const broadQuestion = policy.disposition === "question";
  const question = broadQuestion || Object.values(policy).some((record) =>
    record?.disposition === "question");
  const flag = (field) => broadQuestion || policy[field]?.disposition === "question"
    ? "QUESTION" : null;
  const splashRadius = profile.class === "defensive" &&
    profile.areaDamageRadiusMillitiles === null
    ? "None" : tileValue(profile.areaDamageRadiusMillitiles);
  const values = [
    ["Cost", `${formatter.format(card.cost)} elixir`, null],
    ["Health", formatter.format(profile.hitpoints), flag("hitpoints")],
    ["Damage", `${formatter.format(profile.damage)} per attack`, flag("damage")],
    ["Deploy", secondsValue(profile.deployTicks), flag("deployTicks")],
    ["First hit", secondsValue(profile.firstHitTicks), flag("firstHitTicks")],
    ["Hit speed", secondsValue(profile.hitSpeedTicks), flag("hitSpeedTicks")],
    ["Lifetime", secondsValue(profile.lifetimeTicks), flag("lifetimeTicks")],
    ["Range", tileValue(profile.maxRangeMillitiles), flag("maxRangeMillitiles")],
    ["Splash radius", splashRadius, flag("areaDamageRadiusMillitiles")],
    ["Targets", targetLabel(profile.targetMode ?? card.targetMode), flag("targetMode")],
  ];
  const heading = profile.class === "resource" ? "Resource structure" : "Defensive structure";
  const confidence = question
    ? broadQuestion
      ? "Cost is source backed; combat values are provisional profile estimates and remain QUESTION for historical comparison."
      : "Some resource fields remain QUESTION; source-aligned values keep their existing status."
    : "Values are from the current shared structure profile.";
  return `<section class="unit-profile structure-profile" aria-label="${html(card.displayName)} statistics">
    <h3>${heading} · ${question ? "QUESTION" : "current profile"}</h3>
    <p>${confidence}</p>
    ${statGridMarkup(values, ["Health", "Damage", "Hit speed"])}
  </section>`;
}

// A plain reading of the resource receipt: what the building makes, how long it
// stands, and what it leaves when destroyed. QUESTION fields keep their label.
function resourceCycleMarkup(card) {
  const profile = card.buildingRuntime;
  if (profile?.class !== "resource") return "";
  const policy = profile.policy ?? {};
  const flag = (field) => policy[field]?.disposition === "question"
    ? ' <span class="stat-flag">(QUESTION)</span>' : "";
  return `<ul class="resource-cycle" aria-label="How ${html(card.displayName)} works">
      <li><b>While standing</b><span>Makes ${formatter.format(profile.generationAmount)} elixir${flag("generationAmount")} every ${secondsValue(profile.generationCadenceTicks)}${flag("generationCadenceTicks")}</span></li>
      <li><b>Lifetime</b><span>Stands for ${secondsValue(profile.lifetimeTicks)}${flag("lifetimeTicks")}</span></li>
      <li><b>When destroyed</b><span>Grants ${formatter.format(profile.destructionAmount)} elixir${flag("destructionAmount")}</span></li>
    </ul>`;
}

function roleChipsMarkup(chips) {
  return chips.map(({ label, provisional }) => `<li class="role-chip${provisional ? " is-provisional" : ""}">${html(label)}${provisional ? '<span class="visually-hidden"> (provisional)</span>' : ""}</li>`).join("");
}

function renderCardDetails(card) {
  const lore = getCardLore(card.id);
  const unitQuestionFlags = unitQuestionFlagsByCardId.get(card.id) ?? emptyQuestionFlags;
  const deckIndex = currentDeckIds.indexOf(card.id);
  const rarity = rarityLabel(card);
  const chips = roleChips(card);
  const provisional = chips.some((entry) => entry.provisional) || hasQuestionStat(card);
  const legendMarks = card.kind === "effect" ? "estimate labels" : "QUESTION labels";
  cardDetails.innerHTML = `<div class="detail-topbar">
      <button type="button" class="detail-back" data-action="back-to-cards"><span aria-hidden="true">←</span> Cards</button>
      <span class="detail-position">Card ${cards.indexOf(card) + 1} of ${cards.length}</span>
    </div>
    <div class="detail-heading">
      <div class="detail-portrait">${cardFaceMarkup(card, { tag: false })}</div>
      <div class="detail-heading-copy">
        <p class="detail-kicker"><span class="rarity-glyph" data-rarity="${rarityKey(card)}" aria-hidden="true"></span>${html(kindLabel(card))}${rarity === null ? "" : ` · ${html(rarity)}`}</p>
        <h2 id="selected-card-title" tabindex="-1">${html(card.displayName)}</h2>
        <p class="detail-meta">${html(capitalize(cardCountLabel(card)))}</p>
        ${deckIndex < 0 ? "" : `<p class="detail-deck-note">In your deck · slot ${deckIndex + 1}</p>`}
      </div>
      <span class="detail-cost" role="img" aria-label="Costs ${card.cost} elixir">${card.cost}</span>
    </div>
    <ul class="role-chips" aria-label="At a glance">${roleChipsMarkup(chips)}</ul>
    <section class="detail-section" aria-labelledby="selected-card-summary-title">
      <h3 class="detail-label" id="selected-card-summary-title">What it does</h3>
      <p class="detail-description">${html(descriptionFor(card))}</p>
      ${resourceCycleMarkup(card)}
    </section>
    <section class="detail-section detail-stats" aria-labelledby="selected-card-stats-title">
      <h3 class="detail-label" id="selected-card-stats-title">Stats</h3>
      ${card.kind === "effect" ? radiusSpellProfileMarkup(card)
        : card.kind === "structure" ? structureProfileMarkup(card)
          : card.entities.map((entity) => unitProfileMarkup(entity,
            unitQuestionFlags.get(entity) ?? emptyQuestionFlags,
            card.entities.length === 1)).join("")}
      ${card.entities.length > 1 ? '<p class="detail-footnote">Health and damage are shown per unit. Count is the number deployed by the card.</p>' : ""}
      ${provisional ? `<p class="detail-legend"><span class="legend-swatch" aria-hidden="true"></span><span>Dashed outlines and ${legendMarks} mark provisional values. The game uses them, but they are not confirmed yet.</span></p>` : ""}
    </section>
    ${lore === null ? "" : `<section class="card-lore" aria-labelledby="selected-card-lore-title">
      <h3 id="selected-card-lore-title">Field note</h3>
      <p>${html(lore)}</p>
    </section>`}`;
  for (const button of cardGrid.querySelectorAll("[data-card-id]")) {
    button.setAttribute("aria-pressed", String(button.dataset.cardId === card.id));
  }
}

function renderCollection() {
  const query = search.value.trim().toLocaleLowerCase("en");
  const matches = cards.filter((card) => query === "" ||
    card.displayName.toLocaleLowerCase("en").includes(query) ||
    kindLabel(card).toLocaleLowerCase("en").includes(query) ||
    card.entities.some((entity) => entity.displayName.toLocaleLowerCase("en").includes(query)));
  cardGrid.innerHTML = matches.map(collectionCardMarkup).join("");
  const isEmpty = matches.length === 0;
  cardGrid.hidden = isEmpty;
  emptyCollection.hidden = !isEmpty;
  cardDetails.hidden = isEmpty;
  if (isEmpty) {
    views.get("cards").dataset.detailOpen = "false";
    emptyCollection.innerHTML = `<p>"${html(search.value.trim())}" is not in the playable collection yet. Only cards supported by live decks are shown.</p><button class="search-clear" type="button" data-action="clear-search">Clear search</button>`;
  }
  renderCardDetails(cardById.get(selectedCardId));
}

function averageCost() {
  return currentDeckIds.reduce((total, id) => total + cardById.get(id).cost, 0) /
    currentDeckIds.length;
}

function renderHeroCrew() {
  if (heroCrew === null) return;
  heroCrew.innerHTML = currentDeckIds.slice(0, 3).map((id) => {
    const card = cardById.get(id);
    return `<span class="hero-crew-card">${cardFaceMarkup(card)}<span class="hero-crew-name">${html(card.displayName)}</span></span>`;
  }).join("");
}

function renderDeckCurve() {
  if (deckCurve === null) return;
  const last = CURVE_COSTS.length - 1;
  const counts = CURVE_COSTS.map((cost, index) => currentDeckIds.filter((id) => {
    const value = cardById.get(id).cost;
    return index === last ? value >= cost : value === cost;
  }).length);
  const tallest = Math.max(1, ...counts);
  deckCurve.innerHTML = CURVE_COSTS.map((cost, index) => `<span class="curve-col"><span class="curve-count">${counts[index] === 0 ? "" : counts[index]}</span><span class="curve-track"><span class="curve-bar" style="--fill: ${counts[index] / tallest}"></span></span><span class="curve-cost">${index === last ? `${cost}+` : cost}</span></span>`).join("");
  const described = CURVE_COSTS.flatMap((cost, index) => counts[index] === 0 ? [] : [
    `${counts[index]} ${counts[index] === 1 ? "card costs" : "cards cost"} ${index === last ? `${cost} or more` : cost}`,
  ]);
  deckCurve.setAttribute("aria-label", `Elixir costs in your deck: ${described.join(", ")}`);
}

function deckMixText() {
  const counts = new Map();
  for (const id of currentDeckIds) {
    const { kind } = cardById.get(id);
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return Object.keys(KIND_COUNT_WORDS).filter((kind) => counts.has(kind)).map((kind) => {
    const count = counts.get(kind);
    const [one, many] = KIND_COUNT_WORDS[kind];
    return `${count} ${count === 1 ? one : many}`;
  }).join(" · ");
}

function renderDeckSummary() {
  const average = averageCost().toFixed(2);
  for (const node of document.querySelectorAll("[data-deck-size]")) node.textContent = String(currentDeckIds.length);
  for (const node of document.querySelectorAll("[data-average-cost]")) node.textContent = average;
  homeDeck.innerHTML = currentDeckIds.map((id) => compactCardMarkup(cardById.get(id))).join("");
  deckCards.innerHTML = currentDeckIds.map((id, index) =>
    deckCardMarkup(cardById.get(id), index)).join("");
  const isStandard = currentDeckIds.every((id, index) => id === PLAYABLE_CARD_IDS[index]);
  for (const node of document.querySelectorAll("[data-deck-card-count]")) {
    node.textContent = String(currentDeckIds.length);
  }
  for (const node of document.querySelectorAll("[data-deck-kind]")) {
    node.textContent = isStandard ? "STANDARD DECK" : "CUSTOM DECK";
  }
  for (const node of document.querySelectorAll("[data-deck-mix]")) node.textContent = deckMixText();
  if (battleLabel !== null) {
    battleLabel.textContent = `${isStandard ? "STANDARD" : "CUSTOM"} DECK · LIVE MATCH`;
  }
  renderHeroCrew();
  renderDeckCurve();
  renderReplacementChoices();
}

function postBattleState(active) {
  if (!battleFrameReady || !battleFrame?.contentWindow) return;
  battleFrame.contentWindow.postMessage({
    active,
    channel: "moss-and-ember-battle",
    deckIds: [...currentDeckIds],
    presentation: {
      bodyCssPixels: window.innerWidth <= 600 ? 13 : 26,
      frameScale: battleFrameScale,
    },
  }, window.location.origin);
}

function renderReplacementChoices() {
  const isOpen = selectedSlotIndex !== null;
  replacementPanel.hidden = !isOpen;
  for (const button of deckCards.querySelectorAll("[data-replace-slot]")) {
    button.setAttribute("aria-expanded", String(Number(button.dataset.replaceSlot) === selectedSlotIndex));
  }
  if (!isOpen) return;
  const currentCard = cardById.get(currentDeckIds[selectedSlotIndex]);
  const deckTotal = currentDeckIds.reduce((total, id) => total + cardById.get(id).cost, 0);
  const available = EDITABLE_MIXED_DECK_CARD_IDS
    .filter((id) => !currentDeckIds.includes(id))
    .map((id) => cardById.get(id));
  document.querySelector("[data-replacement-title]").textContent =
    `Replace slot ${selectedSlotIndex + 1} · ${currentCard.displayName}`;
  replacementChoices.innerHTML = available.map((card) => {
    const nextAverage = ((deckTotal - currentCard.cost + card.cost) / currentDeckIds.length).toFixed(2);
    return `<button class="replacement-choice" type="button" data-replacement-card-id="${html(card.id)}" aria-label="Replace with ${html(card.displayName)}, costs ${card.cost} elixir, new average ${nextAverage}">
    ${cardFaceMarkup(card)}<span class="replacement-choice-copy"><strong>${html(card.displayName)}</strong><small>${html(roleSummary(card))}</small><small class="replacement-average">New average ${nextAverage}</small></span>
  </button>`;
  }).join("");
  if (available.length === 0) {
    replacementChoices.innerHTML = '<p class="replacement-empty">Every available card is already in your deck.</p>';
  }
}

function closeReplacement({ focusSlot = true } = {}) {
  const previousSlot = selectedSlotIndex;
  selectedSlotIndex = null;
  replacementPanel.hidden = true;
  renderReplacementChoices();
  if (focusSlot && previousSlot !== null) {
    deckCards.querySelector(`[data-replace-slot="${previousSlot}"]`)?.focus();
  }
}

function chooseReplacement(cardId) {
  if (selectedSlotIndex === null || !EDITABLE_MIXED_DECK_CARD_IDS.includes(cardId) ||
      currentDeckIds.includes(cardId)) return;
  const index = selectedSlotIndex;
  const previous = cardById.get(currentDeckIds[index]);
  const replacement = cardById.get(cardId);
  currentDeckIds[index] = cardId;
  selectedSlotIndex = null;
  lastReplacedSlotIndex = index;
  renderDeckSummary();
  if (deckStatus !== null) {
    deckStatus.textContent = `${replacement.displayName} replaced ${previous.displayName}. Average elixir ${averageCost().toFixed(2)}.`;
  }
  deckCards.querySelector(`[data-replace-slot="${index}"]`)?.focus();
}

function ensureBattleFrame() {
  if (battleFrame !== null) return;
  const template = document.querySelector("#battle-frame-template");
  battleFrame = template.content.firstElementChild.cloneNode(true);
  battleFrame.addEventListener("load", () => {
    battleFrameReady = true;
    postBattleState(currentView === "battle");
  }, { once: true });
  battleFrameSlot.replaceChildren(battleFrame);
  layoutBattleFrame();
}

function layoutBattleFrame() {
  if (battleFrame === null) return;
  const bounds = battleFrameSlot.getBoundingClientRect();
  const slotStyle = getComputedStyle(battleFrameSlot);
  const borderLeft = Number.parseFloat(slotStyle.borderLeftWidth) || 0;
  const borderRight = Number.parseFloat(slotStyle.borderRightWidth) || 0;
  const borderTop = Number.parseFloat(slotStyle.borderTopWidth) || 0;
  const borderBottom = Number.parseFloat(slotStyle.borderBottomWidth) || 0;
  const width = bounds.width - borderLeft - borderRight;
  const height = bounds.height - borderTop - borderBottom;
  const scale = Math.min(width / 720, height / 1_280);
  if (!Number.isFinite(scale) || scale <= 0) return;
  battleFrame.style.left = `${(width - 720 * scale) / 2}px`;
  battleFrame.style.top = `${(height - 1_280 * scale) / 2}px`;
  battleFrame.style.transform = `scale(${scale})`;
  battleFrameScale = scale;
  postBattleState(currentView === "battle");
}

const battleFrameSlotResizeObserver = new ResizeObserver(layoutBattleFrame);
battleFrameSlotResizeObserver.observe(battleFrameSlot);

function closeDetailAndFocusList() {
  const cardsView = views.get("cards");
  cardsView.dataset.detailOpen = "false";
  requestAnimationFrame(() => cardGrid.querySelector(`[data-card-id="${CSS.escape(selectedCardId)}"]`)?.focus());
}

function keepFocusedControlClearOfNavigation(target) {
  const nav = document.querySelector(".app-nav");
  if (!root.contains(target) || getComputedStyle(nav).position !== "fixed") return;
  requestAnimationFrame(() => {
    if (document.activeElement !== target) return;
    const bounds = target.getBoundingClientRect();
    const navBounds = nav.getBoundingClientRect();
    const safeTop = 8;
    const safeBottom = navBounds.top - 8;
    const scrollBy = bounds.bottom > safeBottom
      ? bounds.bottom - safeBottom
      : bounds.top < safeTop ? bounds.top - safeTop : 0;
    if (scrollBy !== 0) window.scrollBy({ top: scrollBy, behavior: "instant" });
  });
}

document.addEventListener("focusin", (event) => {
  if (event.target instanceof HTMLElement && event.target.closest(".app-main")) {
    keepFocusedControlClearOfNavigation(event.target);
  }
});

function setView(name, { focus = true } = {}) {
  if (!views.has(name)) return false;
  if (currentView === "battle" && name !== "battle") postBattleState(false);
  currentView = name;
  root.dataset.viewActive = name;
  for (const [viewName, view] of views) view.hidden = viewName !== name;
  for (const button of navButtons) {
    if (button.dataset.navTo === name) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  if (name === "battle") {
    ensureBattleFrame();
    postBattleState(true);
  }
  if (name === "cards") {
    views.get("cards").dataset.detailOpen = "false";
    renderCollection();
  }
  if (name === "deck") renderDeckSummary();
  if (focus) views.get(name).querySelector("h1")?.focus();
  return true;
}

// On phones the card info replaces the grid, so it opens at the top like a new screen.
function openPhoneDetail() {
  views.get("cards").dataset.detailOpen = "true";
  window.scrollTo({ top: 0, behavior: "instant" });
  document.querySelector("#selected-card-title")?.focus({ preventScroll: true });
}

function chooseCard(cardId, fromDeck = false) {
  if (!cardById.has(cardId)) return;
  selectedCardId = cardId;
  renderCollection();
  if (fromDeck) setView("cards", { focus: false });
  if (window.matchMedia(PHONE_LAYOUT_QUERY).matches) {
    openPhoneDetail();
  } else if (fromDeck) {
    document.querySelector("#selected-card-title")?.focus();
  }
}

for (const node of document.querySelectorAll("[data-collection-count]")) {
  node.textContent = String(cards.length);
}
renderDeckSummary();
renderCollection();
for (const button of navButtons) {
  button.addEventListener("click", () => setView(button.dataset.navTo));
}
for (const button of document.querySelectorAll('[data-action="begin-battle"]')) {
  button.addEventListener("click", () => setView("battle"));
}
for (const button of document.querySelectorAll('[data-action="browse-cards"]')) {
  button.addEventListener("click", () => setView("cards"));
}
document.querySelector('[data-action="leave-battle"]').addEventListener("click", () => setView("home"));
search.addEventListener("input", renderCollection);
window.addEventListener("resize", layoutBattleFrame, { passive: true });

document.addEventListener("click", (event) => {
  const replacementButton = event.target.closest("[data-replacement-card-id]");
  if (replacementButton) {
    chooseReplacement(replacementButton.dataset.replacementCardId);
    return;
  }
  const replaceSlot = event.target.closest("[data-replace-slot]");
  if (replaceSlot) {
    selectedSlotIndex = Number(replaceSlot.dataset.replaceSlot);
    renderReplacementChoices();
    replacementChoices.querySelector("[data-replacement-card-id]")?.focus();
    return;
  }
  if (event.target.closest('[data-action="cancel-replacement"]')) {
    closeReplacement();
    return;
  }
  if (event.target.closest('[data-action="clear-search"]')) {
    search.value = "";
    renderCollection();
    search.focus();
    return;
  }
  const cardButton = event.target.closest("[data-card-id]");
  if (cardButton && cardById.has(cardButton.dataset.cardId)) {
    const isDeck = cardButton.closest("[data-deck-cards], [data-home-deck]") !== null;
    chooseCard(cardButton.dataset.cardId, isDeck);
    return;
  }
  if (event.target.closest('[data-action="back-to-cards"]')) closeDetailAndFocusList();
});

document.addEventListener("keydown", (event) => {
  const cardsView = views.get("cards");
  if (event.key === "Escape" && currentView === "cards" &&
      cardsView.dataset.detailOpen === "true") {
    event.preventDefault();
    closeDetailAndFocusList();
    return;
  }
  if (event.key === "Escape" && currentView === "deck" && selectedSlotIndex !== null) {
    event.preventDefault();
    closeReplacement();
  }
});

window.addEventListener("pagehide", () => postBattleState(false));
