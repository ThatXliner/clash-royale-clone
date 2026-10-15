#!/bin/bash
set -u
ROOT=/tmp/release-guard-path-001-builder-bd9125
RUN_DIR="$ROOT/artifacts/release-guard-path-round-1/builder/native-runs/negative-control-old-guard"
mkdir -p "$RUN_DIR"
NODE_BIN=/Users/me/.hermes/node/bin/node
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLAYWRIGHT=/tmp/cards023i-builder-4f19/node_modules/playwright/index.mjs
CLEAN_PATH=/Users/me/.hermes/node/bin:/Users/me/.local/bin:/usr/bin:/bin:/opt/homebrew/bin
printf '%s\n' 'env -i TMPDIR=/tmp node --test tests/release-001b-guards.test.js' > "$RUN_DIR/command.txt"
printf '%s\n' "$ROOT" > "$RUN_DIR/cwd.txt"
git -C "$ROOT" rev-parse HEAD > "$RUN_DIR/source-commit.txt"
shasum -a 256 "$ROOT/scripts/build-release.js" "$ROOT/tests/release-001b-guards.test.js" > "$RUN_DIR/source-hashes.txt"
"$NODE_BIN" --version > "$RUN_DIR/node-version.txt"
env -i "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NODE_BIN" --test tests/release-001b-guards.test.js \
  > "$RUN_DIR/stdout.raw" 2> "$RUN_DIR/stderr.raw" &
child_pid=$!
printf '%s\n' "$child_pid" > "$RUN_DIR/pid.txt"
wait "$child_pid"
child_exit=$?
printf '%s\n' "$child_exit" > "$RUN_DIR/exit.txt"
shasum -a 256 "$RUN_DIR/command.txt" "$RUN_DIR/cwd.txt" "$RUN_DIR/source-commit.txt" \
  "$RUN_DIR/source-hashes.txt" "$RUN_DIR/node-version.txt" "$RUN_DIR/pid.txt" \
  "$RUN_DIR/stdout.raw" "$RUN_DIR/stderr.raw" "$RUN_DIR/exit.txt" > "$RUN_DIR/sha256.txt"
printf 'NEGATIVE_CONTROL_EXIT=%s PID=%s RUN_DIR=%s\n' "$child_exit" "$child_pid" "$RUN_DIR"
if [[ "$child_exit" -eq 1 ]]; then exit 0; fi
exit 1
