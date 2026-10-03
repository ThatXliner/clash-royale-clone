import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildPages } from "../scripts/build-pages.js";
import { createPagesPreviewServer } from "../scripts/preview-pages.js";

const WORKSPACE = resolve(fileURLToPath(new URL("..", import.meta.url)));
const REPOSITORY = "MossTeam/ember-arena";
const REF = "feature/pages-landing";

async function listFiles(root, prefix = "") {
  const result = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...await listFiles(root, relative));
    else result.push(relative);
  }
  return result.toSorted();
}

async function createPagesFixture(t) {
  const temporary = await mkdtemp(join(tmpdir(), "moss-ember-pages-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, "artifact");
  await buildPages({ output, repository: REPOSITORY, ref: REF });
  return { output, temporary };
}

test("Pages build contains the branded landing, approved source assets, and isolated game release", async (t) => {
  const { output } = await createPagesFixture(t);
  const topLevel = (await readdir(output)).toSorted();
  assert.deepEqual(topLevel, [".nojekyll", "LICENSE", "NOTICE", "assets", "brand", "game", "index.html"]);

  const landing = await readFile(join(output, "index.html"), "utf8");
  assert.match(landing, /Active prototype/u);
  assert.match(landing, /eight-card deck/u);
  assert.match(landing, /four-card hand/u);
  assert.match(landing, /spend elixir/u);
  assert.match(landing, /opposing towers/u);
  assert.match(landing, /href="\.\/game\/public\/index\.html"/u);
  assert.match(landing, /href="https:\/\/github\.com\/MossTeam\/ember-arena"/u);
  assert.match(landing,
    /href="https:\/\/github\.com\/MossTeam\/ember-arena\/blob\/feature\/pages-landing\/src\/rl\/environment\.js"/u);
  assert.match(landing,
    /href="https:\/\/github\.com\/MossTeam\/ember-arena\/blob\/feature\/pages-landing\/docs\/rl-api\.md"/u);
  assert.doesNotMatch(landing, /@@[A-Z0-9_]+@@|localhost|\.example\//u);
  assert.match(landing, /href="\.\/LICENSE"/u);
  assert.match(landing, /href="\.\/NOTICE"/u);

  const brandFiles = await readdir(join(output, "brand"));
  assert.deepEqual(brandFiles.toSorted(), ["banner.svg", "gameplay.png", "logo.svg"]);
  for (const [source, destination] of [
    ["LICENSE", "LICENSE"],
    ["NOTICE", "NOTICE"],
    ["docs/brand/logo.svg", "brand/logo.svg"],
    ["docs/brand/banner.svg", "brand/banner.svg"],
    ["docs/brand/gameplay.png", "brand/gameplay.png"],
  ]) {
    assert.deepEqual(await readFile(join(output, destination)),
      await readFile(join(WORKSPACE, source)), `${destination} is copied from its approved source`);
  }

  const releaseRoot = join(output, "game");
  const release = JSON.parse(await readFile(join(releaseRoot, "release-manifest.json"), "utf8"));
  assert.ok(release.files.some(({ path }) => path === "public/index.html"));
  const gameLanding = await readFile(join(releaseRoot, "public/index.html"), "utf8");
  assert.match(gameLanding,
    /<script type="module"[^>]*src="\.\.\/src\/ui\/app-shell\.js"[^>]*><\/script>/u);
  assert.match(gameLanding, /data-deck-size/u);
  assert.match(gameLanding, /data-average-cost/u);
  assert.match(gameLanding, /src="\.\/ui-arena-shell\.html\?app-frame=1"/u);
  assert.equal(await readFile(join(releaseRoot, "index.html"), "utf8")
    .then((html) => /\.\/public\/index\.html/u.test(html)), true);
  assert.equal(await stat(join(releaseRoot, "public/index.html")).then((info) => info.isFile()), true);
  assert.equal(release.fileCount, release.files.length);
  assert.ok(release.files.some(({ path }) => path === "src/ui/app-shell.js"));
  assert.ok(release.files.every(({ path }) =>
    !/(?:^|\/)(?:reference|tests|artifacts|dist)(?:\/|$)/u.test(path)));

  const files = await listFiles(output);
  assert.ok(files.includes(".nojekyll"));
  assert.ok(files.every((path) =>
    !/(?:^|\/)(?:reference|tests|artifacts|dist)(?:\/|$)/u.test(path)));
  assert.ok(files.includes("game/public/index.html"));
  assert.ok(files.includes("game/src/rl/environment.js"));

  const localLinks = [...landing.matchAll(/(?:href|src)="([^"]+)"/gu)]
    .map(([, value]) => value)
    .filter((value) => !/^(?:https?:|#|mailto:)/u.test(value));
  assert.ok(localLinks.length > 0);
  assert.ok(localLinks.every((value) => !value.startsWith("/") && !value.includes("\\")),
    "Pages links stay relative to a repository project subpath");
});

test("Pages output refuses protected workspace destinations before writing", async () => {
  await assert.rejects(buildPages({
    output: join(WORKSPACE, "dist"),
    repository: REPOSITORY,
    ref: REF,
  }), /in-repository Pages output is restricted/u);
  await assert.rejects(buildPages({
    output: WORKSPACE,
    repository: REPOSITORY,
    ref: REF,
  }), /cannot contain the workspace/u);
});

test("local preview serves the landing and playable routes without escaping its artifact", async (t) => {
  const { output } = await createPagesFixture(t);
  const { server } = await createPagesPreviewServer({ root: output });
  await new Promise((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose, rejectClose) => {
    server.close((error) => error ? rejectClose(error) : resolveClose());
  }));
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  const landing = await fetch(`${base}/`);
  assert.equal(landing.status, 200);
  assert.match(landing.headers.get("content-type"), /text\/html/u);
  assert.match(await landing.text(), /Moss &amp; Ember/u);

  const gameRedirect = await fetch(`${base}/game/`);
  assert.equal(gameRedirect.status, 200);
  assert.match(await gameRedirect.text(), /\.\/public\/index\.html/u);

  const game = await fetch(`${base}/game/public/index.html`);
  assert.equal(game.status, 200);
  assert.match(await game.text(), /<title>/u);

  const gameModule = await fetch(`${base}/game/src/ui/app-shell.js`);
  assert.equal(gameModule.status, 200);
  assert.match(gameModule.headers.get("content-type"), /javascript/u);
  const appBootstrap = await gameModule.text();
  const runtimeImport = appBootstrap.match(/from ["']\.\.\/\.\.\/(assets\/[^"']+\.js)["']/u);
  assert.ok(runtimeImport, "the app bootstrap points to a generated runtime chunk");
  assert.equal(await stat(join(output, "game", runtimeImport[1])).then((info) => info.isFile()), true,
    "the Pages preview serves the referenced runtime chunk");

  const gameplay = await fetch(`${base}/brand/gameplay.png`);
  assert.equal(gameplay.status, 200);
  assert.match(gameplay.headers.get("content-type"), /image\/png/u);

  const license = await fetch(`${base}/LICENSE`);
  assert.equal(license.status, 200);
  assert.match(license.headers.get("content-type"), /text\/plain/u);

  const traversal = await fetch(`${base}/..%2fLICENSE`);
  assert.equal(traversal.status, 404);
  const missing = await fetch(`${base}/reference/README.md`);
  assert.equal(missing.status, 404);

  const mounted = await createPagesPreviewServer({
    root: output,
    basePath: "/clash-royale-clone/",
  });
  await new Promise((resolveListen) => mounted.server.listen(0, "127.0.0.1", resolveListen));
  t.after(() => new Promise((resolveClose, rejectClose) => {
    mounted.server.close((error) => error ? rejectClose(error) : resolveClose());
  }));
  const mountedBase = `http://127.0.0.1:${mounted.server.address().port}/clash-royale-clone`;
  const mountedLanding = await fetch(`${mountedBase}/`);
  assert.equal(mountedLanding.status, 200);
  assert.match(await mountedLanding.text(), /href="\.\/game\/public\/index\.html"/u);
  const mountedGame = await fetch(`${mountedBase}/game/public/index.html`);
  assert.equal(mountedGame.status, 200);
  assert.match(await mountedGame.text(), /data-deck-size/u);
  const mountedBootstrapResponse = await fetch(`${mountedBase}/game/src/ui/app-shell.js`);
  assert.equal(mountedBootstrapResponse.status, 200);
  assert.match(await mountedBootstrapResponse.text(), /game-runtime/u);
  assert.equal((await fetch(`http://127.0.0.1:${mounted.server.address().port}/game/`)).status, 404);
  assert.equal((await fetch(`${mountedBase}/missing.js`)).status, 404);
  await assert.rejects(createPagesPreviewServer({ root: output, basePath: "/../" }),
    /base path/u);
});

test("Pages workflow is manually dispatched and uses the required official deploy actions", async () => {
  const workflow = await readFile(join(WORKSPACE, ".github/workflows/pages.yml"), "utf8");
  assert.match(workflow, /^on:\n  workflow_dispatch:\s*$/mu);
  assert.doesNotMatch(workflow, /^\s+(?:push|pull_request):/mu);
  for (const action of [
    "actions/checkout@v6",
    "actions/configure-pages@v5",
    "actions/upload-pages-artifact@v4",
    "actions/deploy-pages@v4",
  ]) assert.ok(workflow.includes(action), `${action} is used`);
  assert.match(workflow, /pages:\s*write/u);
  assert.match(workflow, /id-token:\s*write/u);
  assert.match(workflow, /needs:\s*build/u);
  assert.match(workflow, /cancel-in-progress:\s*false/u);
  assert.match(workflow, /environment:\s*\n\s+name:\s*github-pages/u);
});

test("portable test wrapper resolves local browser paths and preserves explicit overrides", () => {
  const probe = [
    "process.stdout.write(JSON.stringify({",
    "  chrome: process.env.GAME_BROWSER_CHROME,",
    "  playwright: process.env.GAME_BROWSER_PLAYWRIGHT,",
    "}));",
  ].join("\n");
  const runProbe = (extraEnvironment = {}) => {
    const environment = { ...process.env, ...extraEnvironment };
    if (!Object.hasOwn(extraEnvironment, "GAME_BROWSER_CHROME"))
      delete environment.GAME_BROWSER_CHROME;
    if (!Object.hasOwn(extraEnvironment, "GAME_BROWSER_PLAYWRIGHT"))
      delete environment.GAME_BROWSER_PLAYWRIGHT;
    return spawnSync(process.execPath, [
      join(WORKSPACE, "scripts/test-portable.js"),
      "--",
      process.execPath,
      "-e",
      probe,
    ], { cwd: WORKSPACE, encoding: "utf8", env: environment });
  };
  const local = runProbe();
  assert.equal(local.status, 0, local.stderr);
  const localValues = JSON.parse(local.stdout);
  assert.ok(localValues.playwright.startsWith("/"),
    "Playwright path is absolute for existsSync consumers");
  assert.ok(/(?:^|\/)node_modules\/playwright\//u.test(localValues.playwright));
  assert.ok(localValues.chrome.startsWith("/"), "Chromium executable path is absolute");

  const playwrightOverride = fileURLToPath(import.meta.resolve("playwright"));
  const chromeOverride = "/tmp/moss-ember-custom-chromium";
  for (const playwrightSelection of [
    relative(WORKSPACE, playwrightOverride),
    pathToFileURL(playwrightOverride).href,
  ]) {
    const overridden = runProbe({
      GAME_BROWSER_CHROME: chromeOverride,
      GAME_BROWSER_PLAYWRIGHT: playwrightSelection,
    });
    assert.equal(overridden.status, 0, overridden.stderr);
    const overrideValues = JSON.parse(overridden.stdout);
    assert.equal(overrideValues.chrome, chromeOverride);
    assert.equal(overrideValues.playwright, playwrightOverride);
  }
});
