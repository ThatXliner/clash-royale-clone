import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [sourceRootArg, releaseRootArg] = process.argv.slice(2);
if (!sourceRootArg || !releaseRootArg) {
  throw new Error("usage: node qualify-release.mjs PINNED_ARCHIVE_ROOT RELEASE_ROOT");
}
const sourceRoot = path.resolve(sourceRootArg);
const releaseRoot = path.resolve(releaseRootArg);
const { qualifyBrowserArtifact } = await import(pathToFileURL(
  path.join(sourceRoot, "scripts/release-browser-qualification.js")));
const manifest = JSON.parse(await readFile(path.join(releaseRoot, "release-manifest.json"), "utf8"));
const result = await qualifyBrowserArtifact({
  root: releaseRoot,
  manifestPath: "release-manifest.json",
  serverMode: "release",
  prefix: "",
  mountedPath: "",
  browserEntrypoints: manifest.entrypoints,
  moduleEntrypoints: manifest.standaloneModules,
  flow: "game",
  landingPage: false,
});
process.stdout.write(JSON.stringify(result, null, 2) + "\n");
