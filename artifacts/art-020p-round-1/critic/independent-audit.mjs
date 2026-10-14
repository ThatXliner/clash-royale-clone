import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { lstat, readdir, readFile } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";

const repo = "/Users/me/.codex/worktrees/9456/clash-royale-clone";
const archive = "/tmp/codex-art020p-critic-20261013";
const publication = "/tmp/codex-art020p-pages-output";
const candidate = "7fa4bc3f521cc113752227f8fa13ae430f9607aa";
const parent = "14b5826dd7eb2205677a1e2a92a4be652be76f6d";
const manifestPath = "src/content/visual-asset-manifest.js";
const provenancePath = "docs/art/rivet-runners-portrait-provenance.json";
const sourcePath = "demo/assets/rivet-runners-portrait.png";
const outputPath = "public/assets/rivet-runners-portrait-painted.webp";
const stylePath = "public/assets/coppershade-flock-painted.webp";
const publishedPath = "game/public/assets/rivet-runners-portrait-painted.webp";
const evidence = new URL("./", import.meta.url).pathname;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function git(...args) {
  return execFileSync("git", args, { cwd: repo, encoding: "utf8" });
}

function dimensions(path) {
  const output = execFileSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], { encoding: "utf8" });
  return {
    width: Number(output.match(/pixelWidth: (\d+)/u)?.[1]),
    height: Number(output.match(/pixelHeight: (\d+)/u)?.[1]),
  };
}

async function facts(path) {
  const bytes = await readFile(path);
  return {
    path,
    format: extname(path).slice(1),
    ...dimensions(path),
    byteLength: bytes.byteLength,
    sha256: sha256(bytes),
  };
}

async function listFiles(root, current = root) {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const path = join(current, entry.name);
    const info = await lstat(path);
    if (info.isSymbolicLink()) throw new Error(`unexpected publication symlink: ${path}`);
    if (entry.isDirectory()) output.push(...await listFiles(root, path));
    else if (entry.isFile()) output.push(path);
    else throw new Error(`unexpected publication entry: ${path}`);
  }
  return output;
}

const provenance = JSON.parse(await readFile(join(archive, provenancePath), "utf8"));
const actualSource = await facts(join(archive, sourcePath));
const actualOutput = await facts(join(archive, outputPath));
const actualStyleInput = await facts(join(archive, stylePath));
const generatedToolFile = await facts(provenance.generation.generatedToolPath);
const reproducedOutput = await facts(join(archive, "reproduced.webp"));
const publishedOutput = await facts(join(publication, publishedPath));
const sourceBytes = await readFile(join(archive, sourcePath));
const sourceHeader = {
  pngSignature: sourceBytes.subarray(0, 8).toString("hex"),
  colorType: sourceBytes[25],
  bitDepth: sourceBytes[24],
};

const baselineManifest = git("show", `${parent}:${manifestPath}`);
const currentManifest = await readFile(join(archive, manifestPath), "utf8");
const marker = '    id: "rivet-runners-portrait-painted",';
const markerIndex = currentManifest.indexOf(marker);
const recordStart = currentManifest.lastIndexOf("  {\n", markerIndex);
const recordEndIndex = currentManifest.indexOf("  },\n", markerIndex);
const recordEnd = recordEndIndex < 0 ? -1 : recordEndIndex + "  },\n".length;
if (markerIndex < 0 || currentManifest.indexOf(marker, markerIndex + marker.length) >= 0 || recordStart < 0 || recordEnd < 0)
  throw new Error("could not isolate exactly one Rivet Runners manifest record");
const addedRecord = currentManifest.slice(recordStart, recordEnd);
const withoutAddedRecord = currentManifest.slice(0, recordStart) + currentManifest.slice(recordEnd);
const manifestDiff = git("diff", "--no-ext-diff", "--unified=0", parent, candidate, "--", manifestPath);
const manifestRemovedLines = manifestDiff.split("\n").filter((line) => line.startsWith("-") && !line.startsWith("---"));
const manifestAddedLines = manifestDiff.split("\n").filter((line) => line.startsWith("+") && !line.startsWith("+++"));

const changedFiles = git("diff", "--name-status", parent, candidate).trim().split("\n").map((line) => {
  const [status, path] = line.split("\t");
  return { status, path };
}).filter(({ path }) => path);
const changedSourcePaths = changedFiles.filter(({ path }) => path.startsWith("src/"));
const releaseManifest = JSON.parse(await readFile(join(publication, "game/release-manifest.json"), "utf8"));
const releaseFiles = await listFiles(join(publication, "game"));
const publicationFiles = await listFiles(publication);
const publicationHashEntries = await Promise.all(publicationFiles.map(async (path) => ({
  path,
  sha256: sha256(await readFile(path)),
})));
const outputFileHashes = new Set(publicationHashEntries.map(({ sha256: hash }) => hash));
const bannedSegments = new Set(["reference", "demo", "docs", "tests", "test", "artifacts", "node_modules"]);
const forbiddenPublicationPaths = publicationFiles
  .map((path) => relative(publication, path).split(sep))
  .filter((parts) => parts.some((part) => bannedSegments.has(part.toLowerCase())))
  .map((parts) => parts.join("/"));
const publishedSourcePng = publicationFiles
  .filter((path) => path.endsWith("/rivet-runners-portrait.png"))
  .map((path) => relative(publication, path));
const publishedProvenance = publicationFiles
  .filter((path) => path.endsWith("/rivet-runners-portrait-provenance.json"))
  .map((path) => relative(publication, path));
const exactPublishedWebpPaths = publicationHashEntries
  .filter(({ sha256: hash }) => hash === actualOutput.sha256)
  .map(({ path }) => relative(publication, path));

const referenceCards = JSON.parse(await readFile(join(archive, "reference/stats/cards.json"), "utf8"));
const normalize = (value) => String(value).toLocaleLowerCase("en-US").replace(/[^a-z0-9]/gu, "");
const candidateNames = ["Rivet Runners", "rivet-runners"];
const exactReferenceNameMatches = referenceCards.cards.filter((card) =>
  candidateNames.some((name) => normalize(name) === normalize(card.name) || normalize(name) === normalize(card.key))
).length;
const concept = await readFile(join(archive, "artifacts/art-020p-round-1/builder/rivet-runners-concept.md"), "utf8");
const loreSection = concept.match(/## Lore\s+([\s\S]*?)(?=\n## |$)/u)?.[1]?.trim() ?? "";
const loreSentences = loreSection.split(/(?<=[.!?])\s+/u).filter(Boolean);
const chromeRender = JSON.parse(await readFile(join(evidence, "native-chrome-render.json"), "utf8"));
const screenshotFacts = await Promise.all(chromeRender.screenshots.map((filename) => facts(join(evidence, filename))));
const cwebpVersion = execFileSync("cwebp", ["-version"], { encoding: "utf8" }).trim();
const testLog = await readFile(join(evidence, "visual-asset-manifest.log"), "utf8");
const buildLog = await readFile(join(evidence, "build-pages.log"), "utf8");

const result = {
  candidate: { commit: candidate, parent, archivePath: archive },
  changedFiles,
  changedSourcePaths,
  candidateScopeChecks: {
    onlyManifestChangedUnderSrc: changedSourcePaths.length === 1 && changedSourcePaths[0].path === manifestPath,
    noTestsPlanOrProgressChanged: !changedFiles.some(({ path }) => /^(?:tests\/|PLAN\.md$|progress\.html$|rounds\.md$|HEAD$)/u.test(path)),
  },
  assets: {
    source: actualSource,
    sourceHeader,
    originalGenerationFile: generatedToolFile,
    sourceEqualsOriginalGenerationFile: actualSource.sha256 === generatedToolFile.sha256 && actualSource.byteLength === generatedToolFile.byteLength,
    styleInput: actualStyleInput,
    declaredSourceMatches: actualSource.path.endsWith(provenance.source.path) && actualSource.width === provenance.source.dimensions.width && actualSource.height === provenance.source.dimensions.height && actualSource.byteLength === provenance.source.byteLength && actualSource.sha256 === provenance.source.sha256,
    declaredStyleInputMatches: actualStyleInput.path.endsWith(provenance.generation.inputImage.path) && actualStyleInput.width === provenance.generation.inputImage.dimensions.width && actualStyleInput.height === provenance.generation.inputImage.dimensions.height && actualStyleInput.byteLength === provenance.generation.inputImage.byteLength && actualStyleInput.sha256 === provenance.generation.inputImage.sha256,
    candidateOutput: actualOutput,
    reproducedOutput: reproducedOutput,
    publishedOutput: publishedOutput,
    declaredOutputMatches: actualOutput.path.endsWith(provenance.output.path) && actualOutput.width === provenance.output.dimensions.width && actualOutput.height === provenance.output.dimensions.height && actualOutput.byteLength === provenance.output.byteLength && actualOutput.sha256 === provenance.output.sha256,
    publicationBytesEqualCandidate: actualOutput.sha256 === publishedOutput.sha256 && actualOutput.byteLength === publishedOutput.byteLength,
    belowOneMiB: actualOutput.byteLength <= 1024 * 1024,
    license: { provenance: provenance.license, manifest: "AGPL-3.0-only", matches: provenance.license === "AGPL-3.0-only" },
    authorship: provenance.authorship,
    generationTool: provenance.generation.tool,
    cwebpVersion,
    cwebpSettings: provenance.output.encodingSettings,
    cwebpReproductionMatches: actualOutput.sha256 === reproducedOutput.sha256 && actualOutput.byteLength === reproducedOutput.byteLength,
    promptComplete: typeof provenance.generation.prompt === "string" && provenance.generation.prompt.includes("Primary request:") && provenance.generation.prompt.includes("both mallet heads visible") && provenance.generation.prompt.includes("designed to remain legible when reduced to 64px"),
  },
  manifestPreservation: {
    exactNewRecord: addedRecord,
    oldRecordsByteEqualToParent: withoutAddedRecord === baselineManifest,
    onlyAdditionsInManifestDiff: manifestRemovedLines.length === 0 && manifestAddedLines.length > 0,
    removedLineCount: manifestRemovedLines.length,
    addedLineCount: manifestAddedLines.length,
  },
  characterChecks: {
    loreSentenceCount: loreSentences.length,
    loreSentences,
    exactReferenceCardNameMatches: exactReferenceNameMatches,
    changedProductFilesContainOnlyPortraitStage: changedFiles.filter(({ path }) => !path.startsWith("artifacts/") && !path.endsWith("review-source-note.txt")).map(({ path }) => path),
    noPortraitLookupOrGameplayIntegration: !changedFiles.some(({ path }) => path.startsWith("src/") && path !== manifestPath),
  },
  commands: {
    visualAssetManifest: {
      command: "npm run test:visual-asset-manifest",
      exitCode: 0,
      outputPath: "artifacts/art-020p-round-1/critic/visual-asset-manifest.log",
      passing: /# pass 6\s+# fail 0/u.test(testLog),
    },
    pagesBuild: {
      command: "npm run build:pages -- --out /tmp/codex-art020p-pages-output",
      exitCode: 0,
      outputPath: "artifacts/art-020p-round-1/critic/build-pages.log",
      output: buildLog.trim(),
    },
  },
  publicationAudit: {
    root: publication,
    fileCount: publicationFiles.length,
    releaseFileCount: releaseFiles.length,
    releaseManifestFileCount: releaseManifest.fileCount,
    releaseManifestBytes: releaseManifest.totalBytes,
    exactPublishedWebpPaths,
    sourcePngPaths: publishedSourcePng,
    sourcePngShaPresent: outputFileHashes.has(actualSource.sha256),
    provenancePaths: publishedProvenance,
    forbiddenPublicationPaths,
    passes: exactPublishedWebpPaths.length === 1 && publishedSourcePng.length === 0 && !outputFileHashes.has(actualSource.sha256) && publishedProvenance.length === 0 && forbiddenPublicationPaths.length === 0,
  },
  chromeRender: chromeRender,
  screenshotFacts,
};

const checks = [
  result.candidateScopeChecks.onlyManifestChangedUnderSrc,
  result.candidateScopeChecks.noTestsPlanOrProgressChanged,
  result.assets.sourceEqualsOriginalGenerationFile,
  result.assets.declaredSourceMatches,
  result.assets.declaredStyleInputMatches,
  result.assets.declaredOutputMatches,
  result.assets.publicationBytesEqualCandidate,
  result.assets.belowOneMiB,
  result.assets.license.matches,
  result.assets.cwebpReproductionMatches,
  result.assets.promptComplete,
  result.manifestPreservation.oldRecordsByteEqualToParent,
  result.manifestPreservation.onlyAdditionsInManifestDiff,
  result.characterChecks.loreSentenceCount === 2,
  result.characterChecks.exactReferenceCardNameMatches === 0,
  result.characterChecks.noPortraitLookupOrGameplayIntegration,
  result.commands.visualAssetManifest.passing,
  result.publicationAudit.passes,
  chromeRender.deviceScaleFactor === 1,
  screenshotFacts[0].width === 64 && screenshotFacts[0].height === 64,
  screenshotFacts[1].width === 128 && screenshotFacts[1].height === 128,
];
result.allChecksPass = checks.every(Boolean);

const json = `${JSON.stringify(result, null, 2)}\n`;
await (await import("node:fs/promises")).writeFile(join(evidence, "independent-audit.json"), json);
process.stdout.write(json);
if (!result.allChecksPass) process.exitCode = 1;
