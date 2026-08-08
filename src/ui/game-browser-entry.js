import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
} from "../content/playable-roster.js";
import {
  BrowserPcmAudioSink,
  createBrowserAudioContextFactoryCapability,
} from "../audio/browser-audio.js";
import { GameAudioRuntime } from "../audio/game-audio-runtime.js";
import { DeckCycle } from "../sim/deck.js";
import { ElixirMatch } from "../sim/elixir.js";
import { GameSession } from "../sim/game-session.js";
import { mountArenaShell } from "./arena-shell.js";
import { getCombatEffectsStyleText } from "./combat-effects.js";
import { getCombatStyleText } from "./combat-state.js";
import { assertGameBrowserRootAvailable,
  mountGameBrowserLoop } from "./game-browser-loop.js";
import {
  createArenaInputSessionContinuationCapability,
  mountArenaInputController,
  serializeArenaInputCards,
} from "./input-controller.js";
import { mountGameAudioControls } from "./game-audio-controls.js";
import { getMatchFeedbackStyleText } from "./match-feedback.js";

const LOCAL_SIDE = "south";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function createShippedGameSessionSetup(seed = 0, profile = "standard") {
  if (profile !== "standard" && profile !== "live-seed-2-terminal") {
    throw new TypeError("shipped game session profile is invalid");
  }
  const terminalProfile = profile === "live-seed-2-terminal";
  const roster = createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({ initialWindupTicks: terminalProfile
    ? { central: 10_000, lane: 10_000 } : { central: 0, lane: 0 },
    questions, roster });
  return canonical({
    battleSetup,
    deck: roster.map(({ id }) => id),
    legalNorthDeployments: (terminalProfile ? [{ id: "coilblade" }] : roster)
      .map(({ id: cardId }) => ({ cardId, point: { x: 3_500, y: 17_500 } }))
      .sort((left, right) => left.cardId.localeCompare(right.cardId)),
    rosterWitness: canonical({ questions, roster }), seed: terminalProfile ? 2 : seed,
    startingElixir: { north: 10, south: 10 },
    thinkIntervalTicks: 60,
    thinkOffsetTicks: 0,
  });
}

function inputSystems(session, cards) {
  const snapshot = JSON.parse(session.serialize());
  const setup = snapshot.setup;
  const state = session.state;
  const costs = new Map(cards.map(({ cost, id }) => [id, cost]));
  const deck = new DeckCycle({ deck: setup.deck, seed: `${setup.seed}:${LOCAL_SIDE}` });
  const elixir = new ElixirMatch({ startingElixir: setup.startingElixir });
  const pending = new Set(state.pendingPlayerCommands.map(({ commandId }) => commandId));
  const commands = snapshot.transcript.filter(({ type }) => type === "submit")
    .map(({ command }) => command).filter(({ commandId }) => !pending.has(commandId))
    .sort((left, right) => left.tick - right.tick || left.commandId - right.commandId);
  let commandIndex = 0;
  for (let tick = 0; tick < state.tick; tick += 1) {
    const command = commands[commandIndex];
    if (command?.tick === tick) {
      if (deck.state.hand[command.slot] !== command.cardId) {
        throw new TypeError("shipped browser input deck diverges from session");
      }
      elixir.scheduleSpend(tick, LOCAL_SIDE, costs.get(command.cardId));
      deck.play(command.cardId); commandIndex += 1;
    }
    elixir.step();
  }
  return { deck, elixir };
}

function createProjectionLayers(shell) {
  const document = shell.ownerDocument;
  const styles = document.createElement("style");
  styles.dataset.gameBrowserStyles = "";
  styles.textContent = [
    getCombatStyleText(),
    getCombatEffectsStyleText(),
    getMatchFeedbackStyleText(),
  ].join("\n");
  shell.appendChild(styles);
  const layers = {};
  for (const name of ["combat", "effects", "feedback", "hud"]) {
    const layer = document.createElement("div");
    layer.className = `game-browser-layer game-browser-layer--${name}`;
    layer.dataset.gameBrowserLayer = name;
    (name === "combat" || name === "effects"
      ? shell.querySelector('[data-ui="arena"]') : shell).appendChild(layer);
    layers[name] = layer;
  }
  return layers;
}

function createInputFactory(shell, cards) {
  const cardsText = serializeArenaInputCards(cards);
  return (session, nextCommandId, selectedCardId = null) => {
    const systems = inputSystems(session, cards);
    const updateHooks = (_selected = null, projected = systems) => {
      const slots = Array.from(shell.querySelectorAll('[data-ui="card-slot"]'));
      for (let index = 0; index < slots.length; index += 1) {
        slots[index].dataset.cardId = projected.deck.state.hand[index];
      }
    };
    updateHooks();
    const mounted = mountArenaInputController(shell,
      createArenaInputSessionContinuationCapability(
      cardsText,
      systems.deck.serializeJson(),
      systems.elixir.serialize(),
      nextCommandId,
      () => {},
      updateHooks,
    ));
    if (selectedCardId !== null) {
      const selection = mounted.input.select(selectedCardId);
      if (selection.accepted !== true) {
        try { mounted.cleanup(); } catch {}
        throw new Error("shipped browser could not preserve selected card");
      }
    }
    return mounted;
  };
}

function createNativeAudioContext() {
  const Constructor = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (typeof Constructor !== "function") {
    throw new TypeError("this browser does not provide Web Audio");
  }
  return new Constructor();
}

export function mountShippedGameBrowser(
  root,
  scheduler,
  session = null,
  audioContextFactory = createNativeAudioContext,
) {
  if (!scheduler || typeof scheduler.requestAnimationFrame !== "function" ||
      typeof scheduler.cancelAnimationFrame !== "function") {
    throw new TypeError("shipped browser scheduler is invalid");
  }
  if (typeof audioContextFactory !== "function") {
    throw new TypeError("shipped browser audio context factory is invalid");
  }
  assertGameBrowserRootAvailable(root);
  let active = true;
  let graph = null;
  let manualStepMode = false;
  let replacing = false;
  let restartCount = 0;
  let lastSession = session ?? new GameSession(createShippedGameSessionSetup());

  const cleanup = (candidate) => {
    const errors = [];
    if (candidate === null) return errors;
    try {
      candidate.restart.removeEventListener("click", candidate.onRestart);
    } catch (error) { errors.push(error); }
    try { candidate.loop?.dispose(); } catch (error) { errors.push(error); }
    try { candidate.controls?.dispose(); } catch (error) { errors.push(error); }
    if (candidate.controls === null) {
      try { candidate.audioRuntime.dispose(); } catch (error) { errors.push(error); }
      try { candidate.browserAudio.dispose(); } catch (error) { errors.push(error); }
    }
    return errors;
  };
  const renderRestart = (candidate) => {
    if (candidate === null) return;
    const terminal = candidate.loop?.state.terminal === true;
    candidate.restart.hidden = !terminal;
    candidate.restart.setAttribute("aria-hidden", String(!terminal));
  };
  const assertActive = () => {
    if (!active || graph === null) throw new RangeError("shipped browser is disposed");
    if (replacing) throw new Error("shipped browser reentrant operation rejected");
  };
  const buildGraph = (authenticSession, policy) => {
    const browserAudio = new BrowserPcmAudioSink(
      createBrowserAudioContextFactoryCapability(audioContextFactory),
    );
    const audioRuntime = new GameAudioRuntime(
      authenticSession,
      browserAudio.createRuntimeSinkCapability(),
    );
    let controls = null;
    let loop = null;
    let restart = null;
    let candidate = null;
    try {
      if (policy !== null) {
        audioRuntime.setGainBasisPoints(policy.gainBasisPoints);
        audioRuntime.setMuted(policy.muted);
      }
      const shell = mountArenaShell(root);
      const cards = createPlayableRoster();
      const restarts = Array.from(shell.querySelectorAll('[data-ui="restart"]'));
      if (restarts.length !== 1 ||
          typeof restarts[0].addEventListener !== "function" ||
          typeof restarts[0].removeEventListener !== "function" ||
          typeof restarts[0].setAttribute !== "function") {
        throw new TypeError("shipped browser requires one restart control");
      }
      restart = restarts[0];
      controls = mountGameAudioControls(shell, browserAudio, audioRuntime);
      loop = mountGameBrowserLoop({
        createInput: createInputFactory(shell, cards),
        layers: createProjectionLayers(shell),
        root,
        scheduler: {
          cancelAnimationFrame: scheduler.cancelAnimationFrame.bind(scheduler),
          requestAnimationFrame(callback) {
            return scheduler.requestAnimationFrame((timestamp) => {
              callback(timestamp);
              audioRuntime.renderFrame();
              renderRestart(candidate);
            });
          },
        },
        session: authenticSession,
      });
      if (manualStepMode && !loop.state.terminal) loop.enterManualStepMode();
      const onRestart = (event) => {
        if (event?.isTrusted !== true || !active || graph !== candidate || replacing) {
          return false;
        }
        return api.restart();
      };
      candidate = { audioRuntime, browserAudio, controls, loop, onRestart, restart };
      restart.addEventListener("click", onRestart);
      audioRuntime.renderFrame();
      renderRestart(candidate);
      return candidate;
    } catch (error) {
      const failed = candidate ?? {
        audioRuntime, browserAudio, controls, loop,
        onRestart() {}, restart: restart ?? { removeEventListener() {} },
      };
      cleanup(failed);
      throw error;
    }
  };
  const api = Object.freeze({
    get audio() { assertActive(); return graph.controls.state; },
    dispose() {
      if (!active) return false;
      assertActive();
      active = false;
      const current = graph;
      graph = null;
      const errors = cleanup(current);
      if (errors.length > 0) {
        throw new AggregateError(errors, "shipped browser cleanup failed");
      }
      return true;
    },
    /** Stop RAF advancement while retaining live pointer input for deterministic verification. */
    enterManualStepMode() {
      assertActive();
      const changed = graph.loop.enterManualStepMode();
      if (changed) manualStepMode = true;
      return changed;
    },
    /** Advance one bounded deterministic segment without synthesizing skipped audio. */
    fastForwardSegment(count) {
      assertActive();
      if (!manualStepMode || !Number.isSafeInteger(count) || count < 0 || count > 1_200) {
        throw new TypeError("shipped browser fast-forward segment is invalid");
      }
      const remaining = 18_000 - graph.loop.state.sessionTick;
      const events = graph.loop.stepMany(Math.min(count, remaining));
      renderRestart(graph);
      return events;
    },
    pause() {
      assertActive();
      const changed = graph.loop.pause();
      graph.audioRuntime.renderFrame();
      renderRestart(graph);
      return changed;
    },
    restart() {
      assertActive();
      if (!graph.loop.state.terminal) return false;
      replacing = true;
      const previous = graph;
      const policy = {
        gainBasisPoints: previous.controls.state.gainBasisPoints,
        muted: previous.controls.state.muted,
      };
      lastSession = previous.loop.session;
      graph = null;
      const cleanupErrors = cleanup(previous);
      if (cleanupErrors.length > 0) {
        active = false;
        replacing = false;
        throw new AggregateError(cleanupErrors, "shipped browser restart cleanup failed");
      }
      try {
        const freshSession = new GameSession(createShippedGameSessionSetup(0));
        graph = buildGraph(freshSession, policy);
        lastSession = freshSession;
        restartCount += 1;
        return api.state;
      } catch (error) {
        active = false;
        graph = null;
        throw new AggregateError([error], "shipped browser restart mount failed");
      } finally {
        replacing = false;
      }
    },
    restore(bytes) {
      assertActive();
      const state = graph.loop.restore(bytes);
      graph.audioRuntime.restart(graph.loop.session);
      graph.audioRuntime.renderFrame();
      lastSession = graph.loop.session;
      renderRestart(graph);
      return state;
    },
    resume() {
      assertActive();
      const changed = graph.loop.resume();
      graph.audioRuntime.renderFrame();
      renderRestart(graph);
      return changed;
    },
    setAudioGainBasisPoints(value) {
      assertActive();
      return graph.controls.setGainBasisPoints(value);
    },
    serialize() { assertActive(); return graph.loop.serialize(); },
    get session() { return graph?.loop.session ?? lastSession; },
    start() {
      assertActive();
      const changed = graph.loop.start();
      if (changed) manualStepMode = false;
      return changed;
    },
    get state() {
      if (graph === null) return Object.freeze({ active: false, restartCount });
      return Object.freeze({ ...graph.loop.state, restartCount });
    },
    stepMany(count = 1) {
      assertActive();
      const events = graph.loop.stepMany(count);
      graph.audioRuntime.renderFrame();
      renderRestart(graph);
      return events;
    },
  });
  try {
    graph = buildGraph(lastSession, null);
  } catch (error) {
    active = false;
    throw error;
  }
  return api;
}
