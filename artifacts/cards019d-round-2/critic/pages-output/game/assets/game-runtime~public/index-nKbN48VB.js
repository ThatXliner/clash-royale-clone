import { t as __esmMin } from "../rolldown-runtime-Cl99QfTQ.js";
import { t as init_modulepreload_polyfill } from "./index~public/ui-arena-shell-D-709RTF.js";
import { M as createPlayableRoster, P as init_playable_roster, c as init_session_card_catalog, d as init_session_spell_profile_receipts, j as PLAYABLE_CARD_IDS, l as projectSessionNonUnitBattleCard, o as init_session_troop_roster, r as init_editable_deck, s as projectSessionTroopBattleCard, t as EDITABLE_MIXED_DECK_CARD_IDS, u as createSessionRadiusSpellProfileReceipts } from "./index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-C8NHd_jT.js";
//#endregion
//#region src/ui/card-portrait-art.js
function getCardPortrait(cardId) {
	if (typeof cardId !== "string" || !Object.hasOwn(CARD_PORTRAITS, cardId)) return null;
	const portrait = CARD_PORTRAITS[cardId];
	return Object.freeze({
		...portrait,
		src: PORTRAIT_ASSET_PATHS[portrait.asset]
	});
}
var CARD_PORTRAITS, PORTRAIT_ASSET_PATHS;
function init_card_portrait_art() {
	return (init_card_portrait_art = __esmMin((() => {
		CARD_PORTRAITS = Object.freeze({
			coilblade: Object.freeze({
				asset: "card-portraits-painted",
				cell: 0
			}),
			mossguard: Object.freeze({
				asset: "card-portraits-painted",
				cell: 1
			}),
			copperskiff: Object.freeze({
				asset: "card-portraits-painted",
				cell: 2
			}),
			skymaul: Object.freeze({
				asset: "card-portraits-painted",
				cell: 3
			}),
			brassbolt: Object.freeze({
				asset: "card-portraits-painted",
				cell: 4
			}),
			reedsting: Object.freeze({
				asset: "card-portraits-painted",
				cell: 5
			}),
			"briar-band": Object.freeze({
				asset: "card-portraits-painted",
				cell: 6
			}),
			cinderlings: Object.freeze({
				asset: "card-portraits-painted",
				cell: 7
			}),
			stonehauler: Object.freeze({
				asset: "stonehauler-painted",
				cell: null
			}),
			thornscouts: Object.freeze({
				asset: "thornscouts-painted",
				cell: null
			}),
			forgeguard: Object.freeze({
				asset: "forgeguard-painted",
				cell: null
			}),
			"squall-orb": Object.freeze({
				asset: "squall-orb-painted",
				cell: null
			}),
			"cinder-host": Object.freeze({
				asset: "cinder-host-painted",
				cell: null
			}),
			ironroot: Object.freeze({
				asset: "ironroot-painted",
				cell: null
			}),
			"sunthread-pair": Object.freeze({
				asset: "sunthread-pair-painted",
				cell: null
			}),
			"duskwing-trio": Object.freeze({
				asset: "duskwing-trio-painted",
				cell: null
			}),
			"gloamwing-cluster": Object.freeze({
				asset: "gloamwing-cluster-painted",
				cell: null
			}),
			"coppershade-flock": Object.freeze({
				asset: "coppershade-flock-painted",
				cell: null
			}),
			"ember-basin": Object.freeze({
				asset: "ember-basin-portrait-painted-v2",
				cell: null
			}),
			kilnkeeper: Object.freeze({
				asset: "kilnkeeper-portrait-painted",
				cell: null
			})
		});
		PORTRAIT_ASSET_PATHS = Object.freeze({
			"card-portraits-painted": new URL(new URL("../../public/assets/card-portraits-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"stonehauler-painted": new URL(new URL("../../public/assets/stonehauler-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"thornscouts-painted": new URL(new URL("../../public/assets/thornscouts-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"forgeguard-painted": new URL(new URL("../../public/assets/forgeguard-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"squall-orb-painted": new URL(new URL("../../public/assets/squall-orb-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"cinder-host-painted": new URL(new URL("../../public/assets/cinder-host-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"ironroot-painted": new URL(new URL("../../public/assets/ironroot-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"sunthread-pair-painted": new URL(new URL("../../public/assets/sunthread-pair-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"duskwing-trio-painted": new URL(new URL("../../public/assets/duskwing-trio-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"gloamwing-cluster-painted": new URL(new URL("../../public/assets/gloamwing-cluster-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"coppershade-flock-painted": new URL(new URL("../../public/assets/coppershade-flock-painted.webp", import.meta.url).href, "" + import.meta.url).href,
			"ember-basin-portrait-painted-v2": new URL(new URL("../../public/assets/ember-basin-portrait-painted-v2.webp", import.meta.url).href, "" + import.meta.url).href,
			"kilnkeeper-portrait-painted": new URL(new URL("../../public/assets/kilnkeeper-portrait-painted.webp", import.meta.url).href, "" + import.meta.url).href
		});
	})))();
}
//#endregion
//#region src/ui/card-lore.js
function getCardLore(cardId) {
	return CARD_LORE[cardId] ?? null;
}
var CARD_LORE;
function init_card_lore() {
	return (init_card_lore = __esmMin((() => {
		CARD_LORE = Object.freeze({
			coilblade: "A clockwork duelist was assembled from a cracked kiln bell and copper from the old riverworks. At dusk, its blade catches the forge light like a thin line of sunrise.",
			mossguard: "This grove keeper wears a shield cut from an old bough, with leaves pressed into the grain. Each leaf marks a trail the woodland guides promised to keep clear.",
			copperskiff: "The little airship began as a copper kettle patched into a hull beside the mill. Its canvas sail still carries the scent of river rain.",
			skymaul: "A stone wanderer drifted down from the cloud shelf, carrying a hammer left behind by the first valley smith. Copper bands around its arms keep little chips of rock from tumbling loose.",
			brassbolt: "The ranger made a crossbow from a brass hinge and a piece of bell metal. Amber fletching on each bolt points home to the lanterns of the foundry.",
			reedsting: "A marsh pathfinder ties reeds into a hood and the cords of each arrow. Small stitched marks on the lining count every crossing through the river grass.",
			"briar-band": "The runners and darters met in a thorn maze and chose the same leaf mark for their masks. They leave chalk arrows on the stumps so the next scout can find the way out.",
			cinderlings: "Three ember sprouts woke beneath a fallen lantern in a bed of ash. They gather sparks in nutshell caps and leave tiny lights along the stones.",
			stonehauler: "This broad pack carrier is built around a core of quarry stone, wrapped in weathered rootwood. Copper bells on its straps ring out when it reaches the river workshops.",
			thornscouts: "The four Thornscouts mark safe crossings with tiny cuts in their light blades. Pale leaf masks turn their faces into a blur among the fern paths.",
			forgeguard: "Five Forgeguard keep the river workshops supplied with hammers and axes. Their copper aprons darken at the seams, but each hammer tap keeps the old bridge pins true.",
			"squall-orb": "Rivermark glassblowers formed the Squall Orb from stormglass swept downstream after a spring squall. Its copper collar rests on the foundry shelf, where apprentices mark the days they carried its bright shards through the rain.",
			"cinder-host": "Fifteen ember sprouts gathered in the ash beds when the Rivermark kiln first cooled for winter. At dawn, their scorched nutshell caps made a bright trail from the woodpile to the workshop door.",
			ironroot: "The oak beside Emberfall’s old foundry split when an ironstone seam surfaced through its roots. Rivermark smiths bound its crooked trunk with hammered copper and cut a broad blade from the dark seam.",
			"sunthread-pair": "When emberseed lights began appearing above the Rivermark root bridges, two woodland wardens braided copper thread through their yew bows so travelers could follow each safe trail. At dusk, the Sunthread Pair trade watch from the amber-lit fern paths and send warning arrows toward any lantern lost in the trees.",
			"duskwing-trio": "Three owl-moths hatched from a reed basket warmed beside an emberseed stove at the Emberfall river workshop. Each twilight they carry the seed’s tiny glow through the fern hollows, guiding Rivermark ferrymakers home above the water.",
			"gloamwing-cluster": "Gloamwings rise from the violet reeds at dusk to follow emberseeds down the riverbank. Five of them wheel around each warm spark until ferry bells call them home.",
			"coppershade-flock": "Coppershades roost in the offcuts piled outside the Rivermark river workshop. When the kiln wakes, all six glide over the canal and trade tiny sparks above their copper-lit nests.",
			"ember-basin": "The Ember Basin stands where the creek turns, its copper lip warmed by emberseeds carried down from the Moss & Ember workshop. At dusk, twin braces hold its long copper-ribbed launch channel above the water, ready to turn any unwelcome visitor away.",
			kilnkeeper: "Kilnkeeper tends the warm river kilns where rootwood beams are steamed and copper vessels are shaped, keeping each emberseed dry between shifts. When raiders threaten the workshop, he loads one emberseed into his broad-mouthed launcher and sends a single burst of sparks skittering across the ground."
		});
	})))();
}
//#endregion
//#region src/ui/app-shell.js
function html(value) {
	return String(value).replace(/[&<>]/gu, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;"
	})[character]).replaceAll(String.fromCharCode(34), "&quot;").replaceAll(String.fromCharCode(39), "&#39;");
}
function countLabel(count) {
	return `${formatter.format(count)} ${count === 1 ? "unit" : "units"}`;
}
function cardCountLabel(card) {
	if (card.kind === "effect") return "one spell";
	if (card.kind === "structure") return "one structure";
	return countLabel(card.formation.totalCount);
}
function pluralName(name, count) {
	if (count === 1) return name;
	if (/[^aeiou]y$/iu.test(name)) return `${name.slice(0, -1)}ies`;
	if (/s$/iu.test(name)) return name;
	return `${name}s`;
}
function tileValue(millitiles) {
	return millitiles === null ? "Not available" : `${formatter.format(millitiles / 1e3)} tiles`;
}
function secondsValue(ticks) {
	return ticks === null ? "Not available" : `${formatter.format(ticks / 60)} s`;
}
function speedValue(millitilesPerSecond) {
	return millitilesPerSecond === null ? "Not available" : `${formatter.format(millitilesPerSecond / 1e3)} tiles/s`;
}
function targetLabel(mode) {
	if (mode === "ground-and-air") return "ground and air";
	if (mode === "ground") return "ground";
	if (mode === "air") return "air";
	if (mode === "structures") return "structures";
	if (mode === "none") return "no targets";
	return "not available";
}
function classificationHasQuestion(entity) {
	return entity.deliveryPolicy?.kind === "question" || entity.layerPolicy?.kind === "question";
}
function questionClassificationCopy(entity) {
	const delivery = entity.delivery === "projectile" ? "ranged" : "melee";
	const layer = entity.layer === "air" ? "Flying" : "Ground";
	const provisionalFields = [];
	if (entity.layerPolicy?.kind === "question") provisionalFields.push(`${layer.toLocaleLowerCase("en")} layer`);
	if (entity.deliveryPolicy?.kind === "question") provisionalFields.push(`${delivery} delivery`);
	const confidenceNote = provisionalFields.length === 1 ? `The ${provisionalFields[0]} remains provisional for historical comparison.` : `The ${provisionalFields.join(" and ")} remain provisional for historical comparison.`;
	const combatConfidenceNote = entity.archetypeId === "kilnkeeper" && entity.sourceConfidencePolicy?.fields?.length > 0 ? " The 5-elixir cost is source backed; combat values are unverified estimates and remain QUESTION for historical comparison." : "";
	return `Current game: ${layer} unit · ${delivery} attacks · targets ${targetLabel(entity.targetMode)}. ${confidenceNote}${combatConfidenceNote}`;
}
function descriptionFor(card) {
	if (card.id === radiusSpellProfile.fact.cardId) {
		const fact = radiusSpellProfile.fact;
		return `Center-cast area spell · ${formatter.format(fact.damage)} damage to enemy ground troops, flying troops, buildings and crown towers within an estimated ${formatter.format(fact.areaDamageRadiusMillitiles / 1e3)}-tile radius. Crown-tower damage is an estimated ${100 + fact.crownTowerDamagePercent}% of troop damage. Impact takes about ${formatter.format(fact.impactDelayTicks / 60)} seconds. Projectile flight and knockback are not simulated.`;
	}
	if (card.kind === "structure") return `Stationary defensive structure · splash damage to ${targetLabel(card.buildingRuntime?.targetMode ?? card.targetMode)} targets. Its combat profile is QUESTION; shown combat values remain provisional.`;
	if (card.entities.length === 1) {
		const [entity] = card.entities;
		if (classificationHasQuestion(entity)) return questionClassificationCopy(entity);
		return `${entity.layer === "air" ? "Flying" : "Ground"} unit · ${entity.delivery === "projectile" ? "ranged attacks" : "melee attacks"} · targets ${targetLabel(entity.targetMode)}.`;
	}
	if (card.entities.some(classificationHasQuestion)) {
		const deployed = card.entities.map((entity) => `${formatter.format(entity.count)} ${pluralName(entity.displayName, entity.count)}`);
		const profiles = card.entities.map((entity) => {
			const profile = classificationHasQuestion(entity) ? questionClassificationCopy(entity) : `${entity.layer === "air" ? "Flying" : "Ground"} unit · ${entity.delivery === "projectile" ? "ranged" : "melee"} attacks · targets ${targetLabel(entity.targetMode)}.`;
			return `${entity.displayName}: ${profile}`;
		});
		return `Deploys ${deployed.join(" and ")} together. ${profiles.join(" ")}`;
	}
	const deployed = card.entities.map((entity) => `${formatter.format(entity.count)} ${pluralName(entity.displayName, entity.count)}`);
	const details = card.entities.map((entity) => {
		const verb = entity.delivery === "projectile" ? entity.count === 1 ? "fires ranged attacks" : "fire ranged attacks" : entity.count === 1 ? "makes melee attacks" : "make melee attacks";
		return `${pluralName(entity.displayName, entity.count)} ${verb} against ${targetLabel(entity.targetMode)} targets`;
	});
	return `Deploys ${deployed.join(" and ")} together. ${details.join("; ")}.`;
}
function artMarkup(cardId) {
	const portrait = getCardPortrait(cardId);
	const imageMarkup = portrait === null ? "" : `<span class="card-art-window">
      <img class="card-art-image${portrait.cell === null ? "" : " card-art-atlas"}"${portrait.cell === null ? "" : ` data-portrait-cell="${portrait.cell}"`} src="${html(portrait.src)}" alt="" decoding="async">
    </span>`;
	return `<span class="card-art" data-card-art="${html(cardId)}" aria-hidden="true">${imageMarkup}</span>`;
}
function compactCardMarkup(card) {
	return `<button class="mini-card" type="button" data-card-id="${html(card.id)}" aria-label="Inspect ${html(card.displayName)}, ${cardCountLabel(card)}, ${card.cost} elixir">
    <span class="mini-cost" aria-hidden="true">${card.cost}</span>${artMarkup(card.id)}<span class="mini-card-name">${html(card.displayName)}</span>
  </button>`;
}
function deckCardMarkup(card, index) {
	const selected = index === selectedSlotIndex;
	const recentlyReplaced = index === lastReplacedSlotIndex;
	return `<article class="deck-slot${selected ? " is-selected" : ""}${recentlyReplaced ? " is-recently-replaced" : ""}" data-slot-index="${index}">
    <button class="deck-card-button" type="button" data-card-id="${html(card.id)}" aria-label="Inspect ${html(card.displayName)}, ${cardCountLabel(card)}, ${card.cost} elixir in slot ${index + 1}">
      ${artMarkup(card.id)}<span class="deck-card-copy"><small>Slot ${index + 1}${recentlyReplaced ? "<span class=\"deck-slot-confirmation\">Updated</span>" : ""}</small><strong>${html(card.displayName)}</strong><small>${cardCountLabel(card)} · ${card.cost} elixir</small></span>
    </button>
    <button class="deck-replace-button" type="button" data-replace-slot="${index}" aria-expanded="${selected}" aria-controls="deck-replacement-panel">Replace</button>
  </article>`;
}
function collectionCardMarkup(card) {
	return `<button class="collection-card" type="button" data-card-id="${html(card.id)}" aria-pressed="${card.id === selectedCardId}" aria-label="${html(card.displayName)}, ${cardCountLabel(card)}, costs ${card.cost} elixir">
    ${artMarkup(card.id)}<span class="collection-card-info"><strong>${html(card.displayName)}</strong><span class="elixir-token" aria-label="${card.cost} elixir">${card.cost}</span></span>
  </button>`;
}
function statCell(label, value) {
	return `<div class="stat-cell"><span>${label}</span><strong>${html(value)}</strong></div>`;
}
function radiusSpellProfileMarkup() {
	const { fact } = radiusSpellProfile;
	const radius = tileValue(fact.areaDamageRadiusMillitiles);
	const target = targetLabel(fact.targetMode);
	const impactDelay = formatter.format(fact.impactDelayTicks / 60);
	const crown = `${formatter.format(100 + fact.crownTowerDamagePercent)}% (${formatter.format(Math.floor((fact.damage * (100 + fact.crownTowerDamagePercent) + 50) / 100))} damage per cast)`;
	return `<section class="unit-profile spell-profile" aria-label="Squall Orb spell profile">
    <h3>Center cast · estimated values</h3>
    <div class="stat-grid">${[
		["Area damage", `${formatter.format(fact.damage)} per target`],
		["Radius", `${radius} (estimate)`],
		["Targets", `${target} (estimate)`],
		["Crown towers", `${crown} (estimate)`],
		["Impact delay", `about ${impactDelay} seconds (estimate)`]
	].map(([label, value]) => statCell(label, value)).join("")}</div>
    <p>Radius, target coverage, tower damage, rounding and impact timing are estimates. Projectile flight and knockback are not simulated.</p>
  </section>`;
}
function unitProfileMarkup(entity) {
	const heading = entity.count === 1 ? html(entity.displayName) : `${formatter.format(entity.count)} × ${html(entity.displayName)}`;
	const delivery = entity.delivery === "projectile" ? "Ranged" : "Melee";
	const layer = entity.layer === "air" ? "Flying" : "Ground";
	const values = [
		["Count", formatter.format(entity.count)],
		["Health", entity.hitpoints === null ? "Not available" : formatter.format(entity.hitpoints)],
		["Damage", entity.damage === null ? "Not available" : `${formatter.format(entity.damage)} per attack`],
		["Hit speed", secondsValue(entity.hitSpeedTicks)],
		["Range", tileValue(entity.rangeMillitiles)],
		["Targets", targetLabel(entity.targetMode)],
		["Moves", speedValue(entity.movementMillitilesPerSecond)]
	];
	return `<section class="unit-profile" aria-label="${heading} statistics">
    <h3>${heading}</h3><p>${classificationHasQuestion(entity) ? html(questionClassificationCopy(entity)) : `${layer} · ${delivery} · Targets ${html(targetLabel(entity.targetMode))}`}</p>
    <div class="stat-grid">${values.map(([label, value]) => statCell(label, value)).join("")}</div>
  </section>`;
}
function structureProfileMarkup(card) {
	const profile = card.buildingRuntime;
	if (profile === void 0) return "";
	const question = profile.policy?.disposition === "question";
	const suffix = question ? " (QUESTION)" : "";
	const values = [
		["Cost", `${formatter.format(card.cost)} elixir`],
		["Health", `${formatter.format(profile.hitpoints)}${suffix}`],
		["Damage", `${formatter.format(profile.damage)} per attack${suffix}`],
		["Deploy", `${secondsValue(profile.deployTicks)}${suffix}`],
		["First hit", `${secondsValue(profile.firstHitTicks)}${suffix}`],
		["Hit speed", `${secondsValue(profile.hitSpeedTicks)}${suffix}`],
		["Lifetime", `${secondsValue(profile.lifetimeTicks)}${suffix}`],
		["Range", `${tileValue(profile.maxRangeMillitiles)}${suffix}`],
		["Splash radius", `${tileValue(profile.areaDamageRadiusMillitiles)}${suffix}`],
		["Targets", `${targetLabel(profile.targetMode)}${suffix}`]
	];
	const confidence = question ? "Cost is source backed; combat values are provisional profile estimates and remain QUESTION for historical comparison." : "Values are from the current shared structure profile.";
	return `<section class="unit-profile structure-profile" aria-label="${html(card.displayName)} statistics">
    <h3>Defensive structure · ${question ? "QUESTION" : "current profile"}</h3>
    <p>${confidence}</p>
    <div class="stat-grid">${values.map(([label, value]) => statCell(label, value)).join("")}</div>
  </section>`;
}
function renderCardDetails(card) {
	const lore = getCardLore(card.id);
	cardDetails.innerHTML = `<div class="detail-heading">
      <div class="detail-portrait">${artMarkup(card.id)}</div>
      <div class="detail-heading-copy">
        <button type="button" class="detail-back" data-action="back-to-cards"><span aria-hidden="true">←</span> Cards</button>
        <div><h2 id="selected-card-title" tabindex="-1">${html(card.displayName)}</h2><p>${cardCountLabel(card)} · ${card.cost} elixir</p></div>
      </div>
      <span class="detail-cost" aria-label="${card.cost} elixir">${card.cost}</span>
    </div>
    <p class="detail-description">${html(descriptionFor(card))}</p>
    ${lore === null ? "" : `<section class="card-lore" aria-labelledby="selected-card-lore-title">
      <span class="card-lore-label">Story</span><h3 id="selected-card-lore-title">A field note</h3>
      <p>${html(lore)}</p>
    </section>`}
    ${card.kind === "effect" ? radiusSpellProfileMarkup() : card.kind === "structure" ? structureProfileMarkup(card) : card.entities.map(unitProfileMarkup).join("")}
    ${card.entities.length > 1 ? "<p class=\"detail-footnote\">Health and damage are shown per unit. Count is the number deployed by the card.</p>" : ""}`;
	for (const button of cardGrid.querySelectorAll("[data-card-id]")) button.setAttribute("aria-pressed", String(button.dataset.cardId === card.id));
}
function renderCollection() {
	const query = search.value.trim().toLocaleLowerCase("en");
	const matches = cards.filter((card) => query === "" || card.displayName.toLocaleLowerCase("en").includes(query) || card.entities.some((entity) => entity.displayName.toLocaleLowerCase("en").includes(query)));
	cardGrid.innerHTML = matches.map(collectionCardMarkup).join("");
	const isEmpty = matches.length === 0;
	cardGrid.hidden = isEmpty;
	emptyCollection.hidden = !isEmpty;
	cardDetails.hidden = isEmpty;
	if (isEmpty) {
		views.get("cards").dataset.detailOpen = "false";
		emptyCollection.innerHTML = `<p>“${html(search.value.trim())}” is not in the playable collection yet. Only cards supported by live decks are shown.</p><button class="search-clear" type="button" data-action="clear-search">Clear search</button>`;
	}
	renderCardDetails(cardById.get(selectedCardId));
}
function averageCost() {
	return currentDeckIds.reduce((total, id) => total + cardById.get(id).cost, 0) / currentDeckIds.length;
}
function renderDeckSummary() {
	const average = averageCost().toFixed(2);
	for (const node of document.querySelectorAll("[data-deck-size]")) node.textContent = String(currentDeckIds.length);
	for (const node of document.querySelectorAll("[data-average-cost]")) node.textContent = average;
	homeDeck.innerHTML = currentDeckIds.map((id) => compactCardMarkup(cardById.get(id))).join("");
	deckCards.innerHTML = currentDeckIds.map((id, index) => deckCardMarkup(cardById.get(id), index)).join("");
	const isStandard = currentDeckIds.every((id, index) => id === PLAYABLE_CARD_IDS[index]);
	for (const node of document.querySelectorAll("[data-deck-card-count]")) node.textContent = String(currentDeckIds.length);
	for (const node of document.querySelectorAll("[data-deck-kind]")) node.textContent = isStandard ? "STANDARD DECK" : "CUSTOM DECK";
	if (battleLabel !== null) battleLabel.textContent = `${isStandard ? "STANDARD" : "CUSTOM"} DECK · LIVE MATCH`;
	renderReplacementChoices();
}
function postBattleState(active) {
	if (!battleFrameReady || !battleFrame?.contentWindow) return;
	battleFrame.contentWindow.postMessage({
		active,
		channel: "moss-and-ember-battle",
		deckIds: [...currentDeckIds]
	}, window.location.origin);
}
function renderReplacementChoices() {
	const isOpen = selectedSlotIndex !== null;
	replacementPanel.hidden = !isOpen;
	for (const button of deckCards.querySelectorAll("[data-replace-slot]")) button.setAttribute("aria-expanded", String(Number(button.dataset.replaceSlot) === selectedSlotIndex));
	if (!isOpen) return;
	const currentCard = cardById.get(currentDeckIds[selectedSlotIndex]);
	const available = EDITABLE_MIXED_DECK_CARD_IDS.filter((id) => !currentDeckIds.includes(id)).map((id) => cardById.get(id));
	document.querySelector("[data-replacement-title]").textContent = `Replace slot ${selectedSlotIndex + 1} · ${currentCard.displayName}`;
	replacementChoices.innerHTML = available.map((card) => `<button class="replacement-choice" type="button" data-replacement-card-id="${html(card.id)}" aria-label="Replace with ${html(card.displayName)}, costs ${card.cost} elixir">
    ${artMarkup(card.id)}<span><strong>${html(card.displayName)}</strong><small>${card.cost} elixir</small></span>
  </button>`).join("");
	if (available.length === 0) replacementChoices.innerHTML = "<p class=\"replacement-empty\">Every available card is already in your deck.</p>";
}
function closeReplacement({ focusSlot = true } = {}) {
	const previousSlot = selectedSlotIndex;
	selectedSlotIndex = null;
	replacementPanel.hidden = true;
	renderReplacementChoices();
	if (focusSlot && previousSlot !== null) deckCards.querySelector(`[data-replace-slot="${previousSlot}"]`)?.focus();
}
function chooseReplacement(cardId) {
	if (selectedSlotIndex === null || !EDITABLE_MIXED_DECK_CARD_IDS.includes(cardId) || currentDeckIds.includes(cardId)) return;
	const index = selectedSlotIndex;
	const previous = cardById.get(currentDeckIds[index]);
	const replacement = cardById.get(cardId);
	currentDeckIds[index] = cardId;
	selectedSlotIndex = null;
	lastReplacedSlotIndex = index;
	renderDeckSummary();
	if (deckStatus !== null) deckStatus.textContent = `${replacement.displayName} replaced ${previous.displayName}. Average elixir ${averageCost().toFixed(2)}.`;
	deckCards.querySelector(`[data-replace-slot="${index}"]`)?.focus();
}
function ensureBattleFrame() {
	if (battleFrame !== null) return;
	battleFrame = document.querySelector("#battle-frame-template").content.firstElementChild.cloneNode(true);
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
	const scale = Math.min(bounds.width / 720, bounds.height / 1280);
	if (!Number.isFinite(scale) || scale <= 0) return;
	battleFrame.style.left = `${(bounds.width - 720 * scale) / 2}px`;
	battleFrame.style.top = `${(bounds.height - 1280 * scale) / 2}px`;
	battleFrame.style.transform = `scale(${scale})`;
}
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
		const scrollBy = bounds.bottom > safeBottom ? bounds.bottom - safeBottom : bounds.top < safeTop ? bounds.top - safeTop : 0;
		if (scrollBy !== 0) window.scrollBy({
			top: scrollBy,
			behavior: "instant"
		});
	});
}
function setView(name, { focus = true } = {}) {
	if (!views.has(name)) return false;
	if (currentView === "battle" && name !== "battle") postBattleState(false);
	currentView = name;
	root.dataset.viewActive = name;
	for (const [viewName, view] of views) view.hidden = viewName !== name;
	for (const button of navButtons) if (button.dataset.navTo === name) button.setAttribute("aria-current", "page");
	else button.removeAttribute("aria-current");
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
function chooseCard(cardId, fromDeck = false) {
	if (!cardById.has(cardId)) return;
	selectedCardId = cardId;
	renderCollection();
	if (fromDeck) {
		setView("cards", { focus: false });
		if (window.matchMedia("(max-width: 760px)").matches) {
			views.get("cards").dataset.detailOpen = "true";
			document.querySelector("#selected-card-title")?.focus();
		} else document.querySelector("#selected-card-title")?.focus();
	} else if (window.matchMedia("(max-width: 760px)").matches) {
		views.get("cards").dataset.detailOpen = "true";
		document.querySelector("#selected-card-title")?.focus();
	}
}
var cards, cardById, radiusSpellProfile, root, views, navButtons, cardGrid, deckCards, homeDeck, cardDetails, emptyCollection, search, battleFrameSlot, replacementPanel, replacementChoices, deckStatus, battleLabel, selectedCardId, currentDeckIds, selectedSlotIndex, lastReplacedSlotIndex, currentView, battleFrame, battleFrameReady, formatter;
function init_app_shell$1() {
	return (init_app_shell$1 = __esmMin((() => {
		init_playable_roster();
		init_session_troop_roster();
		init_editable_deck();
		init_session_card_catalog();
		init_session_spell_profile_receipts();
		init_card_portrait_art();
		init_card_lore();
		cards = [...createPlayableRoster(), ...EDITABLE_MIXED_DECK_CARD_IDS.filter((id) => !PLAYABLE_CARD_IDS.includes(id)).map((id) => id === "squall-orb" || id === "ember-basin" ? projectSessionNonUnitBattleCard(id) : projectSessionTroopBattleCard(id))];
		cardById = new Map(cards.map((card) => [card.id, card]));
		radiusSpellProfile = createSessionRadiusSpellProfileReceipts().profiles[0];
		root = document.querySelector(".app-shell");
		views = new Map([...document.querySelectorAll("[data-app-view]")].map((view) => [view.dataset.appView, view]));
		navButtons = [...document.querySelectorAll("[data-nav-to]")];
		cardGrid = document.querySelector("[data-card-grid]");
		deckCards = document.querySelector("[data-deck-cards]");
		homeDeck = document.querySelector("[data-home-deck]");
		cardDetails = document.querySelector("[data-card-detail]");
		emptyCollection = document.querySelector("[data-card-empty]");
		search = document.querySelector("[data-card-search]");
		battleFrameSlot = document.querySelector("[data-battle-frame-slot]");
		replacementPanel = document.querySelector("[data-replacement-panel]");
		replacementChoices = document.querySelector("[data-replacement-choices]");
		deckStatus = document.querySelector("[data-deck-status]");
		battleLabel = document.querySelector("[data-battle-label]");
		selectedCardId = PLAYABLE_CARD_IDS[0];
		currentDeckIds = [...PLAYABLE_CARD_IDS];
		selectedSlotIndex = null;
		lastReplacedSlotIndex = null;
		currentView = "home";
		battleFrame = null;
		battleFrameReady = false;
		formatter = new Intl.NumberFormat("en", { maximumFractionDigits: 2 });
		document.addEventListener("focusin", (event) => {
			if (event.target instanceof HTMLElement && event.target.closest(".app-main")) keepFocusedControlClearOfNavigation(event.target);
		});
		renderDeckSummary();
		renderCollection();
		for (const button of navButtons) button.addEventListener("click", () => setView(button.dataset.navTo));
		document.querySelector("[data-action=\"begin-battle\"]").addEventListener("click", () => setView("battle"));
		document.querySelector("[data-action=\"browse-cards\"]").addEventListener("click", () => setView("cards"));
		document.querySelector("[data-action=\"leave-battle\"]").addEventListener("click", () => setView("home"));
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
			if (event.target.closest("[data-action=\"cancel-replacement\"]")) {
				closeReplacement();
				return;
			}
			if (event.target.closest("[data-action=\"clear-search\"]")) {
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
			if (event.target.closest("[data-action=\"back-to-cards\"]")) closeDetailAndFocusList();
		});
		document.addEventListener("keydown", (event) => {
			const cardsView = views.get("cards");
			if (event.key === "Escape" && currentView === "cards" && cardsView.dataset.detailOpen === "true") {
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
	})))();
}
//#endregion
//#region public/index.html
function init_public() {
	return (init_public = __esmMin((() => {
		init_modulepreload_polyfill();
		init_app_shell$1();
	})))();
}
//#endregion
export { init_public as t };
