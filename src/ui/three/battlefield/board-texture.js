import { seededRandom } from "./geometry-utils.js";

// Painted playfield mat: grass with soft patches and a faint tile checker,
// worn earth lanes, lush banks along the river. Drawn once into a canvas.
export const BOARD_TEXTURE_TILE = 48;

const LANES = [3.5, 14.5];

function lanePoints(lane) {
  const points = [];
  for (let ty = 1.2; ty <= 30.8; ty += 0.5) {
    const river = Math.abs(ty - 16) < 1.6 ? 0 : 1;
    points.push([lane + Math.sin(ty * 0.55 + lane) * 0.22 * river, ty]);
  }
  return points;
}

export function paintBoardTexture(document) {
  const tile = BOARD_TEXTURE_TILE;
  const width = 18 * tile;
  const height = 32 * tile;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  const random = seededRandom(1_107);
  const px = (tx) => tx * tile;
  const py = (ty) => (32 - ty) * tile;

  context.fillStyle = "#77ab4c";
  context.fillRect(0, 0, width, height);

  // Soft meadow patches.
  for (let index = 0; index < 170; index += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = tile * (0.8 + random() * 2.6);
    const light = random() > 0.5;
    const gradient = context.createRadialGradient(x, y, 0, x, y, radius);
    gradient.addColorStop(0, light ? "rgba(178, 214, 104, 0.32)" : "rgba(52, 110, 50, 0.28)");
    gradient.addColorStop(1, light ? "rgba(178, 214, 104, 0)" : "rgba(52, 110, 50, 0)");
    context.fillStyle = gradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }

  // Faint tile checker so placement reads at a glance.
  context.fillStyle = "rgba(255, 255, 240, 0.045)";
  for (let ty = 0; ty < 32; ty += 1) {
    for (let tx = 0; tx < 18; tx += 1) {
      if ((tx + ty) % 2 === 0) context.fillRect(px(tx), py(ty + 1), tile, tile);
    }
  }

  // Lush, darker grass toward the river banks.
  for (const [from, to] of [[13.2, 15], [18.8, 17]]) {
    const gradient = context.createLinearGradient(0, py(from), 0, py(to));
    gradient.addColorStop(0, "rgba(38, 92, 44, 0)");
    gradient.addColorStop(1, "rgba(38, 92, 44, 0.42)");
    context.fillStyle = gradient;
    context.fillRect(0, Math.min(py(from), py(to)), width, Math.abs(py(from) - py(to)));
  }

  // Grass blade flecks.
  for (let index = 0; index < 2400; index += 1) {
    const x = random() * width;
    const y = random() * height;
    context.strokeStyle = random() > 0.5 ? "rgba(196, 230, 120, 0.35)" : "rgba(40, 96, 44, 0.3)";
    context.lineWidth = 1.4;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (random() - 0.5) * 3, y - 3 - random() * 4);
    context.stroke();
  }

  // Earth lanes: dark rim, warm fill, lighter worn centre.
  const strokeLane = (points, widthTiles, style) => {
    context.strokeStyle = style;
    context.lineWidth = widthTiles * tile;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    points.forEach(([tx, ty], index) => {
      if (index === 0) context.moveTo(px(tx), py(ty));
      else context.lineTo(px(tx), py(ty));
    });
    context.stroke();
  };
  for (const lane of LANES) {
    const points = lanePoints(lane);
    strokeLane(points, 2.15, "#8d6a43");
    strokeLane(points, 1.92, "#c49a63");
    strokeLane(points.map(([tx, ty]) => [tx + 0.12, ty]), 1.05, "rgba(226, 192, 138, 0.55)");
    strokeLane(points.map(([tx, ty]) => [tx - 0.3, ty]), 0.35, "rgba(140, 104, 64, 0.35)");
    // Pebbles and worn ruts.
    for (let index = 0; index < 140; index += 1) {
      const [tx, ty] = points[Math.floor(random() * points.length)];
      const x = px(tx + (random() - 0.5) * 1.6);
      const y = py(ty + (random() - 0.5) * 0.5);
      context.fillStyle = random() > 0.4 ? "rgba(120, 90, 58, 0.55)" : "rgba(238, 214, 170, 0.6)";
      context.beginPath();
      context.ellipse(x, y, 2 + random() * 3.5, 1.5 + random() * 2.5, random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }
    // Grass tufts creeping over the lane edges.
    for (let index = 0; index < 120; index += 1) {
      const [tx, ty] = points[Math.floor(random() * points.length)];
      const side = random() > 0.5 ? 1 : -1;
      const x = px(tx + side * (0.9 + random() * 0.18));
      const y = py(ty + (random() - 0.5) * 0.5);
      context.strokeStyle = random() > 0.5 ? "#5c9440" : "#80b552";
      context.lineWidth = 2;
      for (let blade = 0; blade < 3; blade += 1) {
        context.beginPath();
        context.moveTo(x + blade * 2 - 2, y);
        context.lineTo(x + blade * 2 - 2 - side * random() * 4, y - 5 - random() * 5);
        context.stroke();
      }
    }
  }

  // Sparse clover flowers away from the lanes.
  for (let index = 0; index < 90; index += 1) {
    const tx = random() * 18;
    const ty = random() * 32;
    if (Math.abs(ty - 16) < 1.4 || LANES.some((lane) => Math.abs(tx - lane) < 1.5)) continue;
    context.fillStyle = ["#f6f0dc", "#f4cf62", "#f39ab0"][index % 3];
    for (let petal = 0; petal < 4; petal += 1) {
      const angle = petal * Math.PI / 2;
      context.beginPath();
      context.arc(px(tx) + Math.cos(angle) * 2.2, py(ty) + Math.sin(angle) * 2.2, 1.8, 0, Math.PI * 2);
      context.fill();
    }
  }

  // Board rim shading just inside the curb.
  const rim = context.createLinearGradient(0, 0, tile * 0.6, 0);
  rim.addColorStop(0, "rgba(30, 60, 30, 0.35)");
  rim.addColorStop(1, "rgba(30, 60, 30, 0)");
  context.fillStyle = rim;
  context.fillRect(0, 0, tile * 0.6, height);
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.fillRect(0, 0, tile * 0.6, height);
  context.restore();
  return canvas;
}
