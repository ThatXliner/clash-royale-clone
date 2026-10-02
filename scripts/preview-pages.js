#!/usr/bin/env node

import { lstat, readFile, realpath } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const DEFAULT_ROOT = resolve(fileURLToPath(new URL("../site-dist/", import.meta.url)));
const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".gif", "image/gif"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".md", "text/markdown; charset=utf-8"],
  [".ogg", "audio/ogg"],
  [".otf", "font/otf"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".ttf", "font/ttf"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webp", "image/webp"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isWithin(parent, child) {
  const path = relative(parent, child);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !isAbsolute(path));
}

function send(response, status, body = "", headers = {}) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    ...headers,
  });
  response.end(body);
}

export async function createPagesPreviewServer({ root = DEFAULT_ROOT, basePath = "" } = {}) {
  invariant(basePath === "" || (typeof basePath === "string" &&
    /^\/(?:[A-Za-z0-9._~-]+\/)*$/u.test(basePath) &&
    basePath.split("/").every((part) => part !== "." && part !== "..")),
  "Pages preview base path must be empty or a simple slash-delimited URL path");
  const mountPath = basePath === "/" ? "" : basePath;
  let rootReal;
  try {
    rootReal = await realpath(resolve(root));
  } catch (error) {
    if (error?.code === "ENOENT")
      throw new Error(`Pages artifact not found at ${resolve(root)}; run npm run build:pages first`);
    throw error;
  }
  const rootInfo = await lstat(rootReal);
  invariant(rootInfo.isDirectory() && !rootInfo.isSymbolicLink(),
    "Pages preview root must be a regular directory");

  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== "GET" && request.method !== "HEAD") {
        send(response, 405, "", { Allow: "GET, HEAD" });
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(new URL(request.url, "http://127.0.0.1").pathname);
      } catch {
        send(response, 404);
        return;
      }
      if (pathname.includes("\\") || pathname.includes("\0")) {
        send(response, 404);
        return;
      }
      if (mountPath) {
        const pathWithoutTrailingSlash = mountPath.slice(0, -1);
        if (pathname === pathWithoutTrailingSlash) pathname = mountPath;
        if (!pathname.startsWith(mountPath)) {
          send(response, 404);
          return;
        }
        pathname = pathname.slice(mountPath.length - 1);
      }
      if (pathname === "/game" || pathname === "/game/") pathname = "/game/index.html";
      else if (pathname === "/") pathname = "/index.html";
      else if (pathname.endsWith("/")) pathname = `${pathname}index.html`;

      const absolute = resolve(rootReal, `.${pathname}`);
      if (!isWithin(rootReal, absolute)) {
        send(response, 404);
        return;
      }

      let bytes;
      try {
        const info = await lstat(absolute);
        const actual = await realpath(absolute);
        if (info.isFile() && !info.isSymbolicLink() && isWithin(rootReal, actual))
          bytes = await readFile(absolute);
      } catch {
        bytes = undefined;
      }
      if (bytes === undefined) {
        send(response, 404);
        return;
      }
      send(response, 200, request.method === "HEAD" ? "" : bytes, {
        "Content-Length": bytes.length,
        "Content-Type": ["license", "notice"].includes(basename(absolute).toLowerCase())
          ? "text/plain; charset=utf-8"
          : MIME_TYPES.get(extname(absolute).toLowerCase()) ?? "application/octet-stream",
      });
      process.stdout.write(`${JSON.stringify({ method: request.method, path: pathname, status: 200 })}\n`);
    })().catch(() => send(response, 500));
  });
  return { root: rootReal, server };
}

function parseArguments(argv) {
  const options = { basePath: "", port: 4174, root: DEFAULT_ROOT };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    invariant(flag === "--root" || flag === "--port" || flag === "--base-path",
      `unknown argument: ${flag}`);
    const value = argv[index + 1];
    invariant(value !== undefined && !value.startsWith("--"), `${flag} requires a value`);
    index += 1;
    if (flag === "--root") options.root = resolve(value);
    else if (flag === "--base-path") options.basePath = value;
    else {
      options.port = Number(value);
      invariant(Number.isInteger(options.port) && options.port >= 0 && options.port <= 65535,
        "--port must be an integer between 0 and 65535");
    }
  }
  return options;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    const { basePath, port, root } = parseArguments(process.argv.slice(2));
    const { server } = await createPagesPreviewServer({ root, basePath });
    server.listen(port, "127.0.0.1", () => {
      const address = server.address();
      process.stdout.write(`Pages preview: http://127.0.0.1:${address.port}${basePath || "/"}\n`);
    });
    const stop = () => server.close();
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  } catch (error) {
    process.stderr.write(`Pages preview failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
