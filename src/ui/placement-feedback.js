import {
  ARENA_LENGTH_MILLITILES,
  ARENA_WIDTH_MILLITILES,
  validateArenaPoint,
} from "../sim/arena-geometry.js";
import { evaluateDeployment } from "../sim/deployment.js";
import { DECK_MAX_PLAY_COMMANDS } from "../sim/deck.js";
import { ElixirMatch } from "../sim/elixir.js";
import {
  clientPointToArenaPoint,
  consumeArenaInputFeedbackReceipt,
} from "./input-controller.js";

export const PLACEMENT_FEEDBACK_HISTORY_LIMIT = 256;

function clone(value) {
  return JSON.parse(canonicalJson(value));
}

function canonicalJson(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("canonical JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Object.getOwnPropertySymbols(value).length !== 0
    ) {
      throw new TypeError("canonical JSON arrays must be ordinary arrays");
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const length = descriptors.length;
    if (
      !length ||
      !Object.hasOwn(length, "value") ||
      length.value !== value.length
    ) {
      throw new TypeError("canonical JSON array length is invalid");
    }
    const parts = [];
    for (let index = 0; index < length.value; index += 1) {
      const descriptor = descriptors[String(index)];
      if (
        !descriptor ||
        !descriptor.enumerable ||
        !Object.hasOwn(descriptor, "value")
      ) {
        throw new TypeError("canonical JSON arrays must be dense data arrays");
      }
      parts.push(canonicalJson(descriptor.value));
    }
    if (
      Object.keys(descriptors).some((key) =>
        key !== "length" &&
        (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length.value)
      )
    ) {
      throw new TypeError("canonical JSON arrays have an invalid shape");
    }
    return `[${parts.join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const record = dataRecord(value, "canonical JSON object");
    return `{${Object.keys(record).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(record[key])}`
    ).join(",")}}`;
  }
  throw new TypeError("canonical JSON contains an unsupported value");
}

function dataRecord(value, label, expectedKeys = null) {
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
  const keys = Object.keys(descriptors).sort();
  if (
    expectedKeys !== null &&
    (
      keys.length !== expectedKeys.length ||
      keys.some((key, index) => key !== [...expectedKeys].sort()[index])
    )
  ) {
    throw new TypeError(`${label} has an invalid shape`);
  }
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError(`${label}.${key} must be an enumerable data property`);
    }
  }
  return Object.fromEntries(
    Object.entries(descriptors).map(([key, descriptor]) => [
      key,
      descriptor.value,
    ]),
  );
}

function safeInteger(value, label, minimum, maximum = Number.MAX_SAFE_INTEGER) {
  if (
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  ) {
    throw new TypeError(
      `${label} must be a safe integer from ${minimum} through ${maximum}`,
    );
  }
  return value;
}

const COMMAND_KEYS = Object.freeze([
  "cardId",
  "cost",
  "id",
  "point",
  "sequence",
  "side",
  "spendSequence",
  "tick",
  "type",
]);
const ACCEPTED_RESULT_KEYS = Object.freeze([
  "accepted",
  "command",
  "confidence",
  "reason",
  "type",
]);
const REJECTED_RESULT_KEYS = Object.freeze([
  "accepted",
  "point",
  "reason",
  "type",
]);
const DECIDED_REJECTION_KEYS = Object.freeze([
  "accepted",
  "confidence",
  "point",
  "reason",
  "type",
]);
const PREDECISION_REASONS = new Set([
  "card_unavailable",
  "insufficient_elixir",
  "nothing_selected",
]);

function checkedCommand(value, expectedSequence) {
  const command = dataRecord(
    value,
    `deploy command ${expectedSequence}`,
    COMMAND_KEYS,
  );
  if (
    typeof command.cardId !== "string" ||
    command.cardId.length === 0 ||
    command.cardId.length > 128 ||
    command.side !== "south" ||
    command.type !== "deploy"
  ) {
    throw new TypeError(`deploy command ${expectedSequence} is invalid`);
  }
  safeInteger(command.cost, `deploy command ${expectedSequence}.cost`, 1, 10);
  safeInteger(
    command.id,
    `deploy command ${expectedSequence}.id`,
    1,
    DECK_MAX_PLAY_COMMANDS,
  );
  safeInteger(
    command.sequence,
    `deploy command ${expectedSequence}.sequence`,
    0,
    DECK_MAX_PLAY_COMMANDS - 1,
  );
  safeInteger(
    command.spendSequence,
    `deploy command ${expectedSequence}.spendSequence`,
    0,
  );
  safeInteger(command.tick, `deploy command ${expectedSequence}.tick`, 0);
  if (
    command.sequence !== expectedSequence ||
    command.id !== expectedSequence + 1
  ) {
    throw new TypeError(`deploy command ${expectedSequence} is noncanonical`);
  }
  const point = validateArenaPoint(
    command.point,
    `deploy command ${expectedSequence}.point`,
  );
  const decision = evaluateDeployment({
    destroyedOpposingLaneTowers: [],
    placementClass: "ground_entity",
    point,
    side: "south",
  });
  if (!decision.legal) {
    throw new TypeError(`deploy command ${expectedSequence} is not legal`);
  }
  return { command: clone(command), decision, point };
}

function checkedCommandHistory(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length > DECK_MAX_PLAY_COMMANDS
  ) {
    throw new TypeError("placement command history is invalid");
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const length = descriptors.length;
  if (
    !length ||
    !Object.hasOwn(length, "value") ||
    length.value !== value.length
  ) {
    throw new TypeError("placement command history length is invalid");
  }
  const commands = [];
  for (let index = 0; index < length.value; index += 1) {
    const descriptor = descriptors[String(index)];
    if (
      !descriptor ||
      !descriptor.enumerable ||
      !Object.hasOwn(descriptor, "value")
    ) {
      throw new TypeError("placement command history must be dense data");
    }
    commands.push(checkedCommand(descriptor.value, index).command);
  }
  if (
    Object.keys(descriptors).some((key) =>
      key !== "length" &&
      (!/^(0|[1-9]\d*)$/u.test(key) || Number(key) >= length.value)
    )
  ) {
    throw new TypeError("placement command history has an invalid shape");
  }
  return commands;
}

function checkedCardId(value) {
  if (value !== null && (typeof value !== "string" || value.length === 0)) {
    throw new TypeError("placement selected card ID is invalid");
  }
  return value;
}

function checkedCatalog(value) {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    value.length > 128
  ) {
    throw new TypeError("placement feedback card catalog is invalid");
  }
  const catalog = new Map();
  for (let index = 0; index < value.length; index += 1) {
    const card = dataRecord(
      value[index],
      `placement feedback card ${index}`,
      ["cost", "displayName", "id"],
    );
    if (
      typeof card.id !== "string" ||
      card.id.length === 0 ||
      card.id.length > 128 ||
      typeof card.displayName !== "string" ||
      card.displayName.length === 0 ||
      card.displayName.length > 256
    ) {
      throw new TypeError(`placement feedback card ${index} is invalid`);
    }
    safeInteger(card.cost, `placement feedback card ${index}.cost`, 1, 10);
    if (catalog.has(card.id)) {
      throw new TypeError("placement feedback card IDs must be unique");
    }
    catalog.set(card.id, Object.freeze(clone(card)));
  }
  return catalog;
}

function initialState() {
  return {
    command: null,
    legal: null,
    point: null,
    reason: "nothing_selected",
    selectedCardId: null,
    sequence: 0,
    status: "hidden",
  };
}

function checkedEventPoint(event, touch) {
  if (event === null || typeof event !== "object") {
    throw new TypeError("placement pointer event must be an object");
  }
  let clientX;
  let clientY;
  if (touch) {
    const touches = event.changedTouches;
    if (
      touches === null ||
      typeof touches !== "object" ||
      touches.length !== 1
    ) {
      throw new TypeError(
        "placement touch event must contain exactly one changed touch",
      );
    }
    ({ clientX, clientY } = touches[0]);
  } else {
    ({ clientX, clientY } = event);
  }
  if (
    typeof clientX !== "number" ||
    !Number.isFinite(clientX) ||
    typeof clientY !== "number" ||
    !Number.isFinite(clientY)
  ) {
    throw new TypeError("placement pointer coordinates must be finite");
  }
  return { clientX, clientY };
}

function exactNode(target, selector, label) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.querySelectorAll !== "function"
  ) {
    throw new TypeError(`${label} target is invalid`);
  }
  const nodes = Array.from(target.querySelectorAll(selector));
  if (nodes.length !== 1) {
    throw new TypeError(`${label} must resolve to exactly one node`);
  }
  return nodes[0];
}

export class PlacementFeedbackController {
  #acceptedCommands = [];
  #catalog;
  #history = [];
  #source = null;
  #state = initialState();

  constructor(cards = [], initialCommands = []) {
    this.#catalog = checkedCatalog(cards);
    this.#acceptedCommands = checkedCommandHistory(initialCommands).map((entry) =>
      Object.freeze(clone(entry)));
  }

  get history() {
    return Object.freeze(clone(this.#history).map(Object.freeze));
  }

  get view() {
    return Object.freeze(clone(this.#state));
  }

  select(cardIdValue) {
    const cardId = checkedCardId(cardIdValue);
    return this.#commit({
      command: null,
      legal: null,
      point: null,
      reason: cardId === null ? "nothing_selected" : "awaiting_pointer",
      selectedCardId: cardId,
      status: "hidden",
    });
  }

  previewArenaPoint(pointValue) {
    if (this.#state.selectedCardId === null) return this.view;
    const point = validateArenaPoint(pointValue, "placement preview point");
    const decision = evaluateDeployment({
      destroyedOpposingLaneTowers: [],
      placementClass: "ground_entity",
      point,
      side: "south",
    });
    return this.#commit({
      command: null,
      legal: decision.legal,
      point,
      reason: decision.reason,
      selectedCardId: this.#state.selectedCardId,
      status: decision.legal ? "legal" : "illegal",
    });
  }

  previewClientPoint(rect, point) {
    const arenaPoint = clientPointToArenaPoint(rect, point);
    if (arenaPoint === null) {
      if (this.#state.selectedCardId === null) return this.view;
      return this.#commit({
        command: null,
        legal: false,
        point: null,
        reason: "outside_client_bounds",
        selectedCardId: this.#state.selectedCardId,
        status: "illegal",
      });
    }
    return this.previewArenaPoint(arenaPoint);
  }

  recordPlacement(receipt) {
    const payload = consumeArenaInputFeedbackReceipt(receipt);
    const selectedCardId = checkedCardId(payload.selectedCardIdBefore);
    const commands = checkedCommandHistory(payload.commands);
    if (
      this.#source !== null &&
      payload.source !== this.#source
    ) {
      throw new TypeError("placement feedback source changed");
    }
    if (commands.length < this.#acceptedCommands.length) {
      throw new TypeError("placement command history was truncated");
    }
    for (let index = 0; index < this.#acceptedCommands.length; index += 1) {
      if (
        canonicalJson(commands[index]) !==
        canonicalJson(this.#acceptedCommands[index])
      ) {
        throw new TypeError("placement command history prefix changed");
      }
    }
    const resultValue = payload.result;
    const base = dataRecord(resultValue, "placement result");
    if (base.type !== "place" || typeof base.accepted !== "boolean") {
      throw new TypeError("placement result is invalid");
    }
    if (base.accepted) {
      const result = dataRecord(
        resultValue,
        "accepted placement result",
        ACCEPTED_RESULT_KEYS,
      );
      if (
        selectedCardId === null ||
        commands.length !== this.#acceptedCommands.length + 1
      ) {
        throw new TypeError("accepted placement result is causally stale");
      }
      const checked = checkedCommand(
        result.command,
        commands.length - 1,
      );
      const command = checked.command;
      const card = this.#catalog.get(command.cardId);
      if (
        command.cardId !== selectedCardId ||
        card === undefined ||
        command.cost !== card.cost
      ) {
        throw new TypeError(
          "accepted deploy command does not match selected catalog card",
        );
      }
      if (canonicalJson(command) !== canonicalJson(commands.at(-1))) {
        throw new TypeError(
          "accepted deploy command does not equal canonical input command",
        );
      }
      if (
        result.confidence !== checked.decision.confidence ||
        result.reason !== checked.decision.reason ||
        payload.spendSequenceProvenance !== command.spendSequence
      ) {
        throw new TypeError("accepted placement decision is noncanonical");
      }
      if (typeof payload.elixir !== "string") {
        throw new TypeError("accepted placement elixir proof is invalid");
      }
      const elixir = ElixirMatch.restore(payload.elixir);
      if (elixir.serialize() !== payload.elixir) {
        throw new TypeError("accepted placement elixir proof is noncanonical");
      }
      const scheduled = JSON.parse(payload.elixir).commands;
      const spend = scheduled.at(-1);
      if (
        spend === undefined ||
        spend.cost !== command.cost ||
        spend.side !== command.side ||
        spend.tick !== command.tick
      ) {
        throw new TypeError(
          "accepted deploy spend lacks canonical elixir provenance",
        );
      }
      this.#acceptedCommands = commands.map((entry) =>
        Object.freeze(clone(entry))
      );
      this.#source = payload.source;
      return this.#commit({
        command,
        legal: true,
        point: checked.point,
        reason: result.reason,
        selectedCardId: null,
        status: "accepted",
      });
    }
    if (commands.length !== this.#acceptedCommands.length) {
      throw new TypeError("rejected placement result has a causal command gap");
    }
    const decided = Object.hasOwn(base, "confidence");
    const result = dataRecord(
      resultValue,
      "rejected placement result",
      decided ? DECIDED_REJECTION_KEYS : REJECTED_RESULT_KEYS,
    );
    if (typeof result.reason !== "string" || result.reason.length === 0) {
      throw new TypeError("rejected placement reason is invalid");
    }
    const point = result.point === null
      ? null
      : validateArenaPoint(result.point, "rejected placement point");
    if (decided) {
      if (point === null || selectedCardId === null) {
        throw new TypeError("decided rejection must contain an arena point");
      }
      const decision = evaluateDeployment({
        destroyedOpposingLaneTowers: [],
        placementClass: "ground_entity",
        point,
        side: "south",
      });
      if (
        decision.legal ||
        result.reason !== decision.reason ||
        result.confidence !== decision.confidence
      ) {
        throw new TypeError("rejected placement decision is noncanonical");
      }
    } else if (
      (point === null && result.reason !== "outside_client_bounds") ||
      (point !== null && !PREDECISION_REASONS.has(result.reason)) ||
      (result.reason === "nothing_selected") !== (selectedCardId === null)
    ) {
      throw new TypeError("predecision placement rejection is noncanonical");
    }
    this.#source = payload.source;
    return this.#commit({
      command: null,
      legal: false,
      point,
      reason: result.reason,
      selectedCardId,
      status: "illegal",
    });
  }

  serialize() {
    return canonicalJson({
      history: this.#history,
      state: this.#state,
      version: 1,
    });
  }

  #commit(next) {
    this.#state = {
      ...next,
      sequence: this.#state.sequence + 1,
    };
    this.#history.push(clone(this.#state));
    if (this.#history.length > PLACEMENT_FEEDBACK_HISTORY_LIMIT) {
      this.#history.shift();
    }
    return this.view;
  }
}

export function bindPlacementFeedback(node, viewValue) {
  const view = dataRecord(viewValue, "placement feedback view");
  if (
    node === null ||
    typeof node !== "object" ||
    node.dataset === null ||
    typeof node.dataset !== "object" ||
    node.style === null ||
    typeof node.style !== "object" ||
    typeof node.style.setProperty !== "function"
  ) {
    throw new TypeError("placement feedback node is invalid");
  }
  node.dataset.state = view.status;
  node.dataset.reason = view.reason;
  node.dataset.cardId = view.selectedCardId ?? "";
  node.dataset.commandId = view.command === null
    ? ""
    : String(view.command.id);
  const visible = (
    view.point !== null &&
    ["legal", "illegal", "accepted"].includes(view.status)
  );
  const accepted = view.status === "accepted";
  const legal = view.status === "legal";
  node.style.setProperty("position", "absolute");
  node.style.setProperty("z-index", "10");
  node.style.setProperty("left", "calc(var(--placement-x) * 100% / 18000)");
  node.style.setProperty("top", "calc(var(--placement-y) * 100% / 32000)");
  node.style.setProperty("width", accepted ? "68px" : "52px");
  node.style.setProperty("height", accepted ? "68px" : "52px");
  node.style.setProperty("translate", "-50% -50%");
  node.style.setProperty("pointer-events", "none");
  node.style.setProperty("border", `4px solid ${
    accepted ? "#f7e6a0" : legal ? "#bfe77b" : "#ff9b7e"
  }`);
  node.style.setProperty("border-radius", "50%");
  node.style.setProperty("opacity", visible ? (accepted ? "0.96" : "0.92") : "0");
  node.style.setProperty(
    "background",
    accepted ? "#6ea35b99" : legal ? "#4b8b4ecc" : "#a9433dcc",
  );
  node.style.setProperty(
    "box-shadow",
    accepted
      ? "0 0 0 8px #e9cb6755, inset 0 0 0 4px #fff3b855"
      : legal
        ? "0 0 0 4px #1e4c2c99, inset 0 0 0 3px #eeffc844"
        : "0 0 0 4px #5d1d2499, inset 0 0 0 3px #ffe1d444",
  );
  if (view.point === null) {
    node.style.setProperty("--placement-x", "0");
    node.style.setProperty("--placement-y", "0");
  } else {
    const point = validateArenaPoint(view.point, "placement feedback view point");
    node.style.setProperty("--placement-x", String(point.x));
    node.style.setProperty(
      "--placement-y",
      String(ARENA_LENGTH_MILLITILES - point.y),
    );
  }
  node.setAttribute?.(
    "aria-label",
    view.status === "accepted"
      ? `Deployment accepted at ${view.point.x},${view.point.y}`
      : `Placement ${view.status}: ${view.reason}`,
  );
  node.setAttribute?.("aria-hidden", visible ? "false" : "true");
  return node;
}

export function mountPlacementFeedback(shell, browserInput) {
  const arena = exactNode(
    shell,
    '[data-ui="arena"]',
    "placement feedback arena",
  );
  if (
    arena.ownerDocument === null ||
    typeof arena.ownerDocument !== "object" ||
    typeof arena.ownerDocument.createElement !== "function" ||
    typeof arena.appendChild !== "function" ||
    typeof arena.addEventListener !== "function" ||
    typeof arena.removeEventListener !== "function" ||
    browserInput === null ||
    typeof browserInput !== "object" ||
    typeof browserInput.getClientRect !== "function" ||
    typeof browserInput.setFeedback !== "function" ||
    typeof browserInput.cleanup !== "function" ||
    !["legacy", "pointer"].includes(browserInput.eventFamily)
  ) {
    throw new TypeError("placement feedback browser hooks are invalid");
  }
  const node = arena.ownerDocument.createElement("div");
  node.className = "placement-feedback";
  node.dataset.ui = "placement-feedback";
  node.setAttribute("aria-hidden", "true");
  arena.appendChild(node);

  const controller = new PlacementFeedbackController(
    browserInput.cards,
    browserInput.input?.commands ?? [],
  );
  const render = (view) => bindPlacementFeedback(node, view);
  const feedback = {
    onPlace(receipt) {
      render(controller.recordPlacement(receipt));
    },
    onSelect(unused, selectedCardId) {
      render(controller.select(selectedCardId));
    },
  };
  const onPointerMove = (event) => render(controller.previewClientPoint(
    browserInput.getClientRect(),
    checkedEventPoint(event, false),
  ));
  const onTouchMove = (event) => render(controller.previewClientPoint(
    browserInput.getClientRect(),
    checkedEventPoint(event, true),
  ));
  let pendingTouchMove = null;
  const onLegacyTouchMove = (event) => {
    const point = checkedEventPoint(event, true);
    pendingTouchMove = point;
    return render(controller.previewClientPoint(
      browserInput.getClientRect(),
      point,
    ));
  };
  const onMouseMove = (event) => {
    const point = checkedEventPoint(event, false);
    if (
      event.sourceCapabilities?.firesTouchEvents === true ||
      (
        pendingTouchMove !== null &&
        pendingTouchMove.clientX === point.clientX &&
        pendingTouchMove.clientY === point.clientY
      )
    ) {
      pendingTouchMove = null;
      return controller.view;
    }
    pendingTouchMove = null;
    return render(controller.previewClientPoint(
      browserInput.getClientRect(),
      point,
    ));
  };
  browserInput.setFeedback(feedback);
  if (browserInput.eventFamily === "pointer") {
    arena.addEventListener("pointermove", onPointerMove);
  } else {
    arena.addEventListener("touchmove", onLegacyTouchMove);
    arena.addEventListener("mousemove", onMouseMove);
  }
  render(controller.view);

  let mounted = true;
  const cleanup = () => {
    if (!mounted) return false;
    mounted = false;
    browserInput.setFeedback(null);
    if (browserInput.eventFamily === "pointer") {
      arena.removeEventListener("pointermove", onPointerMove);
    } else {
      arena.removeEventListener("touchmove", onLegacyTouchMove);
      arena.removeEventListener("mousemove", onMouseMove);
    }
    browserInput.cleanup();
    node.remove();
    return true;
  };
  return Object.freeze({
    cleanup,
    controller,
    node,
    onPointerMove,
    onMouseMove,
    onTouchMove,
  });
}

export const PLACEMENT_FEEDBACK_COORDINATE_SPACE = Object.freeze({
  height: ARENA_LENGTH_MILLITILES,
  width: ARENA_WIDTH_MILLITILES,
});
