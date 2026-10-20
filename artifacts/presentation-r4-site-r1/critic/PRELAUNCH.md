# R4 presentation review prelaunch record

No Node, npm, Chrome, or build command has run before this record.

## Repository and candidate identities

- Root checkout: `/Users/me/.codex/worktrees/9456/clash-royale-clone`
- Root HEAD at preparation: `474fa49feda344ca6977300e7c2407cf17142cd1`
- Main comparison source for DESIGN-001: `636b29d8b8e8576ba0fb6feab81c4ce01d6dde64`
- SITE-REDESIGN-001 candidate: `4b18faf1f163244d592cdde6c82ea8ef06041b5e`
- Candidate parent: `636b29d8b8e8576ba0fb6feab81c4ce01d6dde64`
- Candidate site commit changes only `README.md`, `site/index.html`, and `site/assets/site.css`; `src` and `tests` have no diff between its parent and candidate.
- Root checkout is user-dirty. No root checkout files, index, or HEAD were edited by this critic.

## DESIGN-001 R4 input and capture

- Candidate: `/Users/me/.codex/clash-qualification/20261020-site-redesign-builder/r4/design-board.html`
- Isolated exact copy: `board/input/design-board.html`
- Candidate and isolated-copy SHA-256: `b73f64b9efbb6fb8a4431c253a14c0885ca246e991c0955fc580b2c51c25c281`
- Prior R3 runner base: `board/runner/capture-r3-base.mjs`, SHA-256 `14c6a55ed0e8b1b11ebedd0a8ab9e84fb2074379dde8fa6db2ffeb877d74d0cf`
- R4 capture runner: `board/capture.mjs`, SHA-256 `df399b898d590a3e6b9f9c1bd1f93f619fd383bd50b557c408a0dd17585ae1d4`
- Runner target: six actual 390×844 and 1440×933 CSS-pixel frames at DPR 1; native font and network facts; settled PageDown/End samples; 23 actual Tab focus stops with focus-ring and scroll facts; actual pointer-positioned wheel input and settled scroll; unmodified raw frame screenshots.
- R3 verdict: `20261020-design-r3-critic/verdict.md` reported both PageDown and End at `scrollTop=0`, with the final row clipped. R4 evidence will measure after three stable animation frames before assessing either key.

## SITE-REDESIGN-001 input and capture

- Candidate source: exact Git archive of `4b18faf1f163244d592cdde6c82ea8ef06041b5e` at `site/input/`.
- Archive: `site/input/source.tar`, SHA-256 `72d965e5f0737f7c64320a8093d4137fb773372f0760114ffb08e39a33774327`.
- Extracted source file count including the archive: 647; extracted tree size before installation/build: 149 MiB.
- Selected roots include all package files, product code/assets, publication scripts, docs, and tests. `reference/`, `artifacts/`, `.git/`, `.agents/`, `design/`, generated `dist/`, and installed top-level `node_modules/` are absent. Small tracked `tests/fixtures/**/node_modules/` directories are test fixtures from Git, not installed dependencies.
- Extracted file hash list: `site/source-files.sha256`, SHA-256 `64b50cd6f058cfb1d43a2955b912d8df09fef3f6aa9ea2aac45c7dacd30a2938`.
- Exact candidate owned-file hashes in the archive:
  - `README.md`: `c18419419153395d0e8390a3a64bff43537bed2d84744e707a275b7048394300`
  - `site/index.html`: `fd63e890196e28ff7c5ae85f714dca5acbd92bd2cbd526579b3be17123d41974`
  - `site/assets/site.css`: `d932164c8f7dabd2259be85268f6beb770d8e8739b36c89b86bf4ea8747ea1f0`
- Browser runner: `site/capture-site.mjs`, SHA-256 `9aa549f5db669bc827bb974e9d1efa8c909700fc9d9805a00f4569cb08b74705`.
- Native output target: `site/output/pages`; screenshots and JSON go under `site/output/native-captures/`.
- Package-discovered checks: `npm ci`, `npm run test:publication-pages`, and `npm run build:pages -- --out /Users/me/.codex/clash-qualification/20261020-design-r4-site-critic/site/output/pages`. The `--out` argument is supported by `scripts/build-pages.js` and keeps generated output outside both the root checkout and the source archive.
- Native capture runner opens the built Pages artifact at 390×844 and 1440×933, records viewport and full-page frames, tab focus, in-page navigation, the demo link destination, local requests, errors, heading/landmark/link facts, external stylesheet and font-face facts, and horizontal overflow.

## Runtime boundary

Runtime is authorized for these bounded checks. When launched, keep the environment to the following explicit variables only:

`PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin`, `HOME=/Users/me`, `TMPDIR=/tmp`, `LANG=en_US.UTF-8`, `TZ=UTC`, `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, `GAME_BROWSER_CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, and `GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs`.

Record exact argv/cwd, allowlisted environment, direct PIDs, raw stdout/stderr, exit status, actual screenshots, and post-run source/input fences. Do not copy installed dependencies into the evidence package or run full `npm test` or endurance checks.
