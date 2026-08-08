import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
  validateArenaPoint,
} from "../sim/arena-geometry.js";
import { evaluateDeployment } from "../sim/deployment.js";
import {
  DECK_MAX_PLAY_COMMANDS,
  DeckCycle,
} from "../sim/deck.js";
import { ElixirMatch } from "../sim/elixir.js";

const LOCAL_SIDE = "south";
const MAX_ACTIONS = DECK_MAX_PLAY_COMMANDS * 3;
const COMMIT_ROLLBACK_FAULT = "commit_rollback_failed";
const feedbackReceipts = new WeakMap();
const feedbackReaders = new WeakMap();
const feedbackSources = new WeakMap();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function issueArenaInputFeedbackReceipt(input, result, selectedCardIdBefore) {
  const snapshot = feedbackReaders.get(input)();
  const receipt = Object.freeze(Object.create(null));
  feedbackReceipts.set(receipt, {
    commands: snapshot.commands,
    elixir: snapshot.elixir,
    result: clone(result),
    selectedCardIdBefore,
    source: feedbackSources.get(input),
    spendSequenceProvenance: result.accepted
      ? result.command.spendSequence
      : null,
  });
  return receipt;
}

/**
 * Consume a single-use placement receipt issued inside the canonical browser
 * input seam. Plain objects and replayed receipts have no authority.
 */
export function consumeArenaInputFeedbackReceipt(receipt) {
  if (
    receipt === null ||
    typeof receipt !== "object" ||
    !feedbackReceipts.has(receipt)
  ) {
    throw new TypeError("arena input feedback receipt is invalid or consumed");
  }
  const payload = feedbackReceipts.get(receipt);
  feedbackReceipts.delete(receipt);
  return Object.freeze({
    commands: clone(payload.commands),
    elixir: payload.elixir,
    result: clone(payload.result),
    selectedCardIdBefore: payload.selectedCardIdBefore,
    source: payload.source,
    spendSequenceProvenance: payload.spendSequenceProvenance,
  });
}

function canonicalJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function exactRecord(value, keys, label) {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    (
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    ) ||
    Object.getOwnPropertySymbols(value).length !== 0
  ) {
    throw new TypeError(`${label} must be a plain data object`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Object.keys(descriptors).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length ||
    actual.some((key, index) => key !== expected[index])
  ) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  for (const key of actual) {
    if (
      !descriptors[key].enumerable ||
      !Object.hasOwn(descriptors[key], "value")
    ) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return Object.fromEntries(
    expected.map((key) => [key, descriptors[key].value]),
  );
}

function safeInteger(value, label, minimum = 0) {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new TypeError(`${label} must be a safe integer of at least ${minimum}`);
  }
  return value;
}

function checkedCards(cards) {
  if (
    !Array.isArray(cards) ||
    Object.getPrototypeOf(cards) !== Array.prototype ||
    cards.length !== 8
  ) {
    throw new TypeError("arena input cards must contain exactly eight cards");
  }
  const checked = cards.map((value, index) => {
    const card = exactRecord(
      value,
      ["cost", "displayName", "id"],
      `arena input card ${index}`,
    );
    safeInteger(card.cost, `arena input card ${index}.cost`, 1);
    for (const key of ["displayName", "id"]) {
      if (typeof card[key] !== "string" || card[key].length === 0) {
        throw new TypeError(`arena input card ${index}.${key} is invalid`);
      }
    }
    return card;
  });
  if (new Set(checked.map(({ id }) => id)).size !== checked.length) {
    throw new TypeError("arena input card IDs must be unique");
  }
  return clone(checked);
}

function checkedRect(value) {
  const rect = exactRecord(
    value,
    ["height", "left", "top", "width"],
    "arena client rectangle",
  );
  for (const key of ["height", "left", "top", "width"]) {
    if (typeof rect[key] !== "number" || !Number.isFinite(rect[key])) {
      throw new TypeError(`arena client rectangle.${key} must be finite`);
    }
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new TypeError("arena client rectangle dimensions must be positive");
  }
  return rect;
}

function checkedClientPoint(value) {
  const point = exactRecord(
    value,
    ["clientX", "clientY"],
    "client point",
  );
  for (const key of ["clientX", "clientY"]) {
    if (typeof point[key] !== "number" || !Number.isFinite(point[key])) {
      throw new TypeError(`client point.${key} must be finite`);
    }
  }
  return point;
}

/**
 * Project one viewport point into the arena's integer millitile coordinate
 * space. The DOM's top edge is canonical north (y=32000), while its bottom
 * edge is canonical south (y=0). All four rectangle edges are inclusive.
 */
export function clientPointToArenaPoint(rectValue, pointValue) {
  const rect = checkedRect(rectValue);
  const point = checkedClientPoint(pointValue);
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  if (
    point.clientX < rect.left ||
    point.clientX > right ||
    point.clientY < rect.top ||
    point.clientY > bottom
  ) {
    return null;
  }
  return {
    x: Math.min(
      ARENA_WIDTH_MILLITILES,
      Math.floor(
        (point.clientX - rect.left) *
        ARENA_WIDTH_MILLITILES /
        rect.width,
      ),
    ),
    y: Math.min(
      ARENA_LENGTH_MILLITILES,
      Math.floor(
        (bottom - point.clientY) *
        ARENA_LENGTH_MILLITILES /
        rect.height,
      ),
    ),
  };
}

function cardMap(cards) {
  return new Map(cards.map((card) => [card.id, card]));
}

function checkedSystems(options) {
  const checked = exactRecord(
    options,
    ["cards", "commitSystems", "deck", "elixir", "hudUpdate"],
    "arena input options",
  );
  const cards = checkedCards(checked.cards);
  if (Object.getPrototypeOf(checked.deck) !== DeckCycle.prototype) {
    throw new TypeError("arena input deck must be an exact DeckCycle");
  }
  if (Object.getPrototypeOf(checked.elixir) !== ElixirMatch.prototype) {
    throw new TypeError("arena input elixir must be an exact ElixirMatch");
  }
  if (typeof checked.hudUpdate !== "function") {
    throw new TypeError("arena input hudUpdate must be a function");
  }
  if (typeof checked.commitSystems !== "function") {
    throw new TypeError("arena input commitSystems must be a function");
  }
  return {
    cards,
    commitSystems: checked.commitSystems,
    deck: checked.deck,
    elixir: checked.elixir,
    hudUpdate: checked.hudUpdate,
  };
}

export class ArenaInputController {
  #actions = [];
  #cards;
  #commands = [];
  #commitSystems;
  #deck;
  #elixir;
  #faultCode = null;
  #hudUpdate;
  #initialDeck;
  #initialElixir;
  #selectedCardId = null;

  constructor(options) {
    const checked = checkedSystems(options);
    this.#cards = checked.cards;
    this.#commitSystems = checked.commitSystems;
    this.#deck = checked.deck;
    this.#elixir = checked.elixir;
    this.#hudUpdate = checked.hudUpdate;
    this.#initialDeck = JSON.parse(this.#deck.serializeJson());
    this.#initialElixir = JSON.parse(this.#elixir.serialize());
    feedbackSources.set(this, Object.freeze(Object.create(null)));
    feedbackReaders.set(this, () => ({
      cards: clone(this.#cards),
      commands: clone(this.#commands),
      elixir: this.#elixir.serialize(),
      selectedCardId: this.#selectedCardId,
    }));
  }

  get selectedCardId() {
    return this.#selectedCardId;
  }

  get commands() {
    return clone(this.#commands);
  }

  get deck() {
    return this.#deck;
  }

  get elixir() {
    return this.#elixir;
  }

  get faultCode() {
    return this.#faultCode;
  }

  get replay() {
    return clone(this.#actions);
  }

  select(cardId) {
    this.#assertHealthy();
    if (typeof cardId !== "string" || cardId.length === 0) {
      throw new TypeError("selected card ID must be a non-empty string");
    }
    if (!this.#deck.state.hand.includes(cardId)) {
      return Object.freeze({
        accepted: false,
        cardId,
        reason: "not_in_hand",
        selectedCardId: this.#selectedCardId,
        type: "select",
      });
    }
    const card = cardMap(this.#cards).get(cardId);
    if (card === undefined) {
      throw new TypeError("selected card is missing from the runtime catalog");
    }
    if (this.#availableElixir() < card.cost) {
      return Object.freeze({
        accepted: false,
        cardId,
        reason: "insufficient_elixir",
        selectedCardId: this.#selectedCardId,
        type: "select",
      });
    }
    if (this.#selectedCardId === cardId) return this.cancel();
    this.#assertActionCapacity();
    const previous = this.#selectedCardId;
    this.#selectedCardId = cardId;
    try {
      this.#hudUpdate(cardId);
    } catch (error) {
      this.#selectedCardId = previous;
      throw error;
    }
    const event = {
      accepted: true,
      cardId,
      sequence: this.#actions.length,
      selectedCardId: cardId,
      type: "select",
    };
    this.#actions.push(event);
    return Object.freeze(clone(event));
  }

  cancel() {
    this.#assertHealthy();
    if (this.#selectedCardId === null) {
      return Object.freeze({
        accepted: false,
        reason: "nothing_selected",
        selectedCardId: null,
        type: "cancel",
      });
    }
    this.#assertActionCapacity();
    const cardId = this.#selectedCardId;
    this.#selectedCardId = null;
    try {
      this.#hudUpdate(null);
    } catch (error) {
      this.#selectedCardId = cardId;
      throw error;
    }
    const event = {
      accepted: true,
      cardId,
      sequence: this.#actions.length,
      selectedCardId: null,
      type: "cancel",
    };
    this.#actions.push(event);
    return Object.freeze(clone(event));
  }

  placeArenaPoint(pointValue) {
    this.#assertHealthy();
    const point = validateArenaPoint(pointValue, "arena input point");
    const selected = this.#selectedCardId;
    if (selected === null) {
      return Object.freeze({
        accepted: false,
        point,
        reason: "nothing_selected",
        type: "place",
      });
    }
    const card = cardMap(this.#cards).get(selected);
    if (card === undefined || !this.#deck.state.hand.includes(selected)) {
      return Object.freeze({
        accepted: false,
        point,
        reason: "card_unavailable",
        type: "place",
      });
    }
    if (this.#availableElixir() < card.cost) {
      return Object.freeze({
        accepted: false,
        point,
        reason: "insufficient_elixir",
        type: "place",
      });
    }
    const decision = evaluateDeployment({
      destroyedOpposingLaneTowers: [],
      placementClass: "ground_entity",
      point,
      side: LOCAL_SIDE,
    });
    if (!decision.legal) {
      return Object.freeze({
        accepted: false,
        confidence: decision.confidence,
        point,
        reason: decision.reason,
        type: "place",
      });
    }
    this.#assertActionCapacity();
    if (this.#deck.state.sequence >= DECK_MAX_PLAY_COMMANDS) {
      throw new RangeError("arena input deck command limit reached");
    }
    const tick = this.#elixir.tick;
    // Build the complete next canonical state on isolated causal restores.
    // Neither live systems nor controller state changes unless HUD binding
    // succeeds for that exact projected state.
    const nextDeck = DeckCycle.restore(this.#deck.serializeJson());
    const nextElixir = ElixirMatch.restore(this.#elixir.serialize());
    const spendSequence = nextElixir.scheduleSpend(
      tick,
      LOCAL_SIDE,
      card.cost,
    );
    const deckEvent = nextDeck.play(selected);
    if (!deckEvent.accepted) {
      throw new Error("canonical deck rejected a prevalidated arena play");
    }
    this.#hudUpdate(null, { deck: nextDeck, elixir: nextElixir });
    try {
      this.#commitSystems({ deck: nextDeck, elixir: nextElixir });
    } catch (error) {
      const rollbackErrors = [];
      try {
        this.#commitSystems({ deck: this.#deck, elixir: this.#elixir });
      } catch (caught) {
        rollbackErrors.push(caught);
      }
      try {
        this.#hudUpdate(selected, {
          deck: this.#deck,
          elixir: this.#elixir,
        });
      } catch (caught) {
        rollbackErrors.push(caught);
      }
      if (rollbackErrors.length > 0) {
        this.#faultCode = COMMIT_ROLLBACK_FAULT;
        throw new AggregateError(
          [error, ...rollbackErrors],
          "arena input commit failed and could not be fully rolled back",
        );
      }
      throw error;
    }
    const command = {
      cardId: selected,
      cost: card.cost,
      id: this.#commands.length + 1,
      point,
      sequence: this.#commands.length,
      side: LOCAL_SIDE,
      spendSequence,
      tick,
      type: "deploy",
    };
    const action = {
      commandId: command.id,
      point,
      sequence: this.#actions.length,
      type: "place",
    };
    this.#deck = nextDeck;
    this.#elixir = nextElixir;
    this.#commands.push(command);
    this.#selectedCardId = null;
    this.#actions.push(action);
    return Object.freeze({
      accepted: true,
      command: clone(command),
      confidence: decision.confidence,
      reason: decision.reason,
      type: "place",
    });
  }

  placeClientPoint(rect, point) {
    this.#assertHealthy();
    const arenaPoint = clientPointToArenaPoint(rect, point);
    if (arenaPoint === null) {
      return Object.freeze({
        accepted: false,
        point: null,
        reason: "outside_client_bounds",
        type: "place",
      });
    }
    return this.placeArenaPoint(arenaPoint);
  }

  serialize() {
    this.#assertHealthy();
    return canonicalJson({
      actions: this.#actions,
      commands: this.#commands,
      deck: JSON.parse(this.#deck.serializeJson()),
      elixir: JSON.parse(this.#elixir.serialize()),
      initialDeck: this.#initialDeck,
      initialElixir: this.#initialElixir,
      selectedCardId: this.#selectedCardId,
      version: 1,
    });
  }

  static restore(serialized, options) {
    if (typeof serialized !== "string") {
      throw new TypeError("serialized arena input must be a string");
    }
    let snapshot;
    try {
      snapshot = JSON.parse(serialized);
    } catch {
      throw new TypeError("serialized arena input must be valid JSON");
    }
    const checked = exactRecord(
      snapshot,
      [
        "actions",
        "commands",
        "deck",
        "elixir",
        "initialDeck",
        "initialElixir",
        "selectedCardId",
        "version",
      ],
      "arena input snapshot",
    );
    if (checked.version !== 1) {
      throw new TypeError("arena input snapshot has an unsupported version");
    }
    if (
      !Array.isArray(checked.actions) ||
      checked.actions.length > MAX_ACTIONS
    ) {
      throw new TypeError("arena input snapshot actions are invalid");
    }
    const restoreOptions = exactRecord(
      options,
      ["cards", "hudUpdate"],
      "arena input restore options",
    );
    const controller = new ArenaInputController({
      cards: restoreOptions.cards,
      commitSystems() {},
      deck: DeckCycle.restore(canonicalJson(checked.initialDeck)),
      elixir: ElixirMatch.restore(canonicalJson(checked.initialElixir)),
      hudUpdate() {},
    });
    for (let index = 0; index < checked.actions.length; index += 1) {
      const action = checked.actions[index];
      if (action?.type === "select") {
        const entry = exactRecord(
          action,
          ["accepted", "cardId", "selectedCardId", "sequence", "type"],
          `arena input action ${index}`,
        );
        if (
          entry.accepted !== true ||
          entry.sequence !== index ||
          entry.selectedCardId !== entry.cardId
        ) {
          throw new TypeError(`arena input action ${index} is incoherent`);
        }
        controller.select(entry.cardId);
      } else if (action?.type === "cancel") {
        const entry = exactRecord(
          action,
          ["accepted", "cardId", "selectedCardId", "sequence", "type"],
          `arena input action ${index}`,
        );
        if (
          entry.accepted !== true ||
          entry.sequence !== index ||
          entry.selectedCardId !== null
        ) {
          throw new TypeError(`arena input action ${index} is incoherent`);
        }
        controller.cancel();
      } else if (action?.type === "place") {
        const entry = exactRecord(
          action,
          ["commandId", "point", "sequence", "type"],
          `arena input action ${index}`,
        );
        if (
          entry.sequence !== index ||
          entry.commandId !== controller.#commands.length + 1
        ) {
          throw new TypeError(`arena input action ${index} is incoherent`);
        }
        const result = controller.placeArenaPoint(entry.point);
        if (!result.accepted || result.command.id !== entry.commandId) {
          throw new TypeError(`arena input action ${index} cannot be replayed`);
        }
      } else {
        throw new TypeError(`arena input action ${index} has an invalid type`);
      }
    }
    if (controller.serialize() !== canonicalJson(checked)) {
      throw new TypeError("arena input snapshot is not a canonical causal state");
    }
    controller.#hudUpdate = restoreOptions.hudUpdate;
    controller.#hudUpdate(controller.#selectedCardId, {
      deck: controller.#deck,
      elixir: controller.#elixir,
    });
    return controller;
  }

  #assertActionCapacity() {
    if (this.#actions.length >= MAX_ACTIONS) {
      throw new RangeError("arena input action history limit reached");
    }
  }

  #assertHealthy() {
    if (this.#faultCode !== null) {
      throw new Error(`arena input is poisoned: ${this.#faultCode}`);
    }
  }

  #availableElixir() {
    const state = this.#elixir.state;
    const amount = state.sides[LOCAL_SIDE].amount;
    const reserved = this.#commands
      .filter(({ tick }) => tick === state.tick)
      .reduce((total, { cost }) => total + cost, 0);
    return amount - reserved;
  }
}

function exactNodes(target, selector, count, label) {
  if (
    target === null ||
    (typeof target !== "object" && typeof target !== "function") ||
    typeof target.querySelectorAll !== "function"
  ) {
    throw new TypeError(`${label} target is invalid`);
  }
  const values = Array.from(target.querySelectorAll(selector));
  if (values.length !== count || new Set(values).size !== count) {
    throw new TypeError(`${label} must resolve to exactly ${count} unique nodes`);
  }
  return values;
}

function eventClientPoint(event, touch) {
  if (event === null || typeof event !== "object") {
    throw new TypeError("arena input event must be an object");
  }
  if (!touch) {
    return checkedClientPoint({
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }
  const touches = event.changedTouches;
  if (
    touches === null ||
    typeof touches !== "object" ||
    touches.length !== 1
  ) {
    throw new TypeError("arena touch event must contain exactly one changed touch");
  }
  return checkedClientPoint({
    clientX: touches[0].clientX,
    clientY: touches[0].clientY,
  });
}

function arenaClientRect(arena) {
  const measured = arena.getBoundingClientRect();
  if (
    measured === null ||
    (typeof measured !== "object" && typeof measured !== "function")
  ) {
    throw new TypeError("arena border rectangle must be an object");
  }
  const border = checkedRect({
    height: measured.height,
    left: measured.left,
    top: measured.top,
    width: measured.width,
  });
  const metrics = {
    height: arena.clientHeight,
    left: arena.clientLeft,
    top: arena.clientTop,
    width: arena.clientWidth,
  };
  for (const [key, value] of Object.entries(metrics)) {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      throw new TypeError(`arena client metric ${key} must be finite`);
    }
  }
  if (
    metrics.left < 0 ||
    metrics.top < 0 ||
    metrics.width <= 0 ||
    metrics.height <= 0 ||
    metrics.left + metrics.width > border.width ||
    metrics.top + metrics.height > border.height
  ) {
    throw new TypeError("arena client metrics exceed the border box");
  }
  return checkedRect({
    height: metrics.height,
    left: border.left + metrics.left,
    top: border.top + metrics.top,
    width: metrics.width,
  });
}

function arenaEventFamily(arena) {
  const view = arena.ownerDocument?.defaultView;
  return (
    view !== null &&
    typeof view === "object" &&
    typeof view.PointerEvent === "function"
  ) ? "pointer" : "legacy";
}

function sameClientPoint(left, right) {
  return (
    left !== null &&
    left.clientX === right.clientX &&
    left.clientY === right.clientY
  );
}

/**
 * Browser seam: bind the four hand slots and arena to one deterministic input
 * controller. Returned direct handlers are also the browser smoke-test seam.
 */
export function mountArenaInputController(shell, hudController) {
  const arena = exactNodes(shell, '[data-ui="arena"]', 1, "arena input arena")[0];
  const hand = exactNodes(shell, '[data-ui="card-slot"]', 4, "arena input hand");
  if (
    typeof arena.getBoundingClientRect !== "function" ||
    typeof arena.addEventListener !== "function" ||
    hand.some((node) => typeof node.addEventListener !== "function")
  ) {
    throw new TypeError("arena input hooks must support browser events");
  }
  const input = new ArenaInputController({
    cards: hudController.cards,
    commitSystems: hudController.replaceInteractionSystems,
    deck: hudController.deck,
    elixir: hudController.elixir,
    hudUpdate: hudController.update,
  });
  const trustedReader = feedbackReaders.get(input);
  const placeClientPoint = input.placeClientPoint.bind(input);
  const selectCard = input.select.bind(input);
  const eventFamily = arenaEventFamily(arena);
  let pendingTouchRelease = null;
  let feedback = null;
  const notify = (method, result, selectedCardIdBefore = null) => {
    if (feedback !== null) {
      if (method === "onPlace") {
        feedback.onPlace(issueArenaInputFeedbackReceipt(
          input,
          result,
          selectedCardIdBefore,
        ));
      } else {
        feedback.onSelect(result, trustedReader().selectedCardId);
      }
    }
    return result;
  };
  const onCard = (event) => notify(
    "onSelect",
    selectCard(event.currentTarget.dataset.cardId),
  );
  const onPointer = (event) => {
    const selectedCardIdBefore = trustedReader().selectedCardId;
    return notify(
      "onPlace",
      placeClientPoint(
        arenaClientRect(arena),
        eventClientPoint(event, false),
      ),
      selectedCardIdBefore,
    );
  };
  const onTouch = (event) => {
    const selectedCardIdBefore = trustedReader().selectedCardId;
    const point = eventClientPoint(event, true);
    pendingTouchRelease = point;
    return notify(
      "onPlace",
      placeClientPoint(
        arenaClientRect(arena),
        point,
      ),
      selectedCardIdBefore,
    );
  };
  const onMouse = (event) => {
    const point = eventClientPoint(event, false);
    if (
      event.sourceCapabilities?.firesTouchEvents === true ||
      sameClientPoint(pendingTouchRelease, point)
    ) {
      pendingTouchRelease = null;
      return Object.freeze({
        accepted: false,
        point: null,
        reason: "compatibility_mouse_suppressed",
        type: "place",
      });
    }
    pendingTouchRelease = null;
    const selectedCardIdBefore = trustedReader().selectedCardId;
    return notify(
      "onPlace",
      placeClientPoint(arenaClientRect(arena), point),
      selectedCardIdBefore,
    );
  };
  const setFeedback = (next) => {
    if (next === null) {
      feedback = null;
      return;
    }
    if (
      next === null ||
      typeof next !== "object" ||
      typeof next.onPlace !== "function" ||
      typeof next.onSelect !== "function"
    ) {
      throw new TypeError("arena input feedback hook is invalid");
    }
    feedback = next;
  };
  const getClientRect = () => arenaClientRect(arena);
  for (const node of hand) node.addEventListener("click", onCard);
  if (eventFamily === "pointer") {
    arena.addEventListener("pointerup", onPointer);
  } else {
    arena.addEventListener("touchend", onTouch);
    arena.addEventListener("mouseup", onMouse);
  }
  let mounted = true;
  const cleanup = () => {
    if (!mounted) return false;
    mounted = false;
    feedback = null;
    for (const node of hand) node.removeEventListener?.("click", onCard);
    if (eventFamily === "pointer") {
      arena.removeEventListener?.("pointerup", onPointer);
    } else {
      arena.removeEventListener?.("touchend", onTouch);
      arena.removeEventListener?.("mouseup", onMouse);
    }
    return true;
  };
  return Object.freeze({
    cards: Object.freeze(
      trustedReader().cards.map((card) => Object.freeze(card)),
    ),
    cleanup,
    eventFamily,
    getClientRect,
    input,
    onCard,
    onMouse,
    onPointer,
    onTouch,
    setFeedback,
  });
}
