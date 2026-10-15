import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { buildPages } from "/private/tmp/release-guard-round2-critic-5578e25c51f2/scripts/build-pages.js";

const candidate = "46c542a10df358902fa1147e6d2b7ad04ea80d57";
const repository = "ThatXliner/clash-royale-clone";
const output = "/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/critic/independent-5578e25c51f2/generated/full-pages-candidate";
const result = await buildPages({ output, repository, ref: candidate });
const receipt = {
  candidate,
  repository,
  ref: result.ref,
  pagesPrefix: "/clash-royale-clone/",
  output: result.output,
  releaseFileCount: result.fileCount,
  releaseBytes: result.releaseBytes,
  browserQualification: result.browserQualification,
};
const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
await writeFile("/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/release-guard-round-2/critic/independent-5578e25c51f2/pages-build-receipt.json", bytes);
process.stdout.write(JSON.stringify({
  candidate,
  repository,
  ref: result.ref,
  pagesPrefix: "/clash-royale-clone/",
  output: result.output,
  releaseFileCount: result.fileCount,
  releaseBytes: result.releaseBytes,
  browserRequests: result.browserQualification.requestCount,
  pagesFiles: result.browserQualification.pagesFileCount,
  qualificationModules: result.browserQualification.modules.map(({ path, imported }) => ({ path, imported })),
  receiptSha256: createHash("sha256").update(bytes).digest("hex"),
}) + "\n");
