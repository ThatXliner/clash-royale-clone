import { mountArenaShell } from "./arena-shell.js";
import {
  createBasicFlyingCatalog,
  createBasicMeleeCatalog,
  createBasicRangedCatalog,
  createSwarmCatalog,
} from "../content/index.js";
import { DeckCycle } from "../sim/deck.js";
import { ElixirMatch } from "../sim/elixir.js";
import { MatchClock } from "../sim/match.js";
import { TOWER_COMBAT_CONFIG } from "../sim/towers.js";
import {
  bindHudViewModel,
  createHudViewModel,
} from "./hud-state.js";
import { mountArenaInputController } from "./input-controller.js";
import { mountPlacementFeedback } from "./placement-feedback.js";
import { mountCombatLayer } from "./combat-state.js";

const INITIAL_DECK_SEED = 0;
const LOCAL_SIDE = "south";
const TOWER_IDS = Object.freeze([
  "north:central",
  "north:lane:left",
  "north:lane:right",
  "south:central",
  "south:lane:left",
  "south:lane:right",
]);

export function createInitialArenaHudSystems() {
  const cards = [
    ...createBasicMeleeCatalog(),
    ...createBasicFlyingCatalog(),
    ...createBasicRangedCatalog(),
    ...createSwarmCatalog(),
  ].map(({ cost, displayName, id }) => ({ cost, displayName, id }));
  const initialTowers = TOWER_IDS.map((id) => ({
    hitpoints: id.endsWith(":central")
      ? TOWER_COMBAT_CONFIG.central.hitpoints
      : TOWER_COMBAT_CONFIG.lane.hitpoints,
    id,
  }));
  return {
    cards,
    deck: new DeckCycle({
      deck: cards.map(({ id }) => id),
      seed: INITIAL_DECK_SEED,
    }),
    elixir: new ElixirMatch(),
    match: new MatchClock({ initialTowers }),
  };
}

export function createArenaHudController(shell) {
  const systems = createInitialArenaHudSystems();
  function update(selectedCardId = null, projectedSystems = systems) {
    const view = createHudViewModel({
      cards: systems.cards,
      deck: projectedSystems.deck.state,
      elixir: projectedSystems.elixir.state,
      localSide: LOCAL_SIDE,
      match: systems.match.state,
      selectedCardId,
    });
    bindHudViewModel(shell, view);
    return view;
  }
  function replaceInteractionSystems(next) {
    systems.deck = next.deck;
    systems.elixir = next.elixir;
  }
  const initialView = update();
  return Object.freeze({
    cards: systems.cards,
    get deck() {
      return systems.deck;
    },
    get elixir() {
      return systems.elixir;
    },
    initialView,
    match: systems.match,
    replaceInteractionSystems,
    update,
  });
}

export function mountArenaShellWithHud(root) {
  const shell = mountArenaShell(root);
  const hud = createArenaHudController(shell);
  const browserInput = mountArenaInputController(shell, hud);
  const placementFeedback = mountPlacementFeedback(shell, browserInput);
  const combatLayer = mountCombatLayer(shell);
  return Object.freeze({
    ...hud,
    browserInput,
    input: browserInput.input,
    combatLayer,
    placementFeedback,
  });
}

export const arenaHudController =
  typeof document === "object" && document !== null
    ? mountArenaShellWithHud(
      document.querySelector("[data-arena-shell-root]"),
    )
    : null;
