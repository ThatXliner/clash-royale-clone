import { getCardPortrait, getCardPortraitIds } from "./card-portrait-art.js";

// Frame-space geometry. The canvas sits at (56, 1060) inside the 720×1280
// battle frame, inside the 56px side bands that a phone may crop away.
export const HUD_PAINTER_GEOMETRY = Object.freeze({
  canvas: Object.freeze({ height: 220, left: 56, top: 1060, width: 608 }),
  card: Object.freeze({ height: 152, width: 144, y: 12 }),
  cardX: Object.freeze([4, 156, 308, 460]),
  lift: 8,
  next: Object.freeze({ height: 44, width: 244, x: 4, y: 170 }),
});

const CANVAS_WIDTH = HUD_PAINTER_GEOMETRY.canvas.width;
const CANVAS_HEIGHT = HUD_PAINTER_GEOMETRY.canvas.height;
const CARD_WIDTH = HUD_PAINTER_GEOMETRY.card.width;
const CARD_HEIGHT = HUD_PAINTER_GEOMETRY.card.height;
const CARD_X = HUD_PAINTER_GEOMETRY.cardX;
const CARD_Y = HUD_PAINTER_GEOMETRY.card.y;
const LIFT = HUD_PAINTER_GEOMETRY.lift;
const NEXT = HUD_PAINTER_GEOMETRY.next;
const PORTRAIT_HEIGHT = 100;
const CHAMFER = 9;
const PAINTER_REVISION = "hud-card-painter-2";
const NAME_FONT = '700 22px "Barlow Condensed", sans-serif';
const LABEL_FONT = '700 15px "Barlow Condensed", sans-serif';

const INK = "#0b1311";
const CREAM = "#f4ebd6";
const BRASS = "#e9a83a";
const PLATE = "#15211d";

/** Low-poly card silhouette: a rectangle with cut (faceted) corners. */
function facetPath(context, x, y, width, height, cut) {
  const c = Math.min(cut, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + c, y);
  context.lineTo(x + width - c, y);
  context.lineTo(x + width, y + c);
  context.lineTo(x + width, y + height - c);
  context.lineTo(x + width - c, y + height);
  context.lineTo(x + c, y + height);
  context.lineTo(x, y + height - c);
  context.lineTo(x, y + c);
  context.closePath();
}

function hexPath(context, cx, cy, width, height) {
  const w = width / 2;
  const h = height / 2;
  context.beginPath();
  context.moveTo(cx, cy - h);
  context.lineTo(cx + w, cy - h / 2);
  context.lineTo(cx + w, cy + h / 2);
  context.lineTo(cx, cy + h);
  context.lineTo(cx - w, cy + h / 2);
  context.lineTo(cx - w, cy - h / 2);
  context.closePath();
}

function clippedImage(context, image, source, x, y, width, height) {
  const sourceWidth = source.width;
  const sourceHeight = source.height;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = width / height;
  let sx = source.x;
  let sy = source.y;
  let sw = sourceWidth;
  let sh = sourceHeight;
  if (sourceRatio > targetRatio) {
    sw = sourceHeight * targetRatio;
    sx += (sourceWidth - sw) / 2;
  } else if (sourceRatio < targetRatio) {
    sh = sourceWidth / targetRatio;
    // Portraits put faces in the upper half; bias the crop upward.
    sy += (sourceHeight - sh) * 0.3;
  }
  context.drawImage(image, sx, sy, sw, sh, x, y, width, height);
}

function imageSource(image, cell) {
  if (cell === null) {
    return { height: image.naturalHeight, width: image.naturalWidth, x: 0, y: 0 };
  }
  const width = image.naturalWidth / 4;
  const height = image.naturalHeight / 2;
  return {
    height,
    width,
    x: (cell % 4) * width,
    y: Math.floor(cell / 4) * height,
  };
}

/** Whole-word lines only: a name never breaks inside a word. */
function cardNameLines(context, name, maxWidth) {
  const words = name.split(/\s+/u);
  const lines = [];
  let line = "";
  for (const word of words) {
    const candidate = line.length === 0 ? word : `${line} ${word}`;
    if (line.length > 0 && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line.length > 0) lines.push(line);
  if (lines.length <= 2) return lines;
  return [lines[0], lines.slice(1).join(" ")];
}

/** Faceted elixir gem with its cost. */
function drawCost(context, cx, cy, width, height, cost, state, fontSize) {
  context.save();
  if (state !== "ended") {
    context.shadowColor = "#05090899";
    context.shadowBlur = 2;
    context.shadowOffsetY = 2;
  }
  hexPath(context, cx, cy, width + 4, height + 4);
  context.fillStyle = state === "ended" ? "#2a2f33" : state === "insufficient" ? "#c27ad6" : BRASS;
  context.fill();
  context.shadowColor = "transparent";
  hexPath(context, cx, cy, width, height);
  if (state === "normal") {
    const glow = context.createLinearGradient(cx - width / 2, cy - height / 2, cx + width / 2, cy + height / 2);
    glow.addColorStop(0, "#f3a6f6");
    glow.addColorStop(0.45, "#b549d0");
    glow.addColorStop(1, "#5c1f7e");
    context.fillStyle = glow;
  } else {
    context.fillStyle = state === "ended" ? "#4b5257" : "#1d1424";
  }
  context.fill();
  if (state === "normal") {
    // Upper-left facet catches the light like the diorama's low-poly faces.
    context.beginPath();
    context.moveTo(cx, cy - height / 2);
    context.lineTo(cx - width / 2, cy - height / 4);
    context.lineTo(cx - width / 2, cy + height / 6);
    context.lineTo(cx, cy);
    context.closePath();
    context.fillStyle = "#ffffff38";
    context.fill();
  }
  context.font = `700 ${fontSize}px "Barlow Condensed", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, fontSize / 7);
  context.strokeStyle = state === "ended" ? "#2a2f33" : state === "insufficient" ? "#0b0710" : "#3a0f4c";
  context.strokeText(String(cost), cx, cy + 1);
  context.fillStyle = state === "ended" ? "#e6e1d3" : state === "insufficient" ? "#f0c2f7" : "#ffffff";
  context.fillText(String(cost), cx, cy + 1);
  context.restore();
}

function drawPortrait(context, card, assets, x, y, width, height, filter) {
  const portrait = getCardPortrait(card.id);
  const image = assets.get(portrait.src);
  context.filter = filter;
  clippedImage(context, image, imageSource(image, portrait.cell), x, y, width, height);
  context.filter = "none";
}

function drawHandCard(context, card, x, phase, amount, assets) {
  const ended = phase === "ended";
  const insufficient = !ended && card.insufficient;
  const selected = !ended && card.selected;
  const state = ended ? "ended" : insufficient ? "insufficient" : "normal";
  const y = CARD_Y - (selected ? LIFT : 0);

  context.save();
  if (selected) {
    context.save();
    context.shadowColor = "#e9a83acc";
    context.shadowBlur = 14;
    facetPath(context, x - 3, y - 3, CARD_WIDTH + 6, CARD_HEIGHT + 6, CHAMFER + 2);
    context.fillStyle = BRASS;
    context.fill();
    context.restore();
  } else if (!ended) {
    // Hard vertical drop, inset 2px so the card's sides stay clean for the
    // selection halo.
    facetPath(context, x + 2, y + 4, CARD_WIDTH - 4, CARD_HEIGHT, CHAMFER);
    context.fillStyle = "#000000b3";
    context.fill();
  }
  facetPath(context, x, y, CARD_WIDTH, CARD_HEIGHT, CHAMFER);
  context.fillStyle = ended ? "#3a4044" : INK;
  context.fill();

  // Portrait window.
  context.save();
  facetPath(context, x + 3, y + 3, CARD_WIDTH - 6, CARD_HEIGHT - 6, CHAMFER - 2);
  context.clip();
  drawPortrait(context, card, assets, x + 3, y + 3, CARD_WIDTH - 6, PORTRAIT_HEIGHT,
    ended ? "grayscale(1) brightness(.55)"
      : insufficient ? "grayscale(.65) brightness(.72)" : "saturate(1.08)");
  if (insufficient) {
    // Charge veil: the uncharged share of the cost stays dark and recedes as
    // whole elixir arrives, so "how close am I" reads at a glance.
    const share = Math.max(0, Math.min(1, amount / card.cost));
    const veil = Math.round(PORTRAIT_HEIGHT * (1 - share));
    context.fillStyle = "#070b0a8c";
    context.fillRect(x + 3, y + 3, CARD_WIDTH - 6, veil);
    if (share > 0) {
      context.fillStyle = "#d58ae8";
      context.fillRect(x + 3, y + 3 + veil - 1, CARD_WIDTH - 6, 2);
    }
  } else if (!ended) {
    // Soft top-left light facet.
    context.beginPath();
    context.moveTo(x + 3, y + 3);
    context.lineTo(x + 70, y + 3);
    context.lineTo(x + 3, y + 62);
    context.closePath();
    context.fillStyle = "#ffffff14";
    context.fill();
  }
  // Name plate.
  const plateY = y + 3 + PORTRAIT_HEIGHT + 1;
  context.fillStyle = ended ? "#565d61" : selected ? BRASS : PLATE;
  context.fillRect(x + 3, plateY, CARD_WIDTH - 6, CARD_HEIGHT - 6 - PORTRAIT_HEIGHT - 1);
  context.fillStyle = selected ? "#fff3cf66" : "#e9a83a40";
  context.fillRect(x + 3, plateY, CARD_WIDTH - 6, 1);
  context.restore();

  // Rim.
  context.lineWidth = selected ? 2.5 : 1.5;
  context.strokeStyle = ended ? "#6b7276" : selected ? "#fff0c4"
    : insufficient ? "#4a5450" : "#8a9c90";
  facetPath(context, x + 1.25, y + 1.25, CARD_WIDTH - 2.5, CARD_HEIGHT - 2.5, CHAMFER - 1);
  context.stroke();

  // Name.
  context.font = NAME_FONT;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = ended ? "#ece6d6" : selected ? "#191d22"
    : insufficient ? "#c9c3b4" : CREAM;
  const lines = cardNameLines(context, card.displayName, CARD_WIDTH - 12);
  const lineHeight = 19;
  const plateMid = plateY + (CARD_HEIGHT - 6 - PORTRAIT_HEIGHT - 1) / 2;
  const startY = plateMid + 1 - ((lines.length - 1) * lineHeight) / 2;
  for (let index = 0; index < lines.length; index += 1) {
    context.fillText(lines[index], x + CARD_WIDTH / 2, startY + index * lineHeight,
      CARD_WIDTH - 10);
  }
  drawCost(context, x + 24, y + 26, 34, 38, card.cost, state, 27);
  context.restore();
}

function drawNextCard(context, card, phase, assets) {
  const { x, y, width, height } = NEXT;
  const ended = phase === "ended";
  context.save();
  facetPath(context, x, y, width, height, 7);
  context.fillStyle = ended ? "#30363a" : "#101915";
  context.fill();
  context.lineWidth = 1.5;
  context.strokeStyle = ended ? "#5d6468" : "#4f6158";
  facetPath(context, x + 0.75, y + 0.75, width - 1.5, height - 1.5, 6.5);
  context.stroke();
  context.save();
  facetPath(context, x + 3, y + 3, height - 6, height - 6, 5);
  context.clip();
  drawPortrait(context, card, assets, x + 3, y + 3, height - 6, height - 6,
    ended ? "grayscale(1) brightness(.55)" : "saturate(.85) brightness(.92)");
  context.restore();
  const textX = x + height + 3;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.font = LABEL_FONT;
  context.letterSpacing = "2px";
  context.fillStyle = ended ? "#c9c3b4" : BRASS;
  context.fillText("NEXT", textX, y + 15);
  context.letterSpacing = "0px";
  context.font = NAME_FONT;
  context.fillStyle = ended ? "#ece6d6" : CREAM;
  context.fillText(card.displayName, textX, y + 37, width - height - 3 - 34);
  drawCost(context, x + width - 19, y + height / 2, 26, 30, card.cost,
    ended ? "ended" : "normal", 22);
  context.restore();
}

function drawCard(context, card, kind, x, phase, amount, assets) {
  if (kind === "next") drawNextCard(context, card, phase, assets);
  else drawHandCard(context, card, x, phase, amount, assets);
}

function readPresentation(document) {
  const frameScale = Number(document.documentElement?.dataset?.combatFrameScale ?? 1);
  const ratio = Number(document.defaultView?.devicePixelRatio ?? 1);
  if (!Number.isFinite(frameScale) || frameScale <= 0 || frameScale > 8 ||
      !Number.isFinite(ratio) || ratio <= 0 || ratio > 8) {
    throw new TypeError("HUD painter presentation scale is invalid");
  }
  const scale = frameScale * ratio;
  return {
    height: Math.max(1, Math.round(CANVAS_HEIGHT * scale)),
    width: Math.max(1, Math.round(CANVAS_WIDTH * scale)),
  };
}

function renderKey(view, size) {
  const ended = view.phase === "ended";
  return JSON.stringify({
    assets: PAINTER_REVISION,
    height: size.height,
    hand: view.hand.map(({ cost, displayName, id, insufficient, selected }) =>
      [id, displayName, cost, ended ? false : selected, ended ? false : insufficient,
        // The charge veil depends on whole elixir only while a card is short.
        !ended && insufficient ? view.elixir.amount : null]),
    next: [view.next.id, view.next.displayName, view.next.cost],
    phase: view.phase,
    width: size.width,
  });
}

function makePlan(view, document) {
  const size = readPresentation(document);
  return { key: renderKey(view, size), size };
}

function drawFrame(context, view, assets) {
  context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  drawCard(context, view.next, "next", NEXT.x, view.phase, view.elixir.amount, assets);
  // Paint the selected card last so its lifted halo overlaps its neighbours.
  const order = view.hand.map((card, index) => index)
    .sort((a, b) => Number(view.hand[a].selected) - Number(view.hand[b].selected));
  for (const index of order) {
    drawCard(context, view.hand[index], "hand", CARD_X[index], view.phase,
      view.elixir.amount, assets);
  }
}

function createPainter(document, assets) {
  const scratch = document.createElement("canvas");
  const scratchContext = scratch.getContext("2d", { willReadFrequently: true });
  if (!scratchContext) throw new TypeError("HUD painter requires a Canvas 2D context");
  scratchContext.imageSmoothingEnabled = true;
  scratchContext.imageSmoothingQuality = "high";
  let committedKey = null;
  let disposed = false;

  return Object.freeze({
    dispose() {
      if (disposed) return false;
      disposed = true;
      scratch.width = 0;
      scratch.height = 0;
      committedKey = null;
      return true;
    },
    stage(view, canvas) {
      if (disposed) throw new RangeError("HUD painter is disposed");
      const { key, size } = makePlan(view, document);
      if (canvas?.ownerDocument !== document || canvas?.dataset?.ui !== "hud-card-paint") {
        throw new TypeError("HUD painter Canvas target is invalid");
      }
      const unchanged = key === committedKey && canvas.width === size.width &&
        canvas.height === size.height;
      if (unchanged) return Object.freeze({
        commit() { return false; },
        finalize() {},
        rollback() {},
      });

      scratch.width = size.width;
      scratch.height = size.height;
      const scaleX = size.width / CANVAS_WIDTH;
      const scaleY = size.height / CANVAS_HEIGHT;
      scratchContext.setTransform(scaleX, 0, 0, scaleY, 0, 0);
      drawFrame(scratchContext, view, assets);
      scratchContext.setTransform(1, 0, 0, 1, 0, 0);
      const pixels = scratchContext.getImageData(0, 0, size.width, size.height);
      let oldPixels = null;
      let oldKey = committedKey;
      let oldWidth = canvas.width;
      let oldHeight = canvas.height;
      let attempted = false;
      let restored = false;
      return Object.freeze({
        commit() {
          if (attempted) throw new Error("HUD painter transaction already committed");
          attempted = true;
          oldWidth = canvas.width;
          oldHeight = canvas.height;
          oldPixels = oldWidth > 0 && oldHeight > 0
            ? canvas.getContext("2d", { willReadFrequently: true })
              ?.getImageData(0, 0, oldWidth, oldHeight) ?? null
            : null;
          canvas.width = size.width;
          canvas.height = size.height;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (!context) throw new TypeError("HUD painter live Canvas context is unavailable");
          if (canvas.width !== size.width || canvas.height !== size.height) {
            throw new Error("HUD painter live Canvas backing size did not match its staged plan");
          }
          context.putImageData(pixels, 0, 0);
          committedKey = key;
          return true;
        },
        finalize() {
          oldPixels = null;
          oldKey = null;
        },
        rollback() {
          if (!attempted || restored) return false;
          canvas.width = oldWidth;
          canvas.height = oldHeight;
          if (oldPixels !== null) {
            const context = canvas.getContext("2d", { willReadFrequently: true });
            if (!context) throw new TypeError("HUD painter rollback Canvas context is unavailable");
            context.putImageData(oldPixels, 0, 0);
          }
          committedKey = oldKey;
          restored = true;
          return true;
        },
      });
    },
  });
}

export async function prepareHudCardPainter(document) {
  if (!document || typeof document.createElement !== "function" ||
      !document.fonts || typeof document.fonts.load !== "function") {
    throw new TypeError("HUD painter preparation requires a browser Document");
  }
  const assets = new Map();
  const sources = new Set(getCardPortraitIds().map((id) => getCardPortrait(id).src));
  await Promise.all([...sources].map(async (src) => {
    const image = document.createElement("img");
    image.decoding = "sync";
    image.loading = "eager";
    image.src = src;
    if (typeof image.decode !== "function") {
      throw new TypeError("HUD painter requires image decoding support");
    }
    await image.decode();
    if (image.naturalWidth < 1 || image.naturalHeight < 1) {
      throw new TypeError("HUD painter image decoded without pixels");
    }
    assets.set(src, image);
  }));
  await Promise.all([
    document.fonts.load('700 22px "Barlow Condensed"'),
    document.fonts.load('900 16px "Barlow Condensed"'),
    document.fonts.ready,
  ]);
  if (!document.fonts.check('700 22px "Barlow Condensed"') ||
      !document.fonts.check('900 16px "Barlow Condensed"')) {
    throw new TypeError("HUD painter font did not become ready");
  }
  const factory = Object.freeze({
    create() {
      return createPainter(document, assets);
    },
  });
  return factory;
}
