import { createRequire } from "node:module";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { dirname, fileURLToPath } from "node:url";
import { buildRelease } from "../../../../scripts/build-release.js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../../..");
const temporary = await mkdtemp(join(tmpdir(), "art-022p-release-size-"));
const output = join(temporary, "release");
try {
  const result = await buildRelease({ output });
  const manifest = JSON.parse(await readFile(join(output, "release-manifest.json"), "utf8"));
  const javascript = manifest.files.filter(({ path }) => path.endsWith(".js"))
    .toSorted((left, right) => right.size - left.size || left.path.localeCompare(right.path));
  const kernelGraphEntry = Object.entries(manifest.build.graph)
    .find(([key]) => key.includes("battle-continuation-kernel"));
  const config = JSON.parse(await readFile(join(root, "scripts/release-build.config.json"), "utf8"));
  const report = {
    outputWasTemporary: true,
    entrypoints: manifest.entrypoints,
    fileCount: result.fileCount,
    totalBytes: result.totalBytes,
    configuredReleaseCapBytes: config.limits.maxTotalBytes,
    configuredPerFileCapBytes: config.limits.maxFileBytes,
    releaseUnder8MiB: result.totalBytes <= config.limits.maxTotalBytes,
    largestJavaScriptFiles: javascript.slice(0, 8),
    largestJavaScriptBytes: javascript[0]?.size ?? null,
    largestJavaScriptUnder524288Bytes: javascript.every(({ size }) => size <= 524288),
    battleContinuationKernelGraphEntry: kernelGraphEntry ?? null,
    manifestSha256: manifest.files.find(({ path }) => path === "release-manifest.json")?.sha256 ?? null,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
