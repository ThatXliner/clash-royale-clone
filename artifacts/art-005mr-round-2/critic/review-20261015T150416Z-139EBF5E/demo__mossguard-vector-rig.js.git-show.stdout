// Original, editable Moss & Ember vector study. No bitmap, external asset, or runtime hook.
import { createCombatArt } from "../src/ui/combat-art.js";

export const MOSS_GUARD_DIRECTIONS = Object.freeze(["north", "east", "south", "west"]);
export const MOSS_GUARD_POSES = Object.freeze(["walkA", "walkB", "meleeWindup", "contact"]);
export const MOSS_GUARD_TEAMS = Object.freeze(["ember", "jade"]);

export const MOSS_GUARD_VECTOR_GEOMETRY = Object.freeze({
  viewBox: Object.freeze({ x: 0, y: 0, width: 64, height: 64 }),
  safeBounds: Object.freeze({ x: 4, y: 6, width: 56, height: 52 }),
  bodyHeightUnits: 52,
  soleAnchor: Object.freeze({ x: 32, y: 58 }),
  nativeCell: 16,
  nativeBodyHeight: 13,
});

const TEAMS = Object.freeze({ ember: "#C6452E", jade: "#2E7F86" });
const WOOD = "url(#mossguard-wood)";
const WOOD_LIGHT = "url(#mossguard-wood-light)";
const LEAF = "url(#mossguard-leaf)";
const LEAF_LIGHT = "#9DBD69";
const DARK = "#24302A";
const INK = "#18231F";

const p = (d, fill, extra = "") => `<path d="${d}" fill="${fill}" ${extra}/>`;

const southLegs = Object.freeze({
  walkA: [
    "M22 39 32 40 29 47 23 52 20 58 8 58 9 55 15 52 17 47Z",
    "M35 39 43 41 47 47 53 50 58 53 57 56 47 55 42 52 37 47Z",
  ],
  walkB: [
    "M22 39 32 40 29 47 24 50 21 54 12 55 10 52 17 49 18 46Z",
    "M35 39 43 40 47 47 50 52 57 55 59 58 45 58 41 54 36 48Z",
  ],
  meleeWindup: [
    "M21 39 31 40 29 47 25 51 24 57 13 58 11 55 19 52 18 48Z",
    "M35 39 44 41 47 47 44 51 49 54 57 54 59 58 45 58 40 54 35 48Z",
  ],
  contact: [
    "M19 38 31 39 27 47 22 51 17 58 5 58 5 55 12 52 15 47Z",
    "M35 39 44 40 48 47 54 50 60 54 60 58 46 58 40 54 34 47Z",
  ],
});

const eastLegs = Object.freeze({
  walkA: [
    "M25 39 35 39 34 46 38 51 44 54 57 55 60 58 40 58 33 54 28 47Z",
    "M34 40 42 42 44 48 40 52 33 54 24 52 17 54 7 54 8 51 20 47 27 44Z",
  ],
  walkB: [
    "M25 39 35 39 32 47 27 52 21 54 8 55 6 58 25 58 32 54 36 48Z",
    "M35 39 43 41 48 47 53 50 59 51 60 55 57 57 45 55 40 52 33 47Z",
  ],
  meleeWindup: [
    "M25 39 35 39 32 46 27 50 24 54 14 56 8 56 6 58 23 58 30 53 35 48Z",
    "M35 40 43 42 47 48 50 52 58 54 60 58 43 58 37 53 32 47Z",
  ],
  contact: [
    "M25 39 35 39 31 47 25 51 19 53 8 53 6 56 22 58 31 54 36 48Z",
    "M35 39 43 41 48 47 53 50 59 52 60 56 60 58 43 58 37 54 32 47Z",
  ],
});

const southArms = Object.freeze({
  walkA: [
    "M38 27Q45 28 49 34L49 40 44 43 40 38 37 33Z",
    "M47 37 54 36 59 40 59 46 54 50 48 47 44 42Z",
    "M49 39 54 38 57 41 57 44 53 47 49 44Z",
  ],
  walkB: [
    "M38 27 44 30 43 36 39 40 34 44 30 41 34 34Z",
    "M24 40 31 38 37 42 37 48 32 52 25 49 22 45Z",
    "M26 41 31 40 34 43 34 47 30 49 26 46Z",
  ],
  meleeWindup: [
    "M38 27 44 26 48 21 53 17 57 19 55 25 50 31 44 34 40 32Z",
    "M53 14 59 13 60 18 59 24 55 28 49 25 48 20Z",
    "M53 16 57 15 59 18 58 22 54 25 51 22Z",
  ],
  contact: [
    "M38 27 45 29 49 36 52 43 56 48 53 53 48 51 44 45 41 37 37 33Z",
    "M51 47 57 45 60 49 60 55 56 58 50 55 48 51Z",
    "M52 48 56 47 58 50 58 53 55 55 51 53Z",
  ],
});

const northArms = Object.freeze({
  walkA: [
    "M26 27 20 29 15 34 13 39 17 42 22 38 24 32",
    "M9 37 15 35 20 38 20 44 15 48 9 46 6 42Z",
    "M10 38 15 37 18 40 17 44 13 46 9 43Z",
  ],
  walkB: [
    "M26 27 21 29 23 35 28 39 32 42 36 39 31 33",
    "M31 39 37 37 42 40 43 46 38 50 32 47 29 43Z",
    "M33 40 37 39 40 42 40 45 36 48 32 45Z",
  ],
  meleeWindup: [
    "M26 27 20 26 15 22 10 21 8 25 13 30 18 33 22 32",
    "M6 18 12 17 17 20 17 26 13 30 7 28 4 23Z",
    "M8 19 12 18 15 21 14 25 10 27 6 24Z",
  ],
  contact: [
    "M26 27 20 29 18 26 22 21 31 18 40 15 45 13",
    "M44 9 51 7 57 10 60 15 57 20 51 22 46 18Z",
    "M47 10 51 9 55 11 57 14 54 18 50 19 46 15Z",
  ],
});

const eastArms = Object.freeze({
  walkA: [
    "M37 27 44 29 48 34 49 39 46 42 42 38 39 33Z",
    "M45 36 52 34 57 37 58 42 54 46 48 44 45 40Z",
    "M48 38 53 37 56 39 57 42 54 44 49 42Z",
  ],
  walkB: [
    "M37 27 43 30 42 35 37 40 32 44 28 41 33 33Z",
    "M23 41 30 39 36 42 36 48 31 52 24 49 21 45Z",
    "M25 42 30 41 33 43 33 47 29 49 25 46Z",
  ],
  meleeWindup: [
    "M37 27 44 26 48 22 53 18 57 20 54 26 49 31 43 33 39 32Z",
    "M52 15 58 14 60 18 59 24 55 29 49 26 48 21Z",
    "M52 17 57 16 59 19 57 23 53 26 50 23Z",
  ],
  contact: [
    "M37 27 45 28 51 28 56 31 58 35 55 39 50 37 45 34 40 33Z",
    "M54 27 60 26 60 32 60 39 57 42 52 39 51 34Z",
    "M55 29 59 28 60 32 59 36 56 39 53 36Z",
  ],
});

function addMossCap(paths, direction) {
  paths.push(
    p(direction === "east"
      ? "M25 14Q25 6 33 6Q41 6 42 14L38 17Q33 13 27 17Z"
      : "M24 14Q24 6 32 6Q40 6 40 14L36 17Q32 13 28 17Z", DARK),
    p(direction === "east"
      ? "M27 13Q27 8 33 8Q39 8 40 13L37 15Q32 12 28 15Z"
      : "M26 13Q26 8 32 8Q38 8 38 13L35 15Q32 12 29 15Z", LEAF),
    p(direction === "east" ? "M29 10Q31 8 34 9L32 12Z" : "M28 10Q30 8 33 9L31 12Z", LEAF_LIGHT),
  );
}

function addMask(paths, direction) {
  if (direction === "north") {
    paths.push(
      p("M23 14Q31 9 40 13L43 21 39 28 29 29 22 23Z", DARK),
      p("M25 15Q32 11 39 15L41 21 37 26 30 27 24 22Z", WOOD_LIGHT),
      p("M26 17 38 17 38 19 26 19ZM28 23 37 23 35 25 29 25Z", WOOD),
      p("M25 14 29 13M39 14 41 18", LEAF_LIGHT),
    );
  } else if (direction === "east") {
    paths.push(
      p("M25 14Q32 9 39 13L43 19 46 22 42 25 39 29 29 28 24 22Z", DARK),
      p("M27 15Q33 11 39 15L42 19 44 22 40 23 38 27 30 26 26 21Z", WOOD_LIGHT),
      p("M36 18 40 18 41 20 37 20Z", INK),
      p("M42 21 45 22 42 24Z", WOOD),
      p("M27 14 31 12M39 14 42 17", LEAF_LIGHT),
    );
  } else {
    paths.push(
      p("M24 14Q32 9 40 13L43 21 38 28 28 28 22 22Z", DARK),
      p("M26 15Q32 11 38 15L41 21 37 26 29 26 24 21Z", WOOD_LIGHT),
      p("M27 19 31 18 31 20 27 21ZM34 18 38 19 38 21 34 20Z", INK),
      p("M31 20 34 20 36 25 33 26 31 23Z", WOOD),
      p("M27 14 31 12M38 14 41 18", LEAF_LIGHT),
    );
  }
}

function geometryFor(direction, pose, team) {
  const paths = [];
  const isSide = direction === "east" || direction === "west";
  const legs = (isSide ? eastLegs : southLegs)[pose];
  paths.push(p(legs[0], DARK), p(legs[1], DARK));

  if (direction === "north") {
    paths.push(
      p("M25 25Q18 19 12 24L4 32 9 40 16 36 15 43 24 40 30 31ZM37 24Q45 18 51 24L60 32 55 40 48 36 49 43 40 40 34 31Z", DARK),
      p("M24 24Q18 20 13 25L6 32 10 37 17 33 16 39 24 37 30 30ZM38 24Q44 19 50 25L58 32 54 37 47 33 48 39 40 37 34 30Z", LEAF),
      p("M14 27 8 33 11 35 16 31ZM49 25 56 32 53 35 48 31Z", LEAF_LIGHT),
      p("M22 27 41 26 45 40 39 46 24 45 19 38Z", DARK),
      p("M24 28 39 28 42 39 37 43 26 43 22 37Z", WOOD),
      p("M24 34 41 34 42 39 37 41 26 41 22 38Z", TEAMS[team]),
      p("M29 29 33 30 31 40 27 40Z", WOOD_LIGHT),
      p("M28 31 38 31", DARK),
      p(northArms[pose][0], DARK), p(northArms[pose][1], DARK), p(northArms[pose][2], WOOD_LIGHT),
    );
    addMossCap(paths, "north");
    addMask(paths, "north");
    paths.push(
      p("M46 27Q53 24 58 29L60 37 54 48 47 46 44 37Z", DARK),
      p("M48 29Q53 27 56 31L58 36 53 44 48 42 46 36Z", LEAF),
      p("M51 31 54 30 56 35 53 40Z", LEAF_LIGHT),
      p("M51 36 52 40", DARK),
    );
    return { paths, transform: "" };
  }

  if (isSide) {
    paths.push(
      p("M29 24Q20 17 13 23L4 31 9 40 17 36 18 42 26 39 32 31Z", DARK),
      p("M29 24Q21 19 14 25L7 32 11 37 18 33 19 38 26 36 32 30Z", LEAF),
      p("M14 27 8 33 12 35 17 31Z", LEAF_LIGHT),
      p("M28 25 41 25 45 39 40 46 27 45 22 38Z", DARK),
      p("M29 27 40 27 42 38 38 43 29 42 25 37Z", WOOD),
      p("M28 34 42 34 42 39 38 41 28 40Z", TEAMS[team]),
      p("M32 28 37 28 36 39 31 39Z", WOOD_LIGHT),
      p("M35 32 39 32", DARK),
      p(eastArms[pose][0], DARK), p(eastArms[pose][1], DARK), p(eastArms[pose][2], WOOD_LIGHT),
    );
    addMossCap(paths, "east");
    addMask(paths, "east");
    paths.push(
      p("M8 28Q4 34 8 44L15 50Q23 43 22 34L17 28Z", DARK),
      p("M10 30Q7 35 10 43L15 47Q20 41 20 34L16 30Z", LEAF),
      p("M12 32 14 32 13 43 11 41Z", LEAF_LIGHT),
      p("M15 31 20 37", DARK),
    );
    return { paths, transform: direction === "west" ? "translate(64 0) scale(-1 1)" : "" };
  }

  paths.push(
    p("M25 24Q18 18 12 23L4 31 9 40 16 36 16 43 25 39 31 31ZM38 24Q45 19 51 24L59 32 55 40 48 36 48 43 39 40 33 31Z", DARK),
    p("M25 24Q19 20 13 25L6 32 10 37 17 33 17 39 25 37 31 30ZM38 24Q44 20 50 25L57 32 53 37 47 33 47 39 39 37 33 30Z", LEAF),
    p("M13 27 8 33 11 35 16 31ZM49 26 55 32 52 35 47 31Z", LEAF_LIGHT),
    p("M22 25 41 25 45 40 39 46 24 45 19 38Z", DARK),
    p("M24 27 39 27 42 39 37 43 26 43 22 37Z", WOOD),
    p("M23 34 41 34 42 39 37 41 24 41Z", TEAMS[team]),
    p("M28 28 33 28 32 40 27 40Z", WOOD_LIGHT),
    p("M27 31 37 31", DARK),
    p(southArms[pose][0], DARK), p(southArms[pose][1], DARK), p(southArms[pose][2], WOOD_LIGHT),
  );
  addMossCap(paths, "south");
  addMask(paths, "south");
  paths.push(
    p("M7 28Q3 34 7 44L14 50Q22 43 21 34L16 28Z", DARK),
    p("M9 30Q6 35 9 43L14 47Q19 41 19 34L15 30Z", LEAF),
    p("M11 32 13 32 12 43 10 41Z", LEAF_LIGHT),
    p("M15 31 20 37", DARK),
  );

  return { paths, transform: "" };
}

export function getMossguardVectorPose({ direction, pose, team, tick } = {}) {
  if (!MOSS_GUARD_DIRECTIONS.includes(direction)) throw new RangeError("Mossguard direction must be north, east, south, or west");
  if (!MOSS_GUARD_POSES.includes(pose)) throw new RangeError("Mossguard pose must be walkA, walkB, meleeWindup, or contact");
  if (!MOSS_GUARD_TEAMS.includes(team)) throw new RangeError("Mossguard team must be ember or jade");
  if (!Number.isSafeInteger(tick) || tick < 0) throw new RangeError("Mossguard tick must be a non-negative safe integer");
  return Object.freeze({ direction, pose, team, tick, ...MOSS_GUARD_VECTOR_GEOMETRY });
}

export function renderMossguardVectorPose(options, instancePrefix) {
  const state = getMossguardVectorPose(options);
  if (typeof instancePrefix !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(instancePrefix)) {
    throw new RangeError("Mossguard instancePrefix must be a 1–64 character SVG-safe identifier");
  }
  const { paths, transform } = geometryFor(state.direction, state.pose, state.team);
  const replaceGradientId = (value) => value.replaceAll("mossguard-wood-light", `${instancePrefix}-wood-light`)
    .replaceAll("mossguard-wood", `${instancePrefix}-wood`)
    .replaceAll("mossguard-leaf", `${instancePrefix}-leaf`);
  const body = replaceGradientId(paths.join(""));
  return `<svg xmlns="http://www.w3.org/2000/svg" class="mossguard-vector-art" viewBox="0 0 64 64" role="img" aria-label="Mossguard ${state.direction} ${state.pose}" data-direction="${state.direction}" data-pose="${state.pose}" data-team="${state.team}" data-tick="${state.tick}" data-instance-prefix="${instancePrefix}" data-body-height-units="52" data-sole-anchor="32 58" data-safe-bounds="4 6 56 52"><defs><linearGradient id="${instancePrefix}-wood" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#B28A5A"/><stop offset="1" stop-color="#654936"/></linearGradient><linearGradient id="${instancePrefix}-wood-light" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#D0AC78"/><stop offset="1" stop-color="#98704C"/></linearGradient><linearGradient id="${instancePrefix}-leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#88AA5D"/><stop offset="1" stop-color="#426E43"/></linearGradient></defs><ellipse cx="32" cy="59.1" rx="14" ry="2" fill="#16211D" opacity=".65"/><g data-mossguard-body="true" data-anchor-x="32" data-anchor-y="58" data-safe-x="4" data-safe-y="6" data-safe-width="56" data-safe-height="52"${transform ? ` transform="${transform}"` : ""}>${body}</g></svg>`;
}

if (typeof document !== "undefined" && document.querySelector("[data-rig-demo]")) {
  const directions = MOSS_GUARD_DIRECTIONS;
  const poses = MOSS_GUARD_POSES;
  const body = document.body;
  const view = new URL(window.location.href).searchParams.get("view");
  const requestedView = ["before", "after"].includes(view) ? view : "compare";
  body.dataset.view = "compare";

  function measuredBounds(element, stroke = false) {
    const box = element.getBBox();
    const line = stroke && getComputedStyle(element).stroke !== "none"
      ? Number.parseFloat(getComputedStyle(element).strokeWidth)
      : 0;
    const inset = line / 2;
    return { x: box.x - inset, y: box.y - inset, width: box.width + line, height: box.height + line };
  }

  function unionBounds(boxes) {
    const x = Math.min(...boxes.map(({ x }) => x));
    const y = Math.min(...boxes.map(({ y }) => y));
    const right = Math.max(...boxes.map(({ x, width }) => x + width));
    const bottom = Math.max(...boxes.map(({ y, height }) => y + height));
    return { x, y, width: right - x, height: bottom - y };
  }

  function mountOriginals() {
    const boxes = [];
    for (const side of ["north", "south"]) {
      const mount = document.querySelector(`[data-original-side="${side}"]`);
      const art = createCombatArt(document, "mossguard", side, "ground");
      mount.append(art);
      const paths = [...art.querySelectorAll("path")];
      const bodyBounds = unionBounds(paths.map((node) => measuredBounds(node, true)));
      const height = bodyBounds.height * art.getBoundingClientRect().height / 64;
      boxes.push({ side, bounds: bodyBounds, height });
    }
    const height = Math.max(...boxes.map(({ height }) => height));
    document.querySelector("[data-baseline-measure]").textContent =
      `Stroke-inclusive original path body: ${height.toFixed(2)} CSS px`;
    return boxes;
  }

  function mountRig(target, size) {
    const output = [];
    for (let directionIndex = 0; directionIndex < directions.length; directionIndex += 1) {
      const direction = directions[directionIndex];
      const team = directionIndex % 2 === 0 ? "ember" : "jade";
      if (size === 16) {
        target.insertAdjacentHTML("beforeend", `<div class="direction-heading">${direction}</div>`);
      } else {
        target.insertAdjacentHTML("beforeend", `<div class="direction-heading diagnostic-label">${direction}</div>`);
      }
      for (let poseIndex = 0; poseIndex < poses.length; poseIndex += 1) {
        const pose = poses[poseIndex];
        const tick = directionIndex * 31 + poseIndex * 17;
        const prefix = `mossguard-${size === 16 ? "native" : "diagnostic"}-${direction}-${pose}`;
        const markup = renderMossguardVectorPose({ direction, pose, team, tick }, prefix);
        const className = size === 16 ? "pose-cell" : "diagnostic-cell";
        const cell = document.createElement("div");
        cell.className = className;
        cell.dataset.direction = direction;
        cell.dataset.pose = pose;
        cell.dataset.team = team;
        cell.innerHTML = markup;
        target.append(cell);
        const art = cell.querySelector("svg");
        if (size === 16) {
          cell.setAttribute("aria-label", `${direction} facing, ${pose}, ${team} team`);
          cell.dataset.measuredBody = "true";
          const tag = document.createElement("small");
          tag.textContent = pose.replace("melee", "");
          cell.append(tag);
        } else {
          cell.setAttribute("aria-label", `Enlarged ${direction} ${pose} pose`);
        }
        const geometry = art.querySelector("[data-mossguard-body]").getBBox();
        const actualScale = art.getBoundingClientRect().height / 64;
        const bounds = { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
        const safe = MOSS_GUARD_VECTOR_GEOMETRY.safeBounds;
        const insideSafeBounds = bounds.x >= safe.x && bounds.y >= safe.y &&
          bounds.x + bounds.width <= safe.x + safe.width &&
          bounds.y + bounds.height <= safe.y + safe.height;
        if (!insideSafeBounds || bounds.y !== 6 || bounds.height !== 52) {
          throw new Error(`${direction}/${pose} rendered outside declared safe bounds: ${JSON.stringify(bounds)}`);
        }
        art.dataset.measuredBodyBounds = `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`;
        output.push({
          direction, pose, team, tick,
          bounds,
          bodyHeightCssPx: bounds.height * actualScale,
          soleAnchor: { x: 32, y: 58 },
          safeBounds: safe,
          svgSizeCssPx: art.getBoundingClientRect().height,
        });
      }
    }
    return output;
  }

  const originalMetrics = mountOriginals();
  const poseGrid = document.querySelector("[data-pose-grid]");
  const diagnosticGrid = document.querySelector("[data-diagnostic-grid]");
  poseGrid.insertAdjacentHTML("beforeend", '<div class="pose-heading">Facing</div>');
  for (const pose of poses) poseGrid.insertAdjacentHTML("beforeend", `<div class="pose-heading">${pose}</div>`);
  diagnosticGrid.insertAdjacentHTML("beforeend", '<div class="pose-heading">Facing</div>');
  for (const pose of poses) diagnosticGrid.insertAdjacentHTML("beforeend", `<div class="pose-heading">${pose}</div>`);
  const nativeMetrics = mountRig(poseGrid, 16);
  mountRig(diagnosticGrid, 96);
  body.dataset.view = requestedView;
  const maxHeight = Math.max(...nativeMetrics.map(({ bodyHeightCssPx }) => bodyHeightCssPx));
  const minHeight = Math.min(...nativeMetrics.map(({ bodyHeightCssPx }) => bodyHeightCssPx));
  document.querySelector("[data-rig-measure]").textContent =
    `Rendered body geometry: ${minHeight.toFixed(2)}–${maxHeight.toFixed(2)} CSS px · ${nativeMetrics.length} poses`;
  document.documentElement.dataset.baselineMetrics = JSON.stringify(originalMetrics);
  document.documentElement.dataset.rigMetrics = JSON.stringify(nativeMetrics);
}
