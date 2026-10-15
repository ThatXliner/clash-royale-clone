#!/bin/sh
set -u
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH
ROOT=/private/tmp/game-001htjx-game-battle-accepted-main-9e043008
REC=/private/tmp/game-001htjx-game-battle-baseline-repro-9e043008
NODE=/Users/me/.hermes/node/bin/node
CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
PW="$ROOT/node_modules/playwright/index.mjs"
BASELINE=/private/tmp/game-001htjx-baseline
EXPECTED_HEAD=9e04300816d5e6b2c94001ba221c0e89b6da2efe
[ ! -e "$REC" ] || { printf 'refusing to overwrite %s\n' "$REC" >&2; exit 2; }
mkdir -p "$REC/home" "$REC/tmp" "$REC/npm-cache" "$REC/playwright-browsers" || exit 2
actual_head=$(/usr/bin/git -C "$ROOT" rev-parse HEAD) || exit 2
[ "$actual_head" = "$EXPECTED_HEAD" ] || { printf 'wrong accepted-main HEAD: %s\n' "$actual_head" >&2; exit 2; }
status=$(/usr/bin/git -C "$ROOT" status --porcelain --untracked-files=all) || exit 2
[ -z "$status" ] || { printf 'accepted-main worktree dirty: %s\n' "$status" >&2; exit 2; }
[ -f "$PW" ] || { printf 'private Playwright entry missing: %s\n' "$PW" >&2; exit 2; }
{
  printf 'accepted_main_head\t%s\n' "$actual_head"
  printf 'baseline_root\t%s\n' "$BASELINE"
  printf 'node_binary\t%s\n' "$NODE"
  printf 'chrome_binary\t%s\n' "$CHROME"
  printf 'GAME_BROWSER_PLAYWRIGHT\t%s\n' "$PW"
} > "$REC/qualification.tsv"
printf 'source\tsha256\tpath\n' > "$REC/source-fences.tsv"
for path in \
  "$ROOT/tests/game-battle.test.js" \
  "$ROOT/src/sim/battle-continuation-kernel.js" \
  /private/tmp/game-001htjx-runtime-prepared-7a75c24/tests/game-battle.test.js \
  /private/tmp/game-001htjx-runtime-prepared-7a75c24/src/sim/battle-continuation-kernel.js; do
  [ -f "$path" ] || { printf 'missing source fence: %s\n' "$path" >&2; exit 2; }
  /usr/bin/shasum -a 256 "$path" | /usr/bin/awk -v path="$path" '{ print path "\t" $1 "\t" path }' >> "$REC/source-fences.tsv"
done
printf '%s\n' /usr/bin/env -i \
  "PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  "HOME=$REC/home" "TMPDIR=$REC/tmp" \
  "SHARED_COMBAT_BASELINE_ROOT=$BASELINE" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PW" \
  "PLAYWRIGHT_BROWSERS_PATH=$REC/playwright-browsers" \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  "PLAYWRIGHT_PACKAGE_ROOT=$ROOT/node_modules/playwright" \
  "npm_config_cache=$REC/npm-cache" npm_config_update_notifier=false \
  LANG=C LC_ALL=C CI=1 NO_COLOR=1 \
  "$NODE" --test tests/game-battle.test.js > "$REC/argv.txt"
printf 'PATH\t%s\nHOME\t%s\nTMPDIR\t%s\nSHARED_COMBAT_BASELINE_ROOT\t%s\nGAME_BROWSER_CHROME\t%s\nGAME_BROWSER_PLAYWRIGHT\t%s\nPLAYWRIGHT_BROWSERS_PATH\t%s\nPLAYWRIGHT_SKIP_BROWSER_DOWNLOAD\t1\nPLAYWRIGHT_PACKAGE_ROOT\t%s/node_modules/playwright\nnpm_config_cache\t%s\nnpm_config_update_notifier\tfalse\nLANG\tC\nLC_ALL\tC\nCI\t1\nNO_COLOR\t1\n' \
  '/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin' "$REC/home" "$REC/tmp" "$BASELINE" "$CHROME" "$PW" "$REC/playwright-browsers" "$ROOT" "$REC/npm-cache" > "$REC/env.tsv"
cd "$ROOT" || exit 2
/bin/pwd -P > "$REC/cwd.txt"
printf 'START\tgame-battle.test.js\tcwd=%s\n' "$ROOT"
/usr/bin/env -i \
  "PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin" \
  "HOME=$REC/home" "TMPDIR=$REC/tmp" \
  "SHARED_COMBAT_BASELINE_ROOT=$BASELINE" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PW" \
  "PLAYWRIGHT_BROWSERS_PATH=$REC/playwright-browsers" \
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
  "PLAYWRIGHT_PACKAGE_ROOT=$ROOT/node_modules/playwright" \
  "npm_config_cache=$REC/npm-cache" npm_config_update_notifier=false \
  LANG=C LC_ALL=C CI=1 NO_COLOR=1 \
  "$NODE" --test tests/game-battle.test.js > "$REC/stdout" 2> "$REC/stderr" &
pid=$!
printf '%s\n' "$pid" > "$REC/direct.pid"
printf 'START\tpid=%s\n' "$pid"
wait "$pid"
code=$?
printf '%s\n' "$code" > "$REC/exit-code"
printf 'EXIT\tdirect=%s\n' "$code"
exit "$code"
