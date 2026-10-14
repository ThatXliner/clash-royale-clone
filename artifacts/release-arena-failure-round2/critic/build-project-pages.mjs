import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildPages } from "../../../scripts/build-pages.js";

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));
const output = "/private/tmp/release-arena-failure-round2-pages-output";
const result = await buildPages({
  output,
  repository: "ThatXliner/clash-royale-clone",
  ref: "main",
});
const report = {
  candidate: "8a89beebcffea1a51a492da4140c3f42c30f7bb6",
  repository: result.repository,
  ref: result.ref,
  output: result.output,
  pagesPrefix: `/${result.repository.split("/")[1]}`,
  fileCount: result.fileCount,
  releaseBytes: result.releaseBytes,
  browserQualification: result.browserQualification,
};
await mkdir(evidenceDirectory, { recursive: true });
await writeFile(
  resolve(evidenceDirectory, "project-pages-qualification.json"),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
