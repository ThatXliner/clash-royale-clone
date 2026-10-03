# Publishing

The GitHub Pages site is not live yet. A maintainer must enable Pages and
manually run the repository's Pages workflow before it can be published.

Use Node.js 22.12.0 or later. The build pins Vite 8.3.2 as a build-only
development dependency; the generated game is a standalone runtime with no
runtime dependencies.

## Build and preview locally

Install the locked dependencies and Playwright's Chromium browser before
running a production build or Pages preview:

```sh
npm ci
npx playwright install chromium
```

On Linux, use `npx playwright install --with-deps chromium` for the second
command so Chromium's system dependencies are installed too.

Both release and Pages builds qualify the exact staged output in Chromium
before replacing the existing output. If a build or qualification fails, the
previous `dist/` or `site-dist/` output remains in place. The preview commands
run these builds first, so they need the same browser setup.

To build the Pages site and preview it locally, run:

```sh
npm run preview:pages
```

The preview builds the static site to `site-dist/` by default, includes the
game release under `site-dist/game/`, and serves the landing page at `/` and
the game at `/game/`. To create the static output without starting a preview,
run `npm run build:pages`.

## Enable and run GitHub Pages

1. In the repository, open **Settings → Pages** and set the build and
   deployment source to **GitHub Actions**.
2. Open **Actions → Publish GitHub Pages**, choose the intended branch (normally
   `main`), and select **Run workflow**.
3. Wait for the workflow's Pages deployment job to finish successfully, then
   use the URL shown in **Settings → Pages**. The landing page is at `/`; the
   game entry is at `/game/`.

The workflow is manual-only; merging a change does not publish the site. A
local preview or successful build also does not mean the Pages site is live.
The static publication includes the original landing page and game release,
not the `reference/` comparison corpus or the repository's large evidence
artifacts.
