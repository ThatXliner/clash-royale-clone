// Presentation-only host for the three.js battlefield. It observes committed
// UI frames and never touches the session, input or simulation. The scene
// module (and three itself) loads lazily; until it is ready, or whenever
// WebGL is unavailable or lost, the DOM arena renders exactly as before.
//
// `ready` settles once the scene has compiled its shaders, uploaded its
// textures and drawn one off-screen frame (or once the DOM fallback is
// final). The shipped browser holds the match clock until then, so the warm
// up never lands on a running match; the simulation itself never waits on or
// reads anything from here.

export const BATTLEFIELD_RENDERERS = Object.freeze(["dom", "three"]);

// A warm-up that has not finished by then releases the match clock anyway.
const READY_TIMEOUT_MS = 6000;

// While the 3D board warms up, the shell shows a neutral board-coloured panel
// instead of the flat DOM arena it is about to replace, so a cold first
// battle never flashes the old board. If WebGL is unavailable the panel goes
// and the DOM arena shows as before.
const LOADING_STYLE = `.battlefield-loading{position:absolute;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:radial-gradient(ellipse 78% 62% at 50% 46%,#2b4a31 0 52%,#1d3524 84%,#122218 100%);display:grid;place-items:center}
.battlefield-loading__mark{display:grid;justify-items:center;gap:18px;color:#d9e6c8;font:800 24px/1.2 ui-rounded,"Arial Rounded MT Bold",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;opacity:0;animation:battlefield-loading-in .3s ease-out .15s forwards}
.battlefield-loading__ring{width:54px;height:54px;border-radius:50%;border:6px solid #d9e6c833;border-top-color:#e9a83a;animation:battlefield-loading-spin .9s linear infinite}
@keyframes battlefield-loading-spin{to{transform:rotate(1turn)}}
@keyframes battlefield-loading-in{to{opacity:.85}}
@media (prefers-reduced-motion:reduce){.battlefield-loading__ring{animation:none}.battlefield-loading__mark{animation:none;opacity:.85}}
.battle-shell[data-renderer="loading"]{background:#1d3524}
.battle-shell[data-renderer="loading"] .arena{border-color:transparent!important;background:none!important;box-shadow:none!important}
.battle-shell[data-renderer="loading"] .arena::before,.battle-shell[data-renderer="loading"] .arena::after{display:none!important}
.battle-shell[data-renderer="loading"] .arena>.arena-half,.battle-shell[data-renderer="loading"] .arena>.lane,.battle-shell[data-renderer="loading"] .arena>.river,.battle-shell[data-renderer="loading"] .arena>.bridge,.battle-shell[data-renderer="loading"] .arena>.tower-pad,.battle-shell[data-renderer="loading"] .combat-marker{visibility:hidden!important}`;

function createLoadingPanel(document) {
  if (typeof document.createElement !== "function") return null;
  const panel = document.createElement("div");
  panel.className = "battlefield-loading";
  panel.dataset.ui = "battlefield-loading";
  panel.setAttribute("aria-hidden", "true");
  const style = document.createElement("style");
  style.textContent = LOADING_STYLE;
  const mark = document.createElement("div");
  mark.className = "battlefield-loading__mark";
  const ring = document.createElement("span");
  ring.className = "battlefield-loading__ring";
  const label = document.createElement("span");
  label.textContent = "Preparing the battlefield";
  mark.append(ring, label);
  panel.append(style, mark);
  return panel;
}

export function createBattlefieldHost({ document, window }) {
  let view = null;
  let shell = null;
  let loadingPanel = null;
  let latest = null;
  let latestHints = null;
  let state = "loading";
  let settle = null;
  const ready = new Promise((resolve) => { settle = resolve; });
  let settled = false;
  const markReady = () => {
    if (settled) return;
    settled = true;
    settle(state);
  };
  const timeout = window.setTimeout?.(markReady, READY_TIMEOUT_MS);

  const hideLoading = () => {
    try { loadingPanel?.remove(); } catch {}
    loadingPanel = null;
  };
  const showLoading = () => {
    hideLoading();
    if (shell === null || typeof shell.insertBefore !== "function") return;
    try {
      loadingPanel = createLoadingPanel(document);
      if (loadingPanel !== null) shell.insertBefore(loadingPanel, shell.firstChild);
    } catch {
      loadingPanel = null;
    }
  };
  const markShell = (renderer) => {
    if (shell !== null) shell.dataset.renderer = renderer;
    if (renderer === "loading") showLoading();
    else hideLoading();
  };
  const fallBack = () => {
    if (state === "disposed") return;
    state = "dom";
    const failed = view;
    view = null;
    markShell("dom");
    try { failed?.dispose(); } catch {}
    markReady();
  };
  const activate = () => {
    if (view === null || shell === null) return;
    view.mount(shell);
    markShell("three");
    if (latest !== null) view.update(latest, latestHints);
  };

  import("./scene.js").then(async ({ createBattlefieldView }) => {
    if (state !== "loading") return;
    let created = null;
    try {
      created = createBattlefieldView({ document, window, onFailure: fallBack });
    } catch {
      created = null;
    }
    if (created === null) {
      fallBack();
      return;
    }
    try {
      await created.warm(latest);
    } catch {}
    if (state !== "loading") {
      try { created.dispose(); } catch {}
      return;
    }
    view = created;
    state = "three";
    try { activate(); } catch { fallBack(); }
    markReady();
  }, () => fallBack());

  return Object.freeze({
    get state() { return state; },
    /** Settles (with the final renderer state) once the battlefield can draw without stalls. */
    get ready() { return ready; },
    get isReady() { return settled; },
    get view() { return view; },
    attach(nextShell) {
      if (state === "disposed") return;
      shell = nextShell;
      latest = null;
      latestHints = null;
      if (state === "three") {
        try { activate(); } catch { fallBack(); }
      } else {
        markShell(state === "dom" ? "dom" : "loading");
      }
    },
    observe(frame, hints = null) {
      latest = frame;
      latestHints = hints;
      if (view === null) return;
      try { view.update(frame, hints); } catch { fallBack(); }
    },
    dispose() {
      if (state === "disposed") return;
      state = "disposed";
      if (timeout !== undefined) window.clearTimeout?.(timeout);
      hideLoading();
      markReady();
      const current = view;
      view = null;
      shell = null;
      latest = null;
      latestHints = null;
      current?.dispose();
    },
  });
}
