import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { buildRelease } from "../scripts/build-release.js";

const WORKSPACE = resolve(new URL("../", import.meta.url).pathname);
const HOST_SCRIPT = join(WORKSPACE, "scripts/serve-release.js");

test("local release host serves manifest bytes and rejects same-origin paths outside it", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "release-host-real-build-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const output = join(temporary, "artifact");
  const built = await buildRelease({ output });
  const manifest = JSON.parse(await readFile(join(output, "release-manifest.json"), "utf8"));
  assert.equal(manifest.fileCount, built.fileCount);

  const child = spawn(process.execPath, [HOST_SCRIPT, "--root", output, "--port", "0"], {
    cwd: WORKSPACE,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stderr = "";
  const requestRecords = [];
  const logWaiters = [];
  child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
  const lines = createInterface({ input: child.stdout });
  const ready = new Promise((resolveReady, rejectReady) => {
    lines.on("line", (line) => {
      try {
        const record = JSON.parse(line);
        if (record.type === "listening") resolveReady(record);
        else {
          requestRecords.push(record);
          logWaiters.shift()?.(record);
        }
      } catch (error) {
        rejectReady(error);
      }
    });
    child.once("error", rejectReady);
    child.once("exit", (code) => rejectReady(
      new Error(`release host exited before listening (${code}): ${stderr}`),
    ));
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    lines.close();
  });

  const listening = await ready;
  const request = async (url, options) => {
    const logged = new Promise((resolveLog) => logWaiters.push(resolveLog));
    const response = await fetch(url, options);
    return { logged: await logged, response };
  };
  const entryPath = manifest.entrypoints[0];
  const { logged: listedLog, response: listed } = await request(listening.url);
  assert.equal(listed.status, 200);
  assert.deepEqual(listedLog, { method: "GET", path: entryPath, status: 200 });
  const listedBytes = Buffer.from(await listed.arrayBuffer());
  const listedEntry = manifest.files.find(({ path }) => path === entryPath);
  assert.equal(createHash("sha256").update(listedBytes).digest("hex"), listedEntry.sha256);
  assert.deepEqual(listedBytes, await readFile(join(output, ...entryPath.split("/"))));

  const origin = new URL(listening.url).origin;
  const deniedPaths = [
    "/__same_origin_off_manifest__",
    "/reference/stats/cards.json",
    "/release-manifest.json",
  ];
  for (const path of deniedPaths) {
    const { logged, response } = await request(`${origin}${path}`);
    assert.equal(response.status, 404, `${path} must be denied`);
    assert.deepEqual(logged, { method: "GET", path: path.slice(1), status: 404 });
    assert.equal(await response.text(), "");
  }

  const { logged: headLog, response: head } = await request(listening.url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.deepEqual(headLog, { method: "HEAD", path: entryPath, status: 200 });
  assert.equal(await head.text(), "");
  const { logged: postLog, response: post } = await request(listening.url, { method: "POST" });
  assert.equal(post.status, 405);
  assert.deepEqual(postLog, { method: "POST", path: entryPath, status: 405 });
  assert.equal(post.headers.get("allow"), "GET, HEAD");
  assert.equal(requestRecords.length, 6);
});
