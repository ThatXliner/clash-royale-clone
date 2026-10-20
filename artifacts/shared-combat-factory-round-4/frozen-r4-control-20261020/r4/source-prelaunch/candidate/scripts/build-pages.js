#!/usr/bin/env node

import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { buildRelease } from "./build-release.js";
import { qualifyBrowserArtifact } from "./release-browser-qualification.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const DEFAULT_OUTPUT = join(WORKSPACE_ROOT, "site-dist");
const DEFAULT_REPOSITORY = "ThatXliner/clash-royale-clone";
const SOURCE_SITE = join(WORKSPACE_ROOT, "site");
const APPROVED_BRAND_FILES = Object.freeze([
  ["docs/brand/logo.svg", "brand/logo.svg"],
  ["docs/brand/banner.svg", "brand/banner.svg"],
  ["docs/brand/gameplay.png", "brand/gameplay.png"],
]);
const APPROVED_LEGAL_FILES = Object.freeze([
  ["LICENSE", "LICENSE"],
  ["NOTICE", "NOTICE"],
]);
const REQUIRED_TEMPLATE_VALUES = Object.freeze([
  "@@REPOSITORY_URL@@",
  "@@RL_SOURCE_URL@@",
  "@@RL_DOCS_URL@@",
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function parseRepository(value) {
  invariant(typeof value === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/u.test(value),
    "repository must be an owner/name slug, for example ThatXliner/clash-royale-clone");
  const [owner, name] = value.split("/");
  return `${encodeURIComponent(owner)}/${encodeURIComponent(name)}`;
}

function parseRef(value) {
  invariant(typeof value === "string" && value.length > 0 &&
    !/[\\?#\s\u0000-\u001f]/u.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== ".."),
  "source ref must be a branch or tag name without query, fragment, whitespace, or traversal");
  return value.split("/").map(encodeURIComponent).join("/");
}

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function repositoryLinks(repository, ref) {
  const encodedRepository = parseRepository(repository);
  const encodedRef = parseRef(ref);
  const root = `https://github.com/${encodedRepository}`;
  return {
    "@@REPOSITORY_URL@@": root,
    "@@RL_SOURCE_URL@@": `${root}/blob/${encodedRef}/src/rl/environment.js`,
    "@@RL_DOCS_URL@@": `${root}/blob/${encodedRef}/docs/rl-api.md`,
  };
}

async function validateOutput(output) {
  const absolute = resolve(output);
  const rootReal = await realpath(WORKSPACE_ROOT);
  const filesystemRoot = resolve(absolute, sep);
  invariant(absolute !== filesystemRoot, "refusing filesystem root as Pages output");

  const parentReal = await realpath(dirname(absolute));
  const safeOutput = resolve(parentReal, basename(absolute));
  invariant(safeOutput !== await realpath(homedir()), "refusing home directory as Pages output");
  invariant(safeOutput !== resolve(tmpdir()), "refusing temporary directory root as Pages output");
  invariant(!isWithin(safeOutput, rootReal), "Pages output cannot contain the workspace");
  if (isWithin(rootReal, safeOutput)) {
    invariant(safeOutput === DEFAULT_OUTPUT,
      "in-repository Pages output is restricted to site-dist; use an external --out directory for isolation");
  }

  try {
    const existing = await lstat(absolute);
    invariant(!existing.isSymbolicLink(), "Pages output must not be a symbolic link");
    invariant(existing.isDirectory(), "existing Pages output must be a directory");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return { absolute, parent: parentReal };
}

async function copySourceTree(source, destination) {
  const info = await lstat(source);
  invariant(!info.isSymbolicLink() && info.isDirectory(),
    `site source must be a regular directory: ${source}`);
  await mkdir(destination, { recursive: true });
  for (const entry of (await readdir(source, { withFileTypes: true }))
    .toSorted((left, right) => left.name.localeCompare(right.name))) {
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    const child = await lstat(from);
    invariant(!child.isSymbolicLink(), `site source cannot contain symlinks: ${from}`);
    if (child.isDirectory()) await copySourceTree(from, to);
    else {
      invariant(child.isFile(), `site source contains an unsupported entry: ${from}`);
      invariant(extname(entry.name).toLowerCase() !== ".map",
        `source maps are not approved for Pages: ${from}`);
      await copyFile(from, to);
    }
  }
}

async function copyApprovedFile(sourceRelative, destinationRelative, stage) {
  const source = join(WORKSPACE_ROOT, sourceRelative);
  const destination = join(stage, destinationRelative);
  const info = await lstat(source);
  invariant(info.isFile() && !info.isSymbolicLink(),
    `approved publication source must be a regular file: ${sourceRelative}`);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
}

async function renderLanding(stage, links) {
  const indexPath = join(stage, "index.html");
  let html = await readFile(indexPath, "utf8");
  for (const token of REQUIRED_TEMPLATE_VALUES) {
    invariant(html.includes(token), `landing template is missing ${token}`);
    html = html.replaceAll(token, escapeAttribute(links[token]));
  }
  invariant(!/@@[A-Z0-9_]+@@/u.test(html), "landing template contains an unresolved value");
  await writeFile(indexPath, html);
}

async function publishDirectory(stage, output) {
  const backup = join(dirname(output), `.${basename(output)}.backup-${randomUUID()}`);
  let movedOld = false;
  let movedStage = false;
  try {
    try {
      await lstat(output);
      await rename(output, backup);
      movedOld = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(stage, output);
    movedStage = true;
    if (movedOld) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    if (!movedStage && movedOld) {
      try {
        await rename(backup, output);
      } catch (restoreError) {
        error.message += `; failed to restore previous Pages output: ${restoreError.message}`;
      }
    }
    throw error;
  } finally {
    if (!movedStage) await rm(stage, { recursive: true, force: true });
  }
}

export async function buildPages({
  output = DEFAULT_OUTPUT,
  repository = process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
  ref = process.env.GITHUB_REF_NAME ?? "main",
} = {}) {
  const links = repositoryLinks(repository, ref);
  const { absolute, parent } = await validateOutput(output);
  const stage = await mkdtemp(join(parent, `.${basename(absolute)}.stage-`));
  try {
    await copySourceTree(SOURCE_SITE, stage);
    for (const [source, destination] of APPROVED_BRAND_FILES)
      await copyApprovedFile(source, destination, stage);
    for (const [source, destination] of APPROVED_LEGAL_FILES)
      await copyApprovedFile(source, destination, stage);

    await buildRelease({ output: join(stage, "game") });
    await renderLanding(stage, links);
    await writeFile(join(stage, ".nojekyll"), "");
    await writeFile(join(stage, "game", "index.html"), [
      "<!doctype html>",
      '<html lang="en"><head><meta charset="utf-8">',
      '<meta http-equiv="refresh" content="0; url=./public/index.html">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>Opening Moss &amp; Ember</title></head><body>",
      '<p>Opening the browser build. <a href="./public/index.html">Continue to the game</a>.</p></body>',
      "</html>",
      "",
    ].join("\n"));
    const manifest = JSON.parse(await readFile(join(stage, "game", "release-manifest.json"), "utf8"));
    const projectPath = repository.split("/")[1];
    const browserQualification = await qualifyBrowserArtifact({
      root: stage,
      manifestPath: "game/release-manifest.json",
      serverMode: "pages",
      prefix: `/${projectPath}/`,
      mountedPath: "game",
      browserEntrypoints: [],
      moduleEntrypoints: manifest.standaloneModules,
      flow: "game",
      landingPage: true,
    });
    await publishDirectory(stage, absolute);
    return Object.freeze({
      fileCount: manifest.fileCount,
      output: absolute,
      releaseBytes: manifest.totalBytes,
      repository: repository.trim(),
      ref,
      browserQualification,
    });
  } catch (error) {
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

function parseArguments(argv) {
  const options = {
    output: DEFAULT_OUTPUT,
    repository: process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY,
    ref: process.env.GITHUB_REF_NAME ?? "main",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--help" || flag === "-h") {
      process.stdout.write("Usage: node scripts/build-pages.js [--out DIR] [--repository OWNER/NAME] [--ref BRANCH]\n");
      process.exit(0);
    }
    invariant(["--out", "--repository", "--ref"].includes(flag),
      `unknown argument: ${flag}`);
    const value = argv[index + 1];
    invariant(value !== undefined && !value.startsWith("--"), `${flag} requires a value`);
    index += 1;
    if (flag === "--out") options.output = resolve(value);
    else if (flag === "--repository") options.repository = value;
    else options.ref = value;
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const result = await buildPages(parseArguments(process.argv.slice(2)));
    process.stdout.write(`Pages artifact: ${result.output} (${result.fileCount} release files; ${result.releaseBytes} bytes)\n`);
  } catch (error) {
    process.stderr.write(`Pages build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
