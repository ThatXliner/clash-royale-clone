import { createPlayableRoster, PLAYABLE_CARD_IDS } from "../content/playable-roster.js";

const cards = createPlayableRoster();
const cardById = new Map(cards.map((card) => [card.id, card]));
const root = document.querySelector(".app-shell");
const views = new Map([...document.querySelectorAll("[data-app-view]")]
  .map((view) => [view.dataset.appView, view]));
const navButtons = [...document.querySelectorAll("[data-nav-to]")];
const cardGrid = document.querySelector("[data-card-grid]");
const deckCards = document.querySelector("[data-deck-cards]");
const homeDeck = document.querySelector("[data-home-deck]");
const cardDetails = document.querySelector("[data-card-detail]");
const emptyCollection = document.querySelector("[data-card-empty]");
const search = document.querySelector("[data-card-search]");
const battleFrameSlot = document.querySelector("[data-battle-frame-slot]");
let selectedCardId = PLAYABLE_CARD_IDS[0];
let currentView = "home";
let battleFrame = null;
let battleFrameReady = false;

const formatter = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });

function html(value) {
  return String(value).replace(/[&<>]/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;",
  })[character]).replaceAll(String.fromCharCode(34), "&quot;")
    .replaceAll(String.fromCharCode(39), "&#39;");
}

function countLabel(count) {
  return `${formatter.format(count)} ${count === 1 ? "unit" : "units"}`;
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
  if (mode === "ground-and-air") return "ground and air";
  if (mode === "ground") return "ground";
  if (mode === "air") return "air";
  if (mode === "structures") return "structures";
  if (mode === "none") return "no targets";
  return "not available";
}

function descriptionFor(card) {
  if (card.entities.length === 1) {
    const [entity] = card.entities;
    const layer = entity.layer === "air" ? "Flying" : "Ground";
    const attack = entity.delivery === "projectile" ? "ranged attacks" : "melee attacks";
    return `${layer} unit · ${attack} · targets ${targetLabel(entity.targetMode)}.`;
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

function artMarkup(cardId) {
  return `<span class="card-art" data-card-art="${html(cardId)}" aria-hidden="true"></span>`;
}

function compactCardMarkup(card) {
  const count = card.formation.totalCount;
  return `<button class="mini-card" type="button" data-card-id="${html(card.id)}" aria-label="Inspect ${html(card.displayName)}, ${countLabel(count)}, ${card.cost} elixir">
    <span class="mini-cost" aria-hidden="true">${card.cost}</span>${artMarkup(card.id)}<span class="mini-card-name">${html(card.displayName)}</span>
  </button>`;
}

function deckCardMarkup(card) {
  const count = card.formation.totalCount;
  return `<button class="deck-card-button" type="button" data-card-id="${html(card.id)}" aria-label="Inspect ${html(card.displayName)}, ${countLabel(count)}, ${card.cost} elixir">
    ${artMarkup(card.id)}<span class="deck-card-copy"><strong>${html(card.displayName)}</strong><small>${countLabel(count)} · ${card.cost} elixir</small></span>
  </button>`;
}

function collectionCardMarkup(card) {
  const count = card.formation.totalCount;
  return `<button class="collection-card" type="button" data-card-id="${html(card.id)}" aria-pressed="${card.id === selectedCardId}" aria-label="${html(card.displayName)}, ${countLabel(count)}, costs ${card.cost} elixir">
    ${artMarkup(card.id)}<span class="collection-card-info"><strong>${html(card.displayName)}</strong><span class="elixir-token" aria-label="${card.cost} elixir">${card.cost}</span></span>
  </button>`;
}

function statCell(label, value) {
  return `<div class="stat-cell"><span>${label}</span><strong>${html(value)}</strong></div>`;
}

function unitProfileMarkup(entity) {
  const heading = entity.count === 1
    ? html(entity.displayName) : `${formatter.format(entity.count)} × ${html(entity.displayName)}`;
  const delivery = entity.delivery === "projectile" ? "Ranged" : "Melee";
  const layer = entity.layer === "air" ? "Flying" : "Ground";
  const values = [
    ["Count", formatter.format(entity.count)],
    ["Health", entity.hitpoints === null ? "Not available" : formatter.format(entity.hitpoints)],
    ["Damage", entity.damage === null ? "Not available" : `${formatter.format(entity.damage)} per attack`],
    ["Hit speed", secondsValue(entity.hitSpeedTicks)],
    ["Range", tileValue(entity.rangeMillitiles)],
    ["Targets", targetLabel(entity.targetMode)],
    ["Moves", speedValue(entity.movementMillitilesPerSecond)],
  ];
  return `<section class="unit-profile" aria-label="${heading} statistics">
    <h3>${heading}</h3><p>${layer} · ${delivery} · Targets ${html(targetLabel(entity.targetMode))}</p>
    <div class="stat-grid">${values.map(([label, value]) => statCell(label, value)).join("")}</div>
  </section>`;
}

function renderCardDetails(card) {
  const totalCount = card.formation.totalCount;
  cardDetails.innerHTML = `<div class="detail-heading">
      <button type="button" class="detail-back" data-action="back-to-cards"><span aria-hidden="true">←</span> Cards</button>
      <div><h2 id="selected-card-title" tabindex="-1">${html(card.displayName)}</h2><p>${countLabel(totalCount)} · ${card.cost} elixir</p></div>
      <span class="detail-cost" aria-label="${card.cost} elixir">${card.cost}</span>
    </div>
    <p class="detail-description">${html(descriptionFor(card))}</p>
    ${card.entities.map(unitProfileMarkup).join("")}
    ${card.entities.length > 1 ? '<p class="detail-footnote">Health and damage are shown per unit. Count is the number deployed by the card.</p>' : ""}`;
  for (const button of cardGrid.querySelectorAll("[data-card-id]")) {
    button.setAttribute("aria-pressed", String(button.dataset.cardId === card.id));
  }
}

function renderCollection() {
  const query = search.value.trim().toLocaleLowerCase("en");
  const matches = cards.filter((card) => query === "" ||
    card.displayName.toLocaleLowerCase("en").includes(query) ||
    card.entities.some((entity) => entity.displayName.toLocaleLowerCase("en").includes(query)));
  cardGrid.innerHTML = matches.map(collectionCardMarkup).join("");
  const isEmpty = matches.length === 0;
  cardGrid.hidden = isEmpty;
  emptyCollection.hidden = !isEmpty;
  cardDetails.hidden = isEmpty;
  if (isEmpty) {
    views.get("cards").dataset.detailOpen = "false";
    emptyCollection.textContent = `“${search.value.trim()}” is not playable in a standard match yet. Only cards supported by this live deck are shown.`;
  }
  renderCardDetails(cardById.get(selectedCardId));
}

function averageCost() {
  return cards.reduce((total, card) => total + card.cost, 0) / cards.length;
}

function renderDeckSummary() {
  const average = averageCost().toFixed(2);
  for (const node of document.querySelectorAll("[data-deck-size]")) node.textContent = String(cards.length);
  for (const node of document.querySelectorAll("[data-average-cost]")) node.textContent = average;
  homeDeck.innerHTML = cards.map(compactCardMarkup).join("");
  deckCards.innerHTML = cards.map(deckCardMarkup).join("");
}

function postBattleState(active) {
  if (!battleFrameReady || !battleFrame?.contentWindow) return;
  battleFrame.contentWindow.postMessage({
    active,
    channel: "moss-and-ember-battle",
  }, window.location.origin);
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
  const scale = Math.min(bounds.width / 720, bounds.height / 1_280);
  if (!Number.isFinite(scale) || scale <= 0) return;
  battleFrame.style.left = `${(bounds.width - 720 * scale) / 2}px`;
  battleFrame.style.top = `${(bounds.height - 1_280 * scale) / 2}px`;
  battleFrame.style.transform = `scale(${scale})`;
}

function closeDetailAndFocusList() {
  const cardsView = views.get("cards");
  cardsView.dataset.detailOpen = "false";
  requestAnimationFrame(() => cardGrid.querySelector(`[data-card-id="${CSS.escape(selectedCardId)}"]`)?.focus());
}

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
  if (focus) views.get(name).querySelector("h1")?.focus({ preventScroll: true });
  return true;
}

function chooseCard(cardId, fromDeck = false) {
  if (!cardById.has(cardId)) return;
  selectedCardId = cardId;
  renderCollection();
  if (fromDeck) {
    setView("cards", { focus: false });
    if (window.matchMedia("(max-width: 760px)").matches) {
      views.get("cards").dataset.detailOpen = "true";
      document.querySelector("#selected-card-title")?.focus({ preventScroll: true });
    } else {
      document.querySelector("#selected-card-title")?.focus({ preventScroll: true });
    }
  } else if (window.matchMedia("(max-width: 760px)").matches) {
    views.get("cards").dataset.detailOpen = "true";
    document.querySelector("#selected-card-title")?.focus({ preventScroll: true });
  }
}

renderDeckSummary();
renderCollection();
for (const button of navButtons) {
  button.addEventListener("click", () => setView(button.dataset.navTo));
}
document.querySelector('[data-action="begin-battle"]').addEventListener("click", () => setView("battle"));
document.querySelector('[data-action="browse-cards"]').addEventListener("click", () => setView("cards"));
document.querySelector('[data-action="leave-battle"]').addEventListener("click", () => setView("home"));
search.addEventListener("input", renderCollection);
window.addEventListener("resize", layoutBattleFrame, { passive: true });

document.addEventListener("click", (event) => {
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
  }
});

window.addEventListener("pagehide", () => postBattleState(false));
