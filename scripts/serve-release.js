#!/usr/bin/env node

import { createHash } from "node:crypto";
import { lstat, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const MANIFEST_NAME = "release-manifest.json";
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".wav", "audio/wav"],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function validateManifest(manifest) {
  invariant(manifest?.schemaVersion === 1, "unsupported release manifest schema");
  invariant(Array.isArray(manifest.entrypoints) && manifest.entrypoints.length > 0,
    "release manifest has no entrypoint");
  invariant(Array.isArray(manifest.files) && manifest.files.length > 0,
    "release manifest has no files");
  invariant(manifest.fileCount === manifest.files.length, "release manifest file count mismatch");

  const files = new Map();
  let totalBytes = 0;
  for (const file of manifest.files) {
    invariant(typeof file?.path === "string" && file.path.length > 0,
      "release manifest contains an invalid path");
    const parts = file.path.split("/");
    invariant(!file.path.includes("\\") && !file.path.startsWith("/") &&
      parts.every((part) => part && part !== "." && part !== ".." &&
        part.toLowerCase() !== "reference"),
    `release manifest contains a forbidden path: ${file.path}`);
    invariant(file.path !== MANIFEST_NAME, "release manifest cannot serve itself");
    invariant(Number.isSafeInteger(file.size) && file.size >= 0,
      `release manifest contains an invalid size: ${file.path}`);
    invariant(typeof file.sha256 === "string" && /^[a-f0-9]{64}$/u.test(file.sha256),
      `release manifest contains an invalid hash: ${file.path}`);
    invariant(!files.has(file.path), `release manifest contains a duplicate path: ${file.path}`);
    files.set(file.path, file);
    totalBytes += file.size;
  }
  invariant(Number.isSafeInteger(manifest.totalBytes) && manifest.totalBytes === totalBytes,
    "release manifest total byte count mismatch");
  for (const entrypoint of manifest.entrypoints) {
    invariant(files.has(entrypoint), `release manifest entrypoint is not listed: ${entrypoint}`);
  }
  return files;
}

async function artifactManifest(root) {
  const rootReal = await realpath(resolve(root));
  const manifestBytes = await readFile(join(rootReal, MANIFEST_NAME));
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString("utf8"));
  } catch {
    throw new Error("release manifest is not valid JSON");
  }
  return { files: validateManifest(manifest), manifest, root: rootReal };
}

function send(response, status, body = "", headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  response.end(body);
}

export async function createReleaseServer({ root = DEFAULT_ROOT } = {}) {
  const artifact = await artifactManifest(root);
  const server = createServer((request, response) => {
    void (async () => {
      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      } catch {
        send(response, 404);
        process.stdout.write(`${JSON.stringify({
          method: request.method,
          path: "<invalid-url>",
          status: 404,
        })}\n`);
        return;
      }

      const path = pathname.startsWith("/") ? pathname.slice(1) : pathname;
      let status = 404;
      let bytes;
      const entry = artifact.files.get(path);
      if (request.method !== "GET" && request.method !== "HEAD") {
        send(response, 405, "", { Allow: "GET, HEAD" });
        status = 405;
      } else if (entry) {
        try {
          const absolute = join(artifact.root, ...path.split("/"));
          const info = await lstat(absolute);
          const actual = await realpath(absolute);
          if (info.isFile() && !info.isSymbolicLink() && isWithin(artifact.root, actual)) {
            bytes = await readFile(absolute);
            const digest = createHash("sha256").update(bytes).digest("hex");
            if (bytes.length === entry.size && digest === entry.sha256) status = 200;
            else bytes = undefined;
          }
        } catch {
          bytes = undefined;
        }
        if (status === 200) {
          send(response, status, request.method === "HEAD" ? "" : bytes, {
            "Content-Length": entry.size,
            "Content-Type": MIME_TYPES.get(extname(path).toLowerCase()) ??
              "application/octet-stream",
          });
        } else {
          send(response, 404);
        }
      } else {
        send(response, 404);
      }

      process.stdout.write(`${JSON.stringify({ method: request.method, path, status })}\n`);
    })().catch(() => send(response, 500));
  });
  return { manifest: artifact.manifest, server };
}

function parseArguments(argv) {
  let root = DEFAULT_ROOT;
  let port = 4173;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    const value = argv[index + 1];
    invariant(value !== undefined, `${name} requires a value`);
    index += 1;
    if (name === "--root") root = resolve(value);
    else if (name === "--port") {
      port = Number(value);
      invariant(Number.isInteger(port) && port >= 0 && port <= 65535,
        "--port must be an integer between 0 and 65535");
    } else throw new Error(`unknown argument: ${name}`);
  }
  return { port, root };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { port, root } = parseArguments(process.argv.slice(2));
    const { manifest, server } = await createReleaseServer({ root });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      process.stdout.write(`${JSON.stringify({
        type: "listening",
        url: `http://127.0.0.1:${address.port}/${manifest.entrypoints[0]}`,
      })}\n`);
    });
    const stop = () => server.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    process.stderr.write(`release host failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
