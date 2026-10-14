import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const expected = {
  commit: "bf1e6120196db8a2927ce6ae893812e4c9b1115d",
  portraitBytes: 65_626,
  portraitSha256: "38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240",
};
const urls = {
  landing: "https://bryanhu.com/clash-royale-clone/",
  game: "https://bryanhu.com/clash-royale-clone/game/public/index.html",
  kilnkeeperPortrait: "https://bryanhu.com/clash-royale-clone/game/public/assets/kilnkeeper-portrait-painted.webp",
};

async function capture(url) {
  const response = await fetch(url, { redirect: "follow" });
  const body = Buffer.from(await response.arrayBuffer());
  return {
    url,
    status: response.status,
    finalUrl: response.url,
    headers: {
      contentType: response.headers.get("content-type"),
      date: response.headers.get("date"),
      lastModified: response.headers.get("last-modified"),
      etag: response.headers.get("etag"),
    },
    bytes: body.length,
    sha256: createHash("sha256").update(body).digest("hex"),
    ...(url === urls.landing
      ? { containsFullReleaseCommit: body.includes(Buffer.from(expected.commit)) }
      : {}),
  };
}

const capturedAtUtc = new Date().toISOString();
const [landing, game, kilnkeeperPortrait] = await Promise.all([
  capture(urls.landing),
  capture(urls.game),
  capture(urls.kilnkeeperPortrait),
]);
const evidence = {
  schemaVersion: 1,
  capturedAtUtc,
  repository: "ThatXliner/clash-royale-clone",
  release: {
    ref: "main",
    commit: expected.commit,
    workflow: {
      name: "Publish GitHub Pages",
      runId: 38_510_398_827,
      url: "https://github.com/ThatXliner/clash-royale-clone/actions/runs/38510398827",
      status: "completed",
      conclusion: "success",
      source: "github-workflow-38510398827.json",
    },
  },
  live: { landing, game, kilnkeeperPortrait },
  checks: {
    landingHttp200: landing.status === 200,
    landingIdentifiesFullReleaseCommit: landing.containsFullReleaseCommit,
    gameHttp200: game.status === 200,
    portraitHttp200: kilnkeeperPortrait.status === 200,
    portraitMatchesCheckedInBytes:
      kilnkeeperPortrait.bytes === expected.portraitBytes &&
      kilnkeeperPortrait.sha256 === expected.portraitSha256,
  },
};

assert.equal(landing.status, 200, "public landing page must return HTTP 200");
assert.equal(landing.containsFullReleaseCommit, true,
  "public landing page must identify the full verified release commit");
assert.equal(game.status, 200, "public game HTML must return HTTP 200");
assert.equal(kilnkeeperPortrait.status, 200, "public Kilnkeeper portrait must return HTTP 200");
assert.equal(kilnkeeperPortrait.bytes, expected.portraitBytes,
  "public portrait byte length must match the checked-in source asset");
assert.equal(kilnkeeperPortrait.sha256, expected.portraitSha256,
  "public portrait bytes must match the checked-in source asset hash");

const output = `${JSON.stringify(evidence, null, 2)}\n`;
await writeFile(resolve(root, "artifacts/coverage004-round-4/builder/live-release-evidence.json"), output);
process.stdout.write(output);
