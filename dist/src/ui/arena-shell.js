export const ARENA_SHELL_VIEWPORT = Object.freeze({
  width: 720,
  height: 1280,
});

export const ARENA_SHELL_PLAYFIELD = Object.freeze({
  left: 90,
  top: 108,
  width: 540,
  height: 960,
  columns: 18,
  rows: 32,
  tileWidth: 30,
  tileHeight: 30,
});

export const ARENA_SHELL_PROVENANCE = Object.freeze({
  kind: "original-authored-primitives",
  externalAssets: Object.freeze([]),
  calibration: "uncalibrated-no-licensed-reference-still",
});

const SHELL_MARKUP = `<main class="battle-shell" data-ui="arena-shell" aria-label="Empty card battle arena">
  <header class="match-rail match-rail--top" data-ui="opponent-hud">
    <span class="player-mark player-mark--ember" aria-hidden="true"></span>
    <span class="crown-track" aria-label="Opponent score"><i></i><i></i><i></i></span>
  </header>
  <section class="arena" data-ui="arena" aria-label="Arena">
    <div class="arena-half arena-half--north" aria-hidden="true"></div>
    <div class="arena-half arena-half--south" aria-hidden="true"></div>
    <div class="lane lane--west" data-lane="west" aria-hidden="true"></div>
    <div class="lane lane--east" data-lane="east" aria-hidden="true"></div>
    <div class="river" data-ui="river" aria-hidden="true"></div>
    <div class="bridge bridge--west" data-ui="bridge" data-lane="west" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="bridge bridge--east" data-ui="bridge" data-lane="east" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="tower-pad tower-pad--north-central" data-ui="tower-pad" data-side="north" data-role="central" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--north-west" data-ui="tower-pad" data-side="north" data-role="lane" data-lane="west" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--north-east" data-ui="tower-pad" data-side="north" data-role="lane" data-lane="east" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--south-central" data-ui="tower-pad" data-side="south" data-role="central" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--south-west" data-ui="tower-pad" data-side="south" data-role="lane" data-lane="west" aria-hidden="true"><i></i></div>
    <div class="tower-pad tower-pad--south-east" data-ui="tower-pad" data-side="south" data-role="lane" data-lane="east" aria-hidden="true"><i></i></div>
  </section>
  <aside class="timer" data-ui="timer" aria-label="Time remaining">3:00</aside>
  <footer class="match-rail match-rail--bottom" data-ui="player-hud">
    <span class="player-mark player-mark--aqua" aria-hidden="true"></span>
    <span class="crown-track" aria-label="Player score"><i></i><i></i><i></i></span>
  </footer>
  <section class="hand-tray" data-ui="hand-tray" aria-label="Card hand">
    <div class="next-card" data-ui="next-card" aria-label="Next card"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 1"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 2"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 3"></div>
    <div class="card-slot" data-ui="card-slot" aria-label="Card slot 4"></div>
  </section>
  <section class="elixir-rail" data-ui="elixir-rail" aria-label="Resource meter">
    <div class="elixir-fill" aria-hidden="true"></div>
    <div class="elixir-ticks" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
    <output aria-label="Resource amount">5</output>
  </section>
</main>`;

export function getArenaShellMarkup() {
  return SHELL_MARKUP;
}

export function mountArenaShell(target) {
  if (
    target === null ||
    typeof target !== "object" ||
    typeof target.replaceChildren !== "function" ||
    target.ownerDocument === null ||
    typeof target.ownerDocument !== "object" ||
    typeof target.ownerDocument.createElement !== "function"
  ) {
    throw new TypeError("arena shell target must be a DOM element");
  }

  const template = target.ownerDocument.createElement("template");
  template.innerHTML = SHELL_MARKUP;
  target.replaceChildren(template.content.cloneNode(true));
  return target.firstElementChild;
}
