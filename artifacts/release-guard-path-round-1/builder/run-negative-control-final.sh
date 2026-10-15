#!/bin/bash
set -u
ROOT=/tmp/release-guard-path-001-builder-bd9125
NEG_ROOT=/tmp/release-guard-path-001-negative-control-bd9125
RUN_DIR="$ROOT/artifacts/release-guard-path-round-1/builder/native-runs/negative-control-final-old-script"
NODE_BIN=/Users/me/.hermes/node/bin/node
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLAYWRIGHT=/tmp/cards023i-builder-4f19/node_modules/playwright/index.mjs
CLEAN_PATH=/Users/me/.hermes/node/bin:/Users/me/.local/bin:/usr/bin:/bin:/opt/homebrew/bin
mkdir -p "$RUN_DIR"
if [[ -e "$NEG_ROOT" ]]; then
  printf 'Negative-control checkout path already exists: %s\n' "$NEG_ROOT" >&2
  exit 2
fi
git -C "$ROOT" worktree add --detach "$NEG_ROOT" bd9125a06b529317a27ad4c176f4abe4d17fce78 > "$RUN_DIR/worktree.stdout.raw" 2> "$RUN_DIR/worktree.stderr.raw"
git -C "$ROOT" rev-parse HEAD > "$RUN_DIR/candidate-commit.txt"
git -C "$NEG_ROOT" rev-parse HEAD > "$RUN_DIR/old-source-commit.txt"
cp "$ROOT/tests/release-001b-guards.test.js" "$NEG_ROOT/tests/release-001b-guards.test.js"
ln -s /tmp/cards023i-builder-4f19/node_modules "$NEG_ROOT/node_modules"
shasum -a 256 "$ROOT/scripts/build-release.js" "$NEG_ROOT/scripts/build-release.js" "$NEG_ROOT/tests/release-001b-guards.test.js" > "$RUN_DIR/source-hashes.txt"
if ! /usr/bin/grep -q '7367a80508a1b9c1368e1886144bddfd6027b3cbefa8f63aed45bb6249792d60' "$RUN_DIR/source-hashes.txt"; then
  printf 'Immutable accepted-main script hash did not match the captured old source.\n' >&2
  git -C "$ROOT" worktree remove --force "$NEG_ROOT"
  exit 3
fi
printf '%s\n' 'env -i TMPDIR=/tmp node --test tests/release-001b-guards.test.js' > "$RUN_DIR/command.txt"
printf '%s\n' "$NEG_ROOT" > "$RUN_DIR/cwd.txt"
cd "$NEG_ROOT"
env -i "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NODE_BIN" --test tests/release-001b-guards.test.js \
  > "$RUN_DIR/stdout.raw" 2> "$RUN_DIR/stderr.raw" &
child_pid=$!
printf '%s\n' "$child_pid" > "$RUN_DIR/pid.txt"
wait "$child_pid"
child_exit=$?
printf '%s\n' "$child_exit" > "$RUN_DIR/exit.txt"
shasum -a 256 "$RUN_DIR/candidate-commit.txt" "$RUN_DIR/old-source-commit.txt" \
  "$RUN_DIR/source-hashes.txt" "$RUN_DIR/command.txt" "$RUN_DIR/cwd.txt" \
  "$RUN_DIR/pid.txt" "$RUN_DIR/stdout.raw" "$RUN_DIR/stderr.raw" "$RUN_DIR/exit.txt" \
  > "$RUN_DIR/sha256.txt"
git -C "$ROOT" worktree remove --force "$NEG_ROOT"
printf 'FINAL_NEGATIVE_CONTROL_EXIT=%s PID=%s RUN_DIR=%s\n' "$child_exit" "$child_pid" "$RUN_DIR"
if [[ "$child_exit" -eq 1 ]]; then exit 0; fi
exit 1
