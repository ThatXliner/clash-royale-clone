# Runtime correction and tool identity record

This addendum preserves the first browser-test configuration failure and pins the corrected local tool path before the next run. No candidate source, test source, assertion, or cap changed.

## First run

- `npm ci` ran in `site/input` with argv `npm ci`, direct PID `78781`. Raw output is `site/logs/npm-ci.raw`; it reports 19 packages added and 0 vulnerabilities. The `zsh` wrapper then exited 1 because it tried to assign to the shell's read-only `status` variable after `wait`; `wait` had entered its success branch, so npm's exit code was 0. This is recorded in `site/logs/npm-ci.meta`.
- The first `npm run test:publication-pages` ran with argv recorded in `site/logs/publication-pages.meta`, direct PID `78990`, exit code 1. Raw TAP is `site/logs/publication-pages.raw`: 3 of 5 tests passed; the two browser tests failed at module resolution because the supplied external Playwright path did not exist. No tests reached a candidate-code assertion failure.
- Missing path checked: `/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs`.

## Verified local runtime identity

- Node: `v22.22.3`, executable `/Users/me/.hermes/node/bin/node`, SHA-256 `5d9d3872911e2340a43b707962e68143de8a4e8d54628845c0c4f2de1fb7cd5c`.
- npm: `10.9.8`, CLI `/Users/me/.hermes/node/lib/node_modules/npm/bin/npm-cli.js`, SHA-256 of `/Users/me/.hermes/node/bin/npm`: `8e5f6f3429f8cdbe693cdc29904e9d5a7b127a494bd15c804bd54c7403bfcbe7`.
- Playwright: npm-ci-installed `playwright` 1.58.2 at `/Users/me/.codex/clash-qualification/20261020-design-r4-site-critic/site/input/node_modules/playwright/index.mjs`, SHA-256 `a0f5715ea22354f922791a9c53dc012d5d5c067ff9cc4cd35ffb7cd272071a9f`.
- Playwright core: `playwright-core` 1.58.2 at `/Users/me/.codex/clash-qualification/20261020-design-r4-site-critic/site/input/node_modules/playwright-core/index.mjs`, SHA-256 `3d36e2132d3c8b62397d23f0bb4177336aaee503203ae2a2c90fbeb5bf3317dd`.
- System browser: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, reports `Google Chrome 155.0.8059.85`, universal x86_64/arm64 Mach-O, SHA-256 `6e156f2271cef44afce9db36a5b920e94518857b94a4160f082696f8c3bd1c9d`.

## Corrected runner path before rerun

Both capture runners now point directly to the locally installed, version-verified package above. The publication-pages tests receive that same absolute path in `GAME_BROWSER_PLAYWRIGHT`; `GAME_BROWSER_CHROME` stays on the verified system Chrome path. The only runner edits are the Playwright import path:

- R4 capture runner SHA-256: `962cae7802a24d1661b2c0b1758a38bf5ad031e7d80267b3ed0cc3038bcafb62`.
- Native site runner SHA-256: `00b00b60a2d37691dab798d2a33f7883abb23c55c88548ff9aca2d30d91526f3`.

The exact R4 board input hash, site Git archive, and extracted pre-install source hash manifest remain those recorded in `PRELAUNCH.md`.
