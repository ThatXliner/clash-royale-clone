import { createWriteStream, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

const suites = {
  projection: ["tests/game-ui-projection-runner.js", "game-ui-projection"],
  loop: ["tests/game-browser-loop-runner.js", "game-browser-loop"],
};
const name = process.argv[2];
if (!Object.hasOwn(suites, name)) throw new TypeError("suite must be projection or loop");
const output = resolve("artifacts/frame-restore-round3/builder", `${name}-suite`);
mkdirSync(output, { recursive: true });
const [script, selector] = suites[name];
const startedAt = new Date().toISOString();
const child = spawn(process.execPath, [script, selector], { stdio: ["ignore", "pipe", "pipe"] });
writeFileSync(resolve(output, "runner-pid.txt"), `${child.pid}\n`);
const stdout = createWriteStream(resolve(output, "runner.tap.txt"));
const stderr = createWriteStream(resolve(output, "runner.stderr.txt"));
child.stdout.pipe(stdout);
child.stderr.pipe(stderr);
child.on("error", (error) => {
  writeFileSync(resolve(output, "runner-exit.json"), `${JSON.stringify({ pid: child.pid, startedAt, endedAt: new Date().toISOString(), error: String(error) }, null, 2)}\n`);
  process.exitCode = 1;
});
child.on("close", (exitCode, signal) => {
  stdout.end();
  stderr.end();
  writeFileSync(resolve(output, "runner-exit.json"), `${JSON.stringify({ pid: child.pid, startedAt, endedAt: new Date().toISOString(), exitCode, signal }, null, 2)}\n`);
  process.exitCode = exitCode ?? 1;
  process.stdout.write(`${JSON.stringify({ suite: name, pid: child.pid, exitCode, signal, output })}\n`);
});
