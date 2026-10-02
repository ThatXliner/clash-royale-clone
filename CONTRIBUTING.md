# Contributing to Moss & Ember

Thanks for helping improve this original card battler and its deterministic
simulation. Contributions should keep the shipped game original and make
claims only as strong as their evidence.

## Set up

Use Node.js 22 or later, then install the locked dependencies:

```sh
npm ci
```

Start the local game with `npm run preview:release`; it builds the release and
serves it at `http://127.0.0.1:4173/public/index.html`. For browser checks,
install dependencies with `npm ci` so the repository's pinned Playwright
version is used.

## Before opening a pull request

- Run the focused test runner for the code you changed. Run `npm test` for the
  default suite. To run a focused runner with the portable browser setup, use
  `npm run test:portable -- node tests/<runner>.js <selector>`; the wrapper can
  also run non-browser tests. After `npm ci`, install Chromium with
  `npx playwright install chromium` when a selected browser test needs it.
  The long browser endurance run uses the same wrapper:
  `npm run test:portable -- npm run test:game-browser-endurance`.
- Keep simulation outcomes deterministic: use fixed ticks and seeded random
  inputs, and do not put wall-clock time or unseeded randomness in game logic.
- Add a meaningful interaction test for a newly supported card or mechanic.
  Treat low-confidence source values as questions, and keep unsupported
  behavior explicit instead of claiming parity.
- Use original names, art, interface text, and audio in the product. Do not
  import, copy, or bundle files from `reference/`; it is a comparison corpus.
- Include the commands you ran and any material limitation in the pull request
  description. For visual changes, include a real render or browser capture.

## Pull requests

Keep changes focused. Explain the user-visible behavior, why it changes, and
the evidence that verifies it. Disclose when a browser test was not run or when
the result still has a known gap. Please do not add badges, benchmark claims,
or parity claims without current, reproducible evidence.

New project-authored code and original brand/game assets are covered by
[GNU AGPL-3.0-only](LICENSE) unless their provenance file declares another
license. See [NOTICE](NOTICE) before adding media or other third-party
material.
