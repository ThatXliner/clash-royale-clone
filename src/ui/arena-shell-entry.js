import { mountArenaShell } from "./arena-shell.js";
import {
  createShippedGameSessionSetup,
  mountShippedGameBrowser,
} from "./game-browser-entry.js";
import { GameSession } from "../sim/game-session.js";
import { EDITABLE_MIXED_DECK_CARD_IDS } from "../content/editable-deck.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../content/playable-roster.js";
import { DeckCycle } from "../sim/deck.js";
import { ElixirMatch } from "../sim/elixir.js";
import {
  isPlayerDeployBridge,
  PlayerDeployBridge,
} from "../sim/game-player-deploy.js";
import { LiveBattle, parseLiveBattleSetup } from "../sim/live-battle.js";
import { MatchClock } from "../sim/match.js";
import { TOWER_COMBAT_CONFIG } from "../sim/towers.js";
import {
  bindHudViewModel,
  createHudViewModel,
} from "./hud-state.js";
import {
  createArenaInputHudCapability,
  createArenaInputBridgeWitness,
  mountArenaInputController,
  serializeArenaInputCards,
} from "./input-controller.js";
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
const sessionInjectionCapabilities = new WeakMap();
const consumedSessionInjectionCapabilities = new WeakSet();

function checkedAppBattleMessage(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value) ||
      Object.getPrototypeOf(value) !== Object.prototype) return null;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.length !== 3 ||
      keys.some((key) => typeof key !== "string" ||
        !["active", "channel", "deckIds"].includes(key)) ||
      Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, "value"))) return null;
  if (descriptors.channel.value !== "moss-and-ember-battle" ||
      typeof descriptors.active.value !== "boolean") return null;
  const deckIds = descriptors.deckIds.value;
  if (!Array.isArray(deckIds) || Object.getPrototypeOf(deckIds) !== Array.prototype) {
    return null;
  }
  const deckDescriptors = Object.getOwnPropertyDescriptors(deckIds);
  const deckKeys = Reflect.ownKeys(deckDescriptors);
  if (deckKeys.length !== 9 || !Object.hasOwn(deckDescriptors.length, "value") ||
      deckDescriptors.length.value !== 8 || deckDescriptors.length.enumerable ||
      deckKeys.some((key) => typeof key !== "string" ||
        (key !== "length" && !/^[0-7]$/u.test(key)))) return null;
  const checked = [];
  for (let index = 0; index < 8; index += 1) {
    const descriptor = deckDescriptors[String(index)];
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, "value") ||
        typeof descriptor.value !== "string" ||
        !EDITABLE_MIXED_DECK_CARD_IDS.includes(descriptor.value)) return null;
    checked.push(descriptor.value);
  }
  if (new Set(checked).size !== 8) return null;
  return { active: descriptors.active.value, deckIds: checked };
}

function sameDeckIds(left, right) {
  return Array.isArray(left) && left.length === right.length &&
    left.every((id, index) => id === right[index]);
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function immutableSnapshot(value) {
  const cloned = JSON.parse(canonicalJson(value));
  const freeze = (current) => {
    if (current !== null && typeof current === "object") {
      for (const child of Object.values(current)) freeze(child);
      Object.freeze(current);
    }
    return current;
  };
  return freeze(cloned);
}

function sessionAggregate(message, codes) {
  const errors = codes.map((code) => Object.freeze(new Error(code)));
  const aggregate = new AggregateError(errors, message);
  Object.freeze(aggregate.errors);
  return Object.freeze(aggregate);
}

export function createInitialArenaHudSystems() {
  const cards = createPlayableRoster();
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

/** Capture one canonical bridge snapshot behind a fieldless single-use token. */
export function createArenaSessionInjectionCapability(bridge) {
  if (arguments.length !== 1 || !isPlayerDeployBridge(bridge)) {
    throw new TypeError("arena session injection requires one exact bridge");
  }
  const bytes = bridge.serialize();
  const token = Object.freeze(Object.create(null));
  sessionInjectionCapabilities.set(token, bytes);
  return token;
}

export function createArenaHudController(
  shell,
  systems = createInitialArenaHudSystems(),
) {
  function update(selectedCardId = null, projectedSystems = systems) {
    const projectedTick = projectedSystems.elixir.state.tick;
    if (projectedTick < systems.match.state.tick) {
      throw new RangeError("arena HUD authoritative tick cannot rewind");
    }
    systems.match.runToTick(projectedTick);
    const view = createHudViewModel({
      cards: systems.cards.map(({ cost, displayName, id }) =>
        ({ cost, displayName, id })),
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

export function mountArenaShellWithHud(root, injectionCapability) {
  let admittedBridgeBytes = null;
  if (arguments.length > 1) {
    admittedBridgeBytes = sessionInjectionCapabilities.get(injectionCapability);
    if (admittedBridgeBytes === undefined) {
      if (consumedSessionInjectionCapabilities.has(injectionCapability)) {
        throw new TypeError("arena session injection capability is consumed");
      }
      throw new TypeError("arena session injection capability is invalid");
    }
    sessionInjectionCapabilities.delete(injectionCapability);
    consumedSessionInjectionCapabilities.add(injectionCapability);
  }
  const shell = mountArenaShell(root);
  const systems = createInitialArenaHudSystems();
  const setup = parseLiveBattleSetup(canonicalJson({
    initialWindupTicks: { central: 0, lane: 0 },
    questions: createPlayableRosterQuestionRecords(),
    roster: systems.cards,
  }));
  let bridge = admittedBridgeBytes === null ? new PlayerDeployBridge({
      battle: new LiveBattle(setup),
      cards: systems.cards.map(({ cost, id }) => ({ cost, id })),
      deck: systems.deck,
      elixir: systems.elixir,
    }) : PlayerDeployBridge.restore(admittedBridgeBytes);
  if (bridge.rosterBytes !== serializeArenaInputCards(systems.cards)) {
    throw new TypeError("arena session bridge roster does not match the shipped catalog");
  }
  systems.deck = DeckCycle.restore(bridge.deckBytes);
  systems.elixir = ElixirMatch.restore(bridge.elixirBytes);
  const hud = createArenaHudController(shell, systems);
  let browserInput = null;
  let placementFeedback = null;
  let lifecycle = "clean";
  let operationActive = false;
  let callbackDepth = 0;
  const sessionCommit = (next) => {
    callbackDepth += 1;
    try { return hud.replaceInteractionSystems(next); }
    catch (error) { lifecycle = "faulted"; throw error; }
    finally { callbackDepth -= 1; }
  };
  const sessionUpdate = (...args) => {
    callbackDepth += 1;
    try { return hud.update(...args); }
    catch (error) { lifecycle = "faulted"; throw error; }
    finally { callbackDepth -= 1; }
  };
  const assertOperationAllowed = () => {
    if (callbackDepth !== 0 || operationActive) {
      throw new Error("arena authoritative session reentrant operation rejected");
    }
    if (lifecycle === "disposed") {
      throw new Error("arena authoritative session is disposed");
    }
    if (lifecycle === "faulted") {
      throw new Error("arena authoritative session is terminally faulted");
    }
  };
  const synchronizeHud = () => {
    hud.replaceInteractionSystems({
      deck: DeckCycle.restore(bridge.deckBytes),
      elixir: ElixirMatch.restore(bridge.elixirBytes),
    });
    hud.update();
  };
  const mountInput = () => {
    browserInput = mountArenaInputController(shell,
      createArenaInputHudCapability(
        serializeArenaInputCards(hud.cards),
        bridge.deckBytes,
        bridge.elixirBytes,
        sessionCommit,
        sessionUpdate,
        createArenaInputBridgeWitness(bridge),
      ));
    try {
      placementFeedback = mountPlacementFeedback(shell, browserInput);
    } catch (error) {
      try { browserInput.cleanup(); } catch {}
      browserInput = null;
      placementFeedback = null;
      throw error;
    }
    lifecycle = "active";
  };
  const cleanupInputInternal = () => {
    if (placementFeedback !== null) {
      const cleaned = placementFeedback.cleanup();
      placementFeedback = null;
      browserInput = null;
      lifecycle = "clean";
      return cleaned;
    }
    if (browserInput !== null) {
      const cleaned = browserInput.cleanup();
      browserInput = null;
      lifecycle = "clean";
      return cleaned;
    }
    return false;
  };
  const bridgeDiagnostic = () => {
    const state = bridge.state;
    return immutableSnapshot({
      battle: state.battle,
      bytes: bridge.serialize(),
      deck: { bytes: bridge.deckBytes, state: state.deck },
      elixir: { bytes: bridge.elixirBytes, state: state.elixir },
      processedCommandIds: state.processedCommandIds,
      replay: bridge.replay,
      rosterBytes: bridge.rosterBytes,
      tick: state.tick,
    });
  };
  const inputDiagnostic = () => browserInput === null ? null : immutableSnapshot({
    commands: browserInput.input.commands,
    deck: browserInput.input.deck,
    elixir: browserInput.input.elixir,
    faultCode: browserInput.input.faultCode,
    replay: browserInput.input.replay,
    selectedCardId: browserInput.input.selectedCardId,
  });
  const placementDiagnostic = () => placementFeedback === null ? null :
    immutableSnapshot({
      history: placementFeedback.controller.history,
      view: placementFeedback.controller.view,
    });
  const failTerminally = () => {
    try { cleanupInputInternal(); } catch {}
    lifecycle = "faulted";
  };
  const cleanupInput = () => {
    assertOperationAllowed();
    if (lifecycle === "clean") return false;
    operationActive = true;
    try {
      return cleanupInputInternal();
    } catch (error) {
      failTerminally();
      throw sessionAggregate("arena authoritative cleanup failed",
        ["input cleanup failed"]);
    } finally {
      operationActive = false;
    }
  };
  const remountInput = () => {
    assertOperationAllowed();
    if (lifecycle !== "clean") {
      throw new Error("arena authoritative remount requires clean input");
    }
    operationActive = true;
    try {
      synchronizeHud();
      mountInput();
      return inputDiagnostic();
    } catch (error) {
      failTerminally();
      throw sessionAggregate("arena authoritative remount failed",
        ["input remount failed"]);
    } finally {
      operationActive = false;
    }
  };
  const restoreBridge = (bytes) => {
    assertOperationAllowed();
    if (lifecycle !== "clean") {
      throw new Error("arena authoritative bridge restore requires input cleanup");
    }
    const candidate = PlayerDeployBridge.restore(bytes);
    if (candidate.rosterBytes !== serializeArenaInputCards(hud.cards) ||
        candidate.state.tick < hud.match.state.tick) {
      throw new RangeError("arena authoritative bridge restore is incompatible");
    }
    const previousBytes = bridge.serialize();
    operationActive = true;
    try {
      bridge = candidate;
      synchronizeHud();
      lifecycle = "clean";
      return bridgeDiagnostic();
    } catch (error) {
      try {
        bridge = PlayerDeployBridge.restore(previousBytes);
        synchronizeHud();
        lifecycle = "clean";
      } catch {
        failTerminally();
      }
      throw sessionAggregate("arena authoritative bridge restore failed",
        [lifecycle === "faulted" ? "restore rollback failed" : "restore rejected"]);
    } finally {
      operationActive = false;
    }
  };
  const advance = (ticks) => {
    assertOperationAllowed();
    if (!Number.isSafeInteger(ticks) || ticks < 0 || ticks > 18_000) {
      throw new TypeError("arena authoritative advance ticks are invalid");
    }
    const wasActive = lifecycle === "active";
    const previousBytes = bridge.serialize();
    const candidate = PlayerDeployBridge.restore(previousBytes);
    candidate.stepMany(ticks);
    operationActive = true;
    try {
      if (wasActive) cleanupInputInternal();
      bridge = candidate;
      synchronizeHud();
      if (wasActive) mountInput();
      else lifecycle = "clean";
      return bridgeDiagnostic();
    } catch (error) {
      try {
        cleanupInputInternal();
        bridge = PlayerDeployBridge.restore(previousBytes);
        synchronizeHud();
        if (wasActive) mountInput();
        else lifecycle = "clean";
      } catch {
        failTerminally();
      }
      throw sessionAggregate("arena authoritative advance failed",
        [lifecycle === "faulted" ? "advance rollback failed" : "advance rejected"]);
    } finally {
      operationActive = false;
    }
  };
  const disposeSession = () => {
    if (lifecycle === "disposed") return false;
    if (callbackDepth !== 0 || operationActive) {
      throw new Error("arena authoritative session reentrant operation rejected");
    }
    operationActive = true;
    try { cleanupInputInternal(); }
    catch { lifecycle = "faulted"; }
    finally { operationActive = false; }
    lifecycle = "disposed";
    return true;
  };
  mountInput();
  mountCombatLayer(shell);
  return Object.freeze({
    advance,
    get battle() {
      return immutableSnapshot(bridge.state.battle);
    },
    get bridge() {
      return bridgeDiagnostic();
    },
    get deck() {
      return immutableSnapshot({ bytes: bridge.deckBytes, state: bridge.state.deck });
    },
    get elixir() {
      return immutableSnapshot({ bytes: bridge.elixirBytes, state: bridge.state.elixir });
    },
    get input() {
      return inputDiagnostic();
    },
    get placementFeedback() {
      return placementDiagnostic();
    },
    get status() {
      return lifecycle;
    },
    cards: immutableSnapshot(hud.cards),
    cleanupInput,
    disposeSession,
    initialView: immutableSnapshot(hud.initialView),
    get match() {
      return immutableSnapshot(hud.match.state);
    },
    remountInput,
    restoreBridge,
  });
}

export const arenaHudController =
  typeof document === "object" && document !== null &&
  typeof window === "object" && window !== null
    ? (() => {
      const parameters = new URLSearchParams(window.location.search);
      const profile = parameters.get("session-profile");
      const appFrameValue = parameters.get("app-frame");
      if (appFrameValue !== null && appFrameValue !== "1") {
        throw new TypeError("public app frame option is invalid");
      }
      const appFrame = appFrameValue === "1";
      if (appFrame) document.body.dataset.appFrame = "true";
      if (profile !== null && profile !== "live-seed-2-terminal" &&
          profile !== "stonehauler-witness") {
        throw new TypeError("public game session profile is invalid");
      }
      const session = profile === null ? null : new GameSession(
        createShippedGameSessionSetup(
          profile === "live-seed-2-terminal" ? 2 : 1, profile,
        ),
      );
      const controller = mountShippedGameBrowser(
        document.querySelector("[data-arena-shell-root]"), window, session,
        undefined, profile === null && !appFrame,
      );
      if (appFrame) {
        controller.pause();
        window.addEventListener("message", (event) => {
          if (event.source !== window.parent || event.origin !== window.location.origin) return;
          const message = checkedAppBattleMessage(event.data);
          if (message === null) return;
          const currentDeck = JSON.parse(controller.session.serialize()).setup.deck;
          if (!sameDeckIds(currentDeck, message.deckIds)) controller.replaceDeck(message.deckIds);
          if (message.active) controller.resume();
          else controller.pause();
        });
      }
      return controller;
    })()
    : null;
