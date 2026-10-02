# Publishing

The GitHub Pages site is not live yet. A maintainer must enable Pages and
manually run the repository's Pages workflow before it can be published.

## Build and preview locally

Install the locked Node.js dependencies with `npm ci`, then build and preview
the Pages output:

```sh
npm run build:pages
npm run preview:pages
```

`build:pages` writes the static site to `site-dist/` by default and includes
the game release under `site-dist/game/`. The preview serves the landing page
at `/` and the game at `/game/`.

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
