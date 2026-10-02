<p align="center">
  <img src="docs/brand/logo.svg" width="96" alt="Moss &amp; Ember leaf-and-flame mark">
</p>

<h1 align="center">Moss &amp; Ember</h1>

<p align="center">An original real-time card battler with deterministic matches.</p>

<p align="center">
  <img src="docs/brand/banner.svg" alt="Moss &amp; Ember — an original card battler" width="100%">
</p>

Build an eight-card match deck from the nine cards in the editable collection,
read each card's details, then take it into a live match against a seeded
opponent. Choose from the four-card hand, spend elixir, and place cards in
legal areas of the arena. Units move and fight automatically; win by taking
tower crowns before the match ends.

<p align="center">
  <img src="docs/brand/gameplay.png" alt="Moss &amp; Ember live match" width="320">
</p>

The browser game and the simulation API use the same fixed-tick `GameSession`.
The same seed and accepted action sequence reproduce the same session, which
makes matches inspectable and checkpoints restorable.

Moss &amp; Ember is an independent project inspired by the pre-March-2023
Clash Royale ruleset; it is not affiliated with Supercell. It uses original
card names, art, and sound. The comparison material in `reference/` is kept
separate and is never bundled with the game. This project does not claim full
or mechanically indistinguishable parity.

## Quick start

Requirements: Node.js 22 or later.

```sh
git clone https://github.com/ThatXliner/clash-royale-clone.git
cd clash-royale-clone
npm ci
npm run preview:release
```

Open [http://127.0.0.1:4173/public/index.html](http://127.0.0.1:4173/public/index.html).
`preview:release` builds the release before serving it. To preview the landing
page and game together, run `npm run build:pages` followed by
`npm run preview:pages`. See [publishing](docs/publishing.md) for the manual
GitHub Pages setup.

## Reinforcement-learning example

The browser-compatible RL wrapper controls the south side while the seeded
opponent controls the north side. Both use the same configured deck; this is
single-player control, not self-play or a learned opponent. From the repository
root, this one-step example advances a seeded match by 30 ticks with action `0`
(wait):

```sh
node --input-type=module <<'NODE'
import { createRLEnvironment } from "./src/rl/environment.js";
const env = createRLEnvironment({ seed: 42, strideTicks: 30, horizonTicks: 900 });
const initial = env.reset();
const { observation, reward, terminated, truncated } = env.step(0);
console.log({
  initialTick: initial.tick,
  tick: observation.tick,
  reward,
  terminated,
  truncated,
});
NODE
```

The example prints an initial tick of `0`, then tick `30`, reward `0`, and
`false` for both done flags. See the [RL environment guide](docs/rl-api.md) for
actions, observations, masks, and checkpoint restore.

## Checks

`npm test` runs the default test suite. For a focused runner, use
`npm run test:portable -- node tests/<runner>.js <selector>`. `test:portable`
is a runner wrapper, not a browser-only test suite. Browser runners use
Playwright; after `npm ci`, install its Chromium browser with
`npx playwright install chromium` if needed.

The browser endurance run is long-running. Run
`npm run test:game-browser-endurance` when you need its 18,000-tick browser
evidence, not as a quick smoke test.

## Current verification status

This is an active prototype, not a parity release. The full 18,000-tick browser
run is under review; a previous run recorded a 76 ms restart task against the
50 ms target. A building-art restore comparison also remains two pixels off.
Some card and arena mechanics are estimates or explicit `QUESTION`s in their
source and provenance records.

## Contributing and rights

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance,
[NOTICE](NOTICE) for asset and comparison-corpus provenance, and
[docs/brand.md](docs/brand.md) for the original Moss &amp; Ember identity.
Project-authored code and original brand assets are licensed under
[GNU AGPL-3.0-only](LICENSE). Some authored audio and shipped icons have their
own CC0-1.0 notices; see `NOTICE`.
