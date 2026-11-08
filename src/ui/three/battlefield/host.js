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

export function createBattlefieldHost({ document, window }) {
  let view = null;
  let shell = null;
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

  const markShell = (renderer) => {
    if (shell !== null) shell.dataset.renderer = renderer;
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
