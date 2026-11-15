# REL-002 round 1 — critic verdict

Candidate: bdf53f76 (worktree-agent-a348bbea5795432cc), rebased on d6a6ff19.

**VERDICT: PASS**

## Independent N to N+1 harness (harness/)
- Built two Pages sites from a `git archive` copy of the candidate with `scripts/build-pages.js`:
  - N: markers `RELEASE_N` appended to `src/ui/app-shell.js` (shell), `src/ui/arena-shell-entry.js` (iframe entry), and `src/ui/three/battlefield/palette.js`. palette.js is deep in the graph: it is reached through the dynamic `import("./scene.js")` in the battlefield host.
  - N+1: the same markers set to `RELEASE_N1`, plus the grass palette recoloured.
- 10 hashed files changed names between N and N+1. The battle iframe URL changed from `v=9b8f8bceacfa` to `v=c25deec1d874`.
- `harness/server.mjs` serves `/clash-royale-clone/...` with `Cache-Control: max-age=600`, a content ETag and Last-Modified. It ignores the query string, as Pages does. Releases are swapped in place.
- Playwright Chromium ran with a persistent profile, so the disk cache is real.

| Scenario | Shell | Battle iframe entry | Deep module (palette.js) | Errors |
|---|---|---|---|---|
| A: load N via landing link, enter battle, deploy N+1, `page.reload()` | N to **N1** | N to **N1** | N to **N1**, three.js canvas present | 0 |
| B: battle in N, deploy, go to landing and back by link within 10 min | **N (stale)** | N (stale) | N (stale) | 0 |
| B then normal reload | N1 | N1 | N1 | 0 |
| B2: menu only in N, deploy, link back within 10 min, enter battle | **N (stale)** | **N1** (mixed) | N1 | 0 |
| D: N+1 fresh, 8 deploys | N1 | N1 | N1 | 0 |

On reload, `index.html` was revalidated (conditional request, 200) and every new hashed chunk was fetched. No 404s occurred in any scenario.

Link-navigation judgement: within the 10-minute window, the cached entry HTML is reused. That gives either a consistent old release (B) or an old shell with a new battle frame (B2, because Pages ignores `?v=`). It clears on any reload or after max-age expires. No errors occurred, because the shell-to-frame contract did not change between my builds. A player is not stuck: the worst case is 10 minutes of old code. The B2 version skew would break if a future release changes the shell-to-iframe message contract.

## Runtime loads
Across real battles, the only unhashed network requests were:
- `game/public/index.html`
- `ui-arena-shell.html?...&v=<hash>`
- the landing page's own `/`, `assets/site.css` and `brand/*`

No fetch()'d JSON, workers, audio files or web manifest are loaded. Fonts and the arena image in CSS are hashed: `BarlowCondensed-Bold-v1X23fbx.ttf` and `moss-ember-arena-painted-DDcPh-4V.webp`. Card art is hashed through `new URL(..., import.meta.url)`. Some unhashed files still ship but are never requested by the pages:
- `game/public/assets/*` (7 files)
- `game/src/rl/environment.js` and `game/src/ui/arena-shell-entry.js` (RL module entrypoints)
- `release-manifest.json` and licenses

## Tests (run one at a time; machine load average 32-38 from other agents)
- release-build: 14/15 ok. `not ok 1 - RELEASE-001B emits a deterministic bounded graph...` failed with `test timed out after 120000ms` (171 s). The run then hung and was killed at the background limit. Re-running it alone also timed out (130 s). **Base main d6a6ff19 times out identically (171 s) under the same load**, so this is environmental. In a scratch copy with only the timeout raised to 900 s, the test passes: `ok 1` in 416 s. This confirms the builder's changed assertions.
- release-002: `ok 1 - REL-002: shipped assets are hashed and a normal reload picks up the next release`. 1/1 pass.
- shipping-isolation-guard: 13/13 pass.
- game-browser-journey: 1/1 pass.
- `node --test tests/publication-pages.test.js`: 5/5 pass.

## pages.yml
The workflow runs, in order: `npm ci`, Playwright install, the shipping-isolation guard, release-build, **`npm run test:release-002`** (new), publication-pages, and then `npm run build:pages`. `build:pages` calls `buildRelease`, which applies the hashed `assetFileNames`/`entryFileNames` and `versionLinkedPages`. My `build-pages.js` outputs confirm that the hashed layout lands under `site-dist/game/`. The landing page links to `./game/public/index.html` under the `/clash-royale-clone/` base, and that route works.

## Biggest gap
Within the 10-minute window, link navigation reuses the cached `public/index.html`. A shell from N can then frame the N+1 battle page, because Pages ignores `?v=`. Add a small no-store version check, such as fetching a per-release `version.json` with `cache: "no-store"` on boot and battle entry, then reloading on mismatch. That would close both the stale-shell case and the skew case.
