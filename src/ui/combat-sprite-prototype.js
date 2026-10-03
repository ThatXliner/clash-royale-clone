import { getBriarRunnerPaintedFrameTransform } from "./combat-art.js";

export { getBriarRunnerPaintedFrameTransform } from "./combat-art.js";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const DIRECTIONS = Object.freeze(["north", "east", "south", "west"]);
const ACTIONS = Object.freeze(["walk", "attack"]);
const TEAMS = Object.freeze({
  north: Object.freeze({ color: "#d85b4f", accent: "#f2a25e", label: "North" }),
  south: Object.freeze({ color: "#2e7f86", accent: "#9bbb76", label: "South" }),
});
const WALK_FRAME_TICKS = 5;
const ATTACK_FRAME_TICKS = 3;

function checkedState(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new TypeError("sprite state must be an object");
  const keys = Object.keys(value).sort().join(",");
  if (keys !== "action,direction,reducedMotion,tick")
    throw new TypeError("sprite state must contain exactly action, direction, reducedMotion, and tick");
  if (!ACTIONS.includes(value.action)) throw new RangeError("sprite action must be walk or attack");
  if (!DIRECTIONS.includes(value.direction)) throw new RangeError("sprite direction must be cardinal");
  if (!Number.isSafeInteger(value.tick) || value.tick < 0)
    throw new RangeError("sprite tick must be a non-negative safe integer");
  if (typeof value.reducedMotion !== "boolean")
    throw new TypeError("reducedMotion must be a boolean");
  return Object.freeze({
    action: value.action,
    direction: value.direction,
    reducedMotion: value.reducedMotion,
    tick: value.tick,
  });
}

function teamPalette(side) {
  const palette = TEAMS[side];
  if (!palette) throw new RangeError("sprite side must be north or south");
  return palette;
}

export function selectBriarRunnerFrame({ action, direction, tick, reducedMotion = false }) {
  const state = checkedState({ action, direction, tick, reducedMotion });
  const frameTicks = state.action === "walk" ? WALK_FRAME_TICKS : ATTACK_FRAME_TICKS;
  const frame = state.reducedMotion ? 0 : Math.floor(state.tick / frameTicks) % 2;
  return Object.freeze({
    action: state.action,
    direction: state.direction,
    frame,
    id: `briar-${state.action}-${state.direction}-${frame}`,
    reducedMotion: state.reducedMotion,
    tick: state.tick,
  });
}

export function serializeBriarRunnerState(value) {
  const state = checkedState(value);
  return JSON.stringify({
    action: state.action,
    direction: state.direction,
    reducedMotion: state.reducedMotion,
    tick: state.tick,
    version: 1,
  });
}

export function restoreBriarRunnerState(serialized) {
  if (typeof serialized !== "string") throw new TypeError("sprite checkpoint must be a string");
  let checkpoint;
  try {
    checkpoint = JSON.parse(serialized);
  } catch {
    throw new TypeError("sprite checkpoint must be valid JSON");
  }
  if (checkpoint === null || typeof checkpoint !== "object" || Array.isArray(checkpoint) ||
      Object.keys(checkpoint).sort().join(",") !==
        "action,direction,reducedMotion,tick,version" || checkpoint.version !== 1) {
    throw new TypeError("sprite checkpoint has an invalid shape or version");
  }
  const state = checkedState({
    action: checkpoint.action,
    direction: checkpoint.direction,
    reducedMotion: checkpoint.reducedMotion,
    tick: checkpoint.tick,
  });
  if (serialized !== serializeBriarRunnerState(state))
    throw new TypeError("sprite checkpoint must use canonical serialization");
  return state;
}

export function createBriarRunnerSprite(document, {
  action,
  assetUrl,
  direction,
  reducedMotion = false,
  side,
  tick,
} = {}) {
  if (typeof document?.createElementNS !== "function")
    throw new TypeError("sprite rendering requires a document with SVG support");
  if (typeof assetUrl !== "string" || assetUrl.length === 0)
    throw new TypeError("sprite sheet URL is required");
  const palette = teamPalette(side);
  const frame = selectBriarRunnerFrame({ action, direction, tick, reducedMotion });
  const svg = document.createElementNS(SVG_NAMESPACE, "svg");
  svg.setAttribute("viewBox", "0 0 64 64");
  svg.setAttribute("class", "briar-runner-sprite");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label",
    `${palette.label} Briar Runner ${frame.action}, facing ${frame.direction}`);
  svg.dataset.spriteSide = side;
  svg.dataset.spriteFrame = frame.id;
  svg.dataset.simulationTick = String(frame.tick);
  svg.dataset.reducedMotion = String(frame.reducedMotion);
  svg.style.color = palette.color;
  svg.style.setProperty("--team-color", palette.color);
  svg.style.setProperty("--team-accent", palette.accent);

  const use = document.createElementNS(SVG_NAMESPACE, "use");
  use.setAttribute("href", `${assetUrl}#${frame.id}`);
  use.dataset.spriteUse = frame.id;
  svg.appendChild(use);
  return svg;
}

export function createBriarRunnerPaintedSprite(document, {
  action,
  assetUrl,
  direction,
  reducedMotion = false,
  side,
  tick,
} = {}) {
  if (typeof document?.createElement !== "function")
    throw new TypeError("painted sprite rendering requires a document");
  if (typeof assetUrl !== "string" || assetUrl.length === 0)
    throw new TypeError("painted sprite atlas URL is required");
  const palette = teamPalette(side);
  const frame = selectBriarRunnerFrame({ action, direction, tick, reducedMotion });
  const transform = getBriarRunnerPaintedFrameTransform({
    action,
    direction,
    reducedMotion,
    tick,
  });
  const sprite = document.createElement("span");
  sprite.setAttribute("class", "briar-runner-painted-sprite");
  sprite.setAttribute("role", "img");
  sprite.setAttribute("aria-label",
    `${palette.label} painted Briar Runner ${frame.action}, facing ${frame.direction}`);
  sprite.dataset.spriteSide = side;
  sprite.dataset.spriteFrame = frame.id;
  sprite.dataset.simulationTick = String(frame.tick);
  sprite.dataset.reducedMotion = String(frame.reducedMotion);
  sprite.style.backgroundImage = `url("${assetUrl}")`;
  sprite.style.backgroundRepeat = "no-repeat";
  sprite.style.backgroundSize = transform.backgroundSize;
  sprite.style.backgroundPosition = transform.backgroundPosition;
  sprite.style.setProperty("--team-color", palette.color);
  sprite.style.setProperty("--team-accent", palette.accent);
  return sprite;
}

export function mountBriarRunnerPrototype(document) {
  const root = document.querySelector("[data-sprite-prototype]");
  if (!root) return null;
  const vectorAssetUrl = new URL("../public/assets/briar-runner-sprite-sheet.svg", document.baseURI).href;
  const paintedAssetUrl = new URL("../public/assets/briar-runner-painted-sheet.png", document.baseURI).href;
  const actionControl = root.querySelector("[data-control=action]");
  const directionControl = root.querySelector("[data-control=direction]");
  const tickControl = root.querySelector("[data-control=tick]");
  const reducedControl = root.querySelector("[data-control=reduced-motion]");
  const tickValue = root.querySelector("[data-tick-value]");
  const status = root.querySelector("[data-prototype-status]");
  const checkpointButton = root.querySelector("[data-action=checkpoint]");
  const advanceButton = root.querySelector("[data-action=advance]");
  const restoreButton = root.querySelector("[data-action=restore]");
  const selectedPreviews = [...root.querySelectorAll("[data-selected-side][data-renderer]")];
  const scaleBoards = [...root.querySelectorAll("[data-scale-board]")];
  const readState = () => checkedState({
    action: actionControl.value,
    direction: directionControl.value,
    reducedMotion: reducedControl.checked,
    tick: Number(tickControl.value),
  });
  const renderInto = (container, state, side, size, renderer) => {
    const sprite = renderer === "painted"
      ? createBriarRunnerPaintedSprite(document, {
        ...state,
        assetUrl: paintedAssetUrl,
        side,
      })
      : createBriarRunnerSprite(document, {
        ...state,
        assetUrl: vectorAssetUrl,
        side,
      });
    sprite.style.width = `${size}px`;
    sprite.style.height = `${size}px`;
    container.replaceChildren(sprite);
  };
  const render = () => {
    const state = readState();
    tickValue.textContent = String(state.tick);
    root.dataset.currentTick = String(state.tick);
    root.dataset.currentAction = state.action;
    root.dataset.currentDirection = state.direction;
    root.dataset.currentReducedMotion = String(state.reducedMotion);
    for (const board of scaleBoards) {
      const boardWidth = board.getBoundingClientRect().width;
      const unitSize = boardWidth * 0.048;
      board.dataset.measuredWidth = boardWidth.toFixed(2);
      board.dataset.unitSize = unitSize.toFixed(2);
      const renderer = board.dataset.renderer;
      for (const container of board.querySelectorAll("[data-sample-side][data-direction]")) {
        const side = container.dataset.sampleSide;
        const direction = container.dataset.direction;
        renderInto(container, { ...state, direction }, side, unitSize, renderer);
      }
    }
    for (const container of selectedPreviews) {
      const renderer = container.dataset.renderer;
      const previewSize = Math.min(144, container.getBoundingClientRect().width * 0.9);
      renderInto(container, state, container.dataset.selectedSide, previewSize, renderer);
    }
    const frame = selectBriarRunnerFrame(state);
    root.querySelector("[data-current-frame]").textContent = frame.id;
  };

  let checkpoint = serializeBriarRunnerState(readState());
  for (const control of [actionControl, directionControl, tickControl, reducedControl])
    control.addEventListener("input", render);
  document.defaultView?.addEventListener?.("resize", render);
  checkpointButton.addEventListener("click", () => {
    checkpoint = serializeBriarRunnerState(readState());
    status.textContent = `Saved ${JSON.parse(checkpoint).tick} · ${JSON.parse(checkpoint).action} · ${JSON.parse(checkpoint).direction}`;
  });
  advanceButton.addEventListener("click", () => {
    const state = readState();
    tickControl.value = String(state.tick + 12);
    render();
    status.textContent = "Advanced 12 simulation ticks; the original checkpoint is unchanged.";
  });
  restoreButton.addEventListener("click", () => {
    const state = restoreBriarRunnerState(checkpoint);
    actionControl.value = state.action;
    directionControl.value = state.direction;
    tickControl.value = String(state.tick);
    reducedControl.checked = state.reducedMotion;
    render();
    status.textContent = "Restored the exact saved presentation state.";
  });
  render();
  return Object.freeze({ render, readState });
}

if (typeof document !== "undefined") mountBriarRunnerPrototype(document);
