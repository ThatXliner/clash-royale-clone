#!/bin/sh
set -u
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
BASELINE_ROOT=/private/tmp/game-001htjx-game-opponent-accepted-main-4669996
IMMUTABLE_BASELINE_ROOT=/private/tmp/game-001htjx-baseline
RECORD_ROOT=/private/tmp/game-001htjx-r2-gates-591512ba/record/accepted-parent-game-opponent
NODE_BIN_DIR=/Users/me/.hermes/node/bin
NODE_BINARY=/Users/me/.hermes/node/bin/node
ENV_BIN=/usr/bin/env
CHROME_BINARY=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
PLAYWRIGHT_ENTRY=/private/tmp/game-001htjx-game-opponent-accepted-main-4669996/node_modules/playwright/index.mjs
RUNTIME_PATH="$NODE_BIN_DIR:/usr/bin:/bin:/usr/sbin:/sbin"
[ "$(/usr/bin/git -C "$BASELINE_ROOT" rev-parse HEAD)" = "4669996c5b8a37c621cfe81dd0ac522f17934e64" ] || exit 2
[ -z "$(/usr/bin/git -C "$BASELINE_ROOT" status --porcelain --untracked-files=all)" ] || exit 2
[ "$(/usr/bin/git -C "$BASELINE_ROOT" rev-parse HEAD:tests/game-opponent.test.js)" = "$(/usr/bin/git -C /private/tmp/game-001htjx-round2-builder-591512b rev-parse HEAD:tests/game-opponent.test.js)" ] || exit 2
/usr/bin/git -C "$BASELINE_ROOT" rev-parse HEAD > "$RECORD_ROOT/source-commit.txt"
/usr/bin/git -C "$BASELINE_ROOT" rev-parse HEAD:tests/game-opponent.test.js > "$RECORD_ROOT/game-opponent-test-blob.txt"
/usr/bin/shasum -a 256 "$BASELINE_ROOT/tests/game-opponent.test.js" > "$RECORD_ROOT/game-opponent-test.sha256"
printf '%s\n' "$BASELINE_ROOT" > "$RECORD_ROOT/cwd.txt"
printf '%s\n' "$ENV_BIN" -i > "$RECORD_ROOT/argv.txt"
printf '%s\n' "PATH=$RUNTIME_PATH" "HOME=$RECORD_ROOT/home" "TMPDIR=$RECORD_ROOT/tmp" "SHARED_COMBAT_BASELINE_ROOT=$IMMUTABLE_BASELINE_ROOT" "GAME001HTJX_RUNTIME_RELEASE=1" "GAME_BROWSER_CHROME=$CHROME_BINARY" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT_ENTRY" "PLAYWRIGHT_PACKAGE_ROOT=$BASELINE_ROOT/node_modules/playwright" "PLAYWRIGHT_BROWSERS_PATH=$RECORD_ROOT/playwright-browsers" "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1" "npm_config_cache=$RECORD_ROOT/npm-cache" LANG=C LC_ALL=C CI=1 NO_COLOR=1 > "$RECORD_ROOT/env.tsv"
printf '%s\n' "$NODE_BINARY" --test tests/game-opponent.test.js >> "$RECORD_ROOT/argv.txt"
cd "$BASELINE_ROOT" || exit 2
/usr/bin/env -i \
  "PATH=$RUNTIME_PATH" \
  "HOME=$RECORD_ROOT/home" \
  "TMPDIR=$RECORD_ROOT/tmp" \
  "SHARED_COMBAT_BASELINE_ROOT=$IMMUTABLE_BASELINE_ROOT" \
  GAME001HTJX_RUNTIME_RELEASE=1 \
  "GAME_BROWSER_CHROME=$CHROME_BINARY" \
  "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT_ENTRY" \
  "PLAYWRIGHT_PACKAGE_ROOT=$BASELINE_ROOT/node_modules/playwright" \
  "PLAYWRIGHT_BROWSERS_PATH=$RECORD_ROOT/playwright-browsers" \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  "npm_config_cache=$RECORD_ROOT/npm-cache" \
  npm_config_update_notifier=false LANG=C LC_ALL=C CI=1 NO_COLOR=1 \
  "$NODE_BINARY" --test tests/game-opponent.test.js > "$RECORD_ROOT/stdout.raw" 2> "$RECORD_ROOT/stderr.raw" &
direct_pid=$!
printf '%s\n' "$direct_pid" > "$RECORD_ROOT/direct-pid.txt"
wait "$direct_pid"
direct_exit=$?
printf '%s\n' "$direct_exit" > "$RECORD_ROOT/exit-code.txt"
exit "$direct_exit"
