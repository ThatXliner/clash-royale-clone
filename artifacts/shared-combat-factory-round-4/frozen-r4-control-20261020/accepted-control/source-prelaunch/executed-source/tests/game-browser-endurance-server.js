import { createReadStream, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, relative, sep } from "node:path";

const root = realpathSync(new URL("..", import.meta.url).pathname);
const requestedPort = Number(process.argv.find((value) => value.startsWith("--port="))
  ?.slice("--port=".length) ?? 0);
if (!Number.isSafeInteger(requestedPort) || requestedPort < 0 || requestedPort > 65_535) {
  throw new TypeError("game browser endurance server port is invalid");
}

const types = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
]);

const server = createServer((request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    if (pathname === "/favicon.ico") {
      response.writeHead(204, { "Cache-Control": "no-store" }); response.end(); return;
    }
    const relativePath = pathname === "/" ? "public/ui-arena-shell.html" : pathname.slice(1);
    const candidate = realpathSync(join(root, relativePath));
    const fromRoot = relative(root, candidate);
    if (fromRoot.startsWith(`..${sep}`) || fromRoot === ".." || statSync(candidate).isDirectory()) {
      response.writeHead(404); response.end(); return;
    }
    response.writeHead(200, { "Cache-Control": "no-store",
      "Content-Type": types.get(extname(candidate)) ?? "application/octet-stream" });
    createReadStream(candidate).pipe(response);
  } catch {
    response.writeHead(404); response.end();
  }
});

server.listen(requestedPort, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`${JSON.stringify({ host: "127.0.0.1", port: address.port })}\n`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.closeAllConnections?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 500).unref();
  });
}
