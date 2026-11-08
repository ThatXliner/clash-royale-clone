// Presentation-only host for the three.js battlefield. It observes committed
// UI frames and never touches the session, input or simulation. The scene
// module (and three itself) loads lazily; until it is ready, or whenever
// WebGL is unavailable or lost, the DOM arena renders exactly as before.

export const BATTLEFIELD_RENDERERS = Object.freeze(["dom", "three"]);

export function createBattlefieldHost({ document, window }) {
  let view = null;
  let shell = null;
  let latest = null;
  let state = "loading";

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
  };
  const activate = () => {
    if (view === null || shell === null) return;
    view.mount(shell);
    markShell("three");
    if (latest !== null) view.update(latest);
  };

  import("./scene.js").then(({ createBattlefieldView }) => {
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
    view = created;
    state = "three";
    try { activate(); } catch { fallBack(); }
  }, () => fallBack());

  return Object.freeze({
    get state() { return state; },
    attach(nextShell) {
      if (state === "disposed") return;
      shell = nextShell;
      latest = null;
      if (state === "three") {
        try { activate(); } catch { fallBack(); }
      } else {
        markShell(state === "dom" ? "dom" : "loading");
      }
    },
    observe(frame) {
      latest = frame.combat;
      if (view === null) return;
      try { view.update(latest); } catch { fallBack(); }
    },
    dispose() {
      if (state === "disposed") return;
      state = "disposed";
      const current = view;
      view = null;
      shell = null;
      latest = null;
      current?.dispose();
    },
  });
}
