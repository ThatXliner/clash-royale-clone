# Development

## Requirements

Use Node.js 22.12.0 or later. Install the locked dependencies and the matching
Playwright Chromium browser:

```sh
npm ci
npx playwright install chromium
```

On Linux, install Chromium's system libraries too:

```sh
npx playwright install --with-deps chromium
```

## Run and test

`npm run preview:release` builds and serves the game at
`http://127.0.0.1:4173/public/index.html`. To preview the landing page and game
together, use `npm run preview:pages`; the landing page is `/` and the game is
`/game/`. See [Publishing](publishing.md) before building or publishing Pages.

`npm test` runs the default test entry. To run a focused test runner, use:

```sh
npm run test:portable -- node tests/<runner>.js <selector>
```

The portable wrapper also accepts npm scripts. For the long browser endurance
journey, run:

```sh
npm run test:portable -- npm run test:game-browser-endurance
```

Browser tests and production release builds use the repository's pinned
Playwright and Chromium. A successful focused test says nothing about tests
that were not run; consult [Verification](verification.md) for the evidence
currently recorded and its limits.

## RL environment example

The browser-compatible RL wrapper controls the south side while the existing
seeded opponent controls the north side. This is a single-player control
interface, not self-play or a learned opponent. From the repository root, this
example starts a seeded match and takes one 30-tick wait step:

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

See the [RL environment API guide](rl-api.md) for actions, observations,
action masks, checkpoints, and current support limits.
