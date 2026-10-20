#!/usr/bin/env node

import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = resolve(SCRIPT_DIR, "..");
const args = process.argv.slice(2);
const separator = args.indexOf("--");
const command = separator < 0 ? [] : args.slice(separator + 1);

if (command.length === 0) {
  process.stderr.write("Usage: node scripts/test-portable.js -- <command> [args...]\n");
  process.exitCode = 2;
} else {
  try {
    const environment = { ...process.env };
    const configuredPlaywright = environment.GAME_BROWSER_PLAYWRIGHT;
    const playwrightEntry = configuredPlaywright === undefined
      ? fileURLToPath(import.meta.resolve("playwright"))
      : configuredPlaywright.startsWith("file:")
        ? fileURLToPath(configuredPlaywright)
        : resolve(WORKSPACE_ROOT, configuredPlaywright);
    environment.GAME_BROWSER_PLAYWRIGHT = playwrightEntry;
    const { chromium } = await import(pathToFileURL(playwrightEntry).href);
    environment.GAME_BROWSER_CHROME ??= resolve(chromium.executablePath());

    const child = spawn(command[0], command.slice(1), {
      cwd: WORKSPACE_ROOT,
      env: environment,
      stdio: "inherit",
    });
    child.once("error", (error) => {
      process.stderr.write(`portable test command failed: ${error.message}\n`);
      process.exitCode = 1;
    });
    child.once("exit", (code, signal) => {
      if (signal) process.exitCode = 1;
      else process.exitCode = code ?? 1;
    });
  } catch (error) {
    process.stderr.write(`portable test setup failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
