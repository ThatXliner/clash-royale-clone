// Builder play-and-capture harness for R3D-003 (3D units, projectiles, effects).
// Opens the shipped app in Chromium on Metal, enters Battle, optionally swaps
// in a swarm deck and fast-forwards through the public controller, deploys
// cards through the real pointer path, screenshots at chosen moments and
// records frame timing, live unit counts and long tasks.
//
// Usage: node play.mjs --out=<prefix> [--size=390x844] [--dpr=3] [--deck=swarm]
//   [--ff=7200] [--seconds=40] [--shots=5,10,20] [--burst=0.5] [--query=renderer=dom]
//   [--reduced-motion] [--angle=metal] [--until-end]
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const flag = (name) => args.includes(`--${name}`);
const prefix = resolve(option("out", "play"));
const [width, height] = option("size", "390x844").split("x").map(Number);
const dpr = Number(option("dpr", width < 600 ? "3" : "1"));
const seconds = Number(option("seconds", "30"));
const shots = option("shots", "").split(",").filter(Boolean).map(Number);
const ff = Number(option("ff", "0"));
const deck = option("deck", "standard");
const query = option("query", "");
const angle = option("angle", "metal");
const base = option("url", "http://127.0.0.1:4391/public/index.html");
const untilEnd = flag("until-end");
mkdirSync(dirname(prefix), { recursive: true });

const DECKS = {
  swarm: ["cinderlings", "cinder-host", "duskwing-trio", "gloamwing-cluster", "coppershade-flock",
    "thornscouts", "briar-band", "sunthread-pair"],
  ranged: ["squall-orb", "kilnkeeper", "brassbolt", "reedsting", "stormkite", "buried-coil", "copperskiff", "ember-basin"],
  horde: ["cinder-host", "forgeguard", "gloamwing-cluster", "coppershade-flock", "briar-band",
    "thornscouts", "cinderlings", "duskwing-trio"],
  mixed: ["squall-orb", "kilnkeeper", "cinder-host", "duskwing-trio", "mossguard", "ironroot", "brassbolt", "thornscouts"],
};

const launchArgs = angle === "metal"
  ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
  : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"];
const browser = await chromium.launch({ args: launchArgs });
const context = await browser.newContext({
  viewport: { width, height }, deviceScaleFactor: dpr,
  reducedMotion: flag("reduced-motion") ? "reduce" : "no-preference",
});
const page = await context.newPage();
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error" || message.type() === "warning") {
    const text = message.text();
    if (!/favicon|status of 404/u.test(text)) problems.push(`${message.type()}: ${text}`);
  }
});
page.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));
await page.goto(`${base}${query ? `?${query}` : ""}`);
await page.click('[data-action="begin-battle"]');
const handle = await page.waitForSelector("iframe.battle-frame");
const frame = await handle.contentFrame();
await frame.waitForSelector('[data-ui="arena"]');
const three = !query.includes("renderer=dom");

// Long tasks and rAF intervals inside the battle frame, from the start.
await frame.evaluate(() => {
  window.__probe = { longtasks: [], intervals: [], last: null, marks: [] };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__probe.longtasks.push([entry.startTime, entry.duration]);
  }).observe({ type: "longtask", buffered: true });
  const tick = (now) => {
    if (window.__probe.last !== null) window.__probe.intervals.push([now, now - window.__probe.last]);
    window.__probe.last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const state = () => frame.evaluate(() => {
  const host = document.querySelector('[data-ui="battlefield-3d"]');
  const debug = host?.battlefieldDebug ?? null;
  return {
    renderer: document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer ?? null,
    tick: Number(document.querySelector(".game-ui-hud-frame")?.dataset.tick ?? -1),
    units: debug?.units.liveCount ?? document.querySelectorAll(".combat-marker--entity-ground,.combat-marker--entity-air").length,
    calls: debug?.renderer.info.render.calls ?? null,
    terminal: document.querySelector(".match-feedback__overlay") !== null,
    now: performance.now(),
  };
});

if (three) {
  await frame.waitForFunction(() => document.querySelector('[data-ui="arena-shell"]')?.dataset.renderer === "three",
    null, { timeout: 20000 });
}
// Interactive = the match clock is advancing.
const startTick = (await state()).tick;
await frame.waitForFunction((tick) => Number(document.querySelector(".game-ui-hud-frame")?.dataset.tick ?? -1) > tick,
  startTick, { timeout: 20000 });
const interactiveAt = await frame.evaluate(() => performance.now());

const post = (message) => page.evaluate((value) => {
  const target = document.querySelector("iframe.battle-frame");
  target.contentWindow.postMessage(value, window.location.origin);
}, message);
if (deck !== "standard" || ff > 0) {
  const frameScale = await page.evaluate(() => {
    const target = document.querySelector("iframe.battle-frame");
    return target.getBoundingClientRect().width / target.offsetWidth;
  });
  const presentation = { bodyCssPixels: width <= 600 ? 13 : 26, frameScale };
  const ids = DECKS[deck] ?? DECKS.swarm;
  const standard = ["coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings"];
  await post({ active: false, channel: "moss-and-ember-battle", deckIds: standard, presentation });
  await page.waitForTimeout(200);
  await post({ active: false, channel: "moss-and-ember-battle", deckIds: ids, presentation });
  await page.waitForTimeout(300);
  if (ff > 0) {
    await frame.evaluate(async (target) => {
      const { arenaHudController: controller } = await import("/src/ui/arena-shell-entry.js");
      controller.resume();
      controller.enterManualStepMode();
      while (controller.state.sessionTick < target && !controller.state.terminal) {
        controller.fastForwardSegment(Math.min(1200, target - controller.state.sessionTick));
      }
      controller.pause();
    }, ff);
  }
  await post({ active: true, channel: "moss-and-ember-battle", deckIds: ids, presentation });
  await page.waitForTimeout(200);
  if (ff > 0) {
    await frame.evaluate(async () => {
      const { arenaHudController: controller } = await import("/src/ui/arena-shell-entry.js");
      if (controller.state.paused) controller.resume();
      controller.start();
    });
  }
}

const arenaBox = async () => (await frame.$('[data-ui="arena"]')).boundingBox();
const deploy = async (slot, tx, ty) => {
  const slots = await frame.$$('[data-ui="card-slot"]');
  if (slots.length === 0) return;
  const slotBox = await slots[slot % slots.length].boundingBox();
  if (slotBox === null) return;
  await page.mouse.click(slotBox.x + slotBox.width / 2, slotBox.y + slotBox.height / 2).catch(() => {});
  const box = await arenaBox();
  await page.mouse.click(box.x + box.width * (tx / 18), box.y + box.height * (1 - ty / 32)).catch(() => {});
};
const spots = flag("rear")
  ? [[4.5, 4.5], [13.5, 4.5], [9, 6.5], [3, 7], [15, 7]]
  : [[3.5, 13.5], [14.5, 13.5], [4.5, 11], [13.5, 11], [9, 10], [2.5, 14], [15.5, 14]];

const started = Date.now();
const timeline = [];
let shotIndex = 0;
let deployIndex = 0;
let nextDeploy = 0;
const busyWindow = flag("busy-timings");
// --catch=projectile,area,death: freeze the match and presentation clocks the
// first time each kind of moment is on screen and capture it.
const catches = new Set(option("catch", "").split(",").filter(Boolean));
const caught = new Set();
const frozenShot = async (file) => {
  await frame.evaluate(async () => {
    const { arenaHudController: controller } = await import("/src/ui/arena-shell-entry.js");
    controller.enterManualStepMode();
    document.querySelector('[data-ui="battlefield-3d"]')?.battlefieldDebug?.freeze(true);
  });
  await page.waitForTimeout(80);
  await page.screenshot({ path: file });
  await frame.evaluate(async () => {
    const { arenaHudController: controller } = await import("/src/ui/arena-shell-entry.js");
    document.querySelector('[data-ui="battlefield-3d"]')?.battlefieldDebug?.freeze(false);
    controller.start();
  });
};
// --burst=<seconds>:<count>:<ms> takes a rapid series to catch projectiles mid-flight.
const burst = option("burst", "") === "" ? null : option("burst", "").split(":").map(Number);
let burstDone = false;
let busyStarted = false;
while (true) {
  const elapsed = (Date.now() - started) / 1000;
  if (!untilEnd && elapsed >= seconds) break;
  if (untilEnd && elapsed > 330) break;
  const current = await state();
  timeline.push({ t: Number(elapsed.toFixed(2)), ...current });
  if (current.terminal) {
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${prefix}-result.png` });
    break;
  }
  if (elapsed >= nextDeploy && !flag("no-deploy")) {
    const [tx, ty] = spots[deployIndex % spots.length];
    await deploy(deployIndex % 4, tx, ty);
    deployIndex += 1;
    nextDeploy = elapsed + Number(option("deploy-every", "1.6"));
  }
  if (busyWindow && current.units >= 40 && !busyStarted) {
    busyStarted = true;
    await frame.evaluate(() => document.querySelector('[data-ui="battlefield-3d"]')?.battlefieldDebug?.resetTimings());
  }
  if (catches.size > caught.size && three) {
    const moment = await frame.evaluate(() => {
      const debug = document.querySelector('[data-ui="battlefield-3d"]')?.battlefieldDebug;
      if (!debug) return null;
      return { ...debug.effects.counts, dying: debug.units.dyingCount };
    });
    const ready = {
      projectile: moment !== null && moment.projectiles >= 2,
      area: moment !== null && moment.decals >= 1,
      death: moment !== null && moment.dying >= 2,
    };
    for (const kind of catches) {
      if (caught.has(kind) || !ready[kind] || elapsed < Number(option("catch-after", "0"))) continue;
      caught.add(kind);
      const file = `${prefix}-catch-${kind}.png`;
      await frozenShot(file);
      process.stdout.write(`${file} ${JSON.stringify(moment)} units=${current.units}\n`);
    }
  }
  if (burst !== null && !burstDone && elapsed >= burst[0]) {
    burstDone = true;
    for (let index = 0; index < burst[1]; index += 1) {
      await page.screenshot({ path: `${prefix}-burst-${String(index).padStart(2, "0")}.png` });
      await page.waitForTimeout(burst[2]);
    }
    process.stdout.write(`burst of ${burst[1]} at ${elapsed.toFixed(1)}s units=${current.units}\n`);
  }
  if (shotIndex < shots.length && elapsed >= shots[shotIndex]) {
    const file = `${prefix}-${String(shots[shotIndex]).padStart(3, "0")}s.png`;
    await page.screenshot({ path: file });
    process.stdout.write(`${file} units=${current.units} tick=${current.tick}\n`);
    if (flag("dump")) {
      const dump = await frame.evaluate(() => {
        const debug = document.querySelector('[data-ui="battlefield-3d"]')?.battlefieldDebug;
        if (!debug) return [];
        return debug.units.group.children[0].children.map((holder) => {
          const model = holder.children[0];
          if (!model) return `${holder.name} EMPTY`;
          const mover = model.getObjectByName("mover");
          return `${holder.name} ${model.name} at ${holder.position.x.toFixed(1)},${holder.position.z.toFixed(1)} scale=${mover.scale.x.toFixed(2)} vis=${mover.visible}`;
        });
      });
      writeFileSync(`${file}.txt`, dump.join("\n"));
    }
    shotIndex += 1;
  }
  await page.waitForTimeout(catches.size > caught.size ? 15 : 100);
}

const renderCost = await frame.evaluate(() =>
  document.querySelector('[data-ui="battlefield-3d"]')?.battlefieldDebug?.timings() ?? null);
const probe = await frame.evaluate((since) => ({
  longtasks: window.__probe.longtasks.filter(([start]) => start >= since),
  allLongtasks: window.__probe.longtasks,
  intervals: window.__probe.intervals.filter(([start]) => start >= since),
}), interactiveAt);
const sixSecondTick = timeline.find((entry) => entry.t >= 6)?.tick ?? null;
const busy = [];
// Frame intervals while ≥40 units were live (match by wall time windows).
const fieldAt = (now) => {
  let best = null;
  for (const entry of timeline) if (entry.now <= now) best = entry;
  return best?.units ?? 0;
};
for (const [start, interval] of probe.intervals) {
  if (fieldAt(start) >= 40) busy.push(interval);
}
const stats = (values) => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return { n: values.length, median: Number(at(0.5).toFixed(2)), p95: Number(at(0.95).toFixed(2)), max: Number(sorted.at(-1).toFixed(2)) };
};
const summary = {
  renderer: three ? "three" : "dom",
  size: `${width}x${height}@${dpr}`,
  deck, ff,
  tickAtSixSeconds: sixSecondTick,
  maxUnits: Math.max(...timeline.map((entry) => entry.units)),
  frames: stats(probe.intervals.map(([, interval]) => interval)),
  busyFrames: stats(busy),
  battlefieldCpuPerFrame: renderCost === null ? null : stats(renderCost.render),
  battlefieldCpuPerUpdate: renderCost === null ? null : stats(renderCost.update),
  longtasksAfterInteractive: probe.longtasks.map(([start, duration]) => [Math.round(start - interactiveAt), Math.round(duration)]),
  longtasksBeforeInteractive: probe.allLongtasks.filter(([start]) => start < interactiveAt).map(([, duration]) => Math.round(duration)),
  problems,
};
writeFileSync(`${prefix}-summary.json`, `${JSON.stringify({ summary, timeline }, null, 1)}\n`);
console.log(JSON.stringify(summary, null, 1));
await browser.close();
