#!/bin/sh
set -u
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

EXPECTED_CANDIDATE=d49ea27509c710939a8f493e5122f359f2bab85c
EXPECTED_BASELINE=7f41167c2429eec637dbb7c5f838fa3b404ab4d2
EXPECTED_CANDIDATE_ROOT=/private/tmp/game-001htjx-runtime-prepared-7a75c24
EXPECTED_BASELINE_ROOT=/private/tmp/game-001htjx-baseline
OLD_RUNTIME_ROOT=/private/tmp/game-001htjx-runtime
RELEASE_FENCE_ENV=GAME001HTJX_RUNTIME_RELEASE
BASELINE_ROOT_ENV=SHARED_COMBAT_BASELINE_ROOT
NODE_BIN_DIR=/Users/me/.hermes/node/bin
NODE_BINARY=/Users/me/.hermes/node/bin/node
NPM_BINARY=/Users/me/.hermes/node/bin/npm
EXPECTED_NPM_VERSION=10.9.8
EXPECTED_CHROME=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
CHROME_INFO_PLIST=/Applications/Google\ Chrome.app/Contents/Info.plist
EXPECTED_CHROME_VERSION=155.0.8059.40
EXPECTED_PLAYWRIGHT_VERSION=1.58.2
EXPECTED_PLAYWRIGHT_ENTRY=/private/tmp/game-001htjx-runtime-prepared-7a75c24/node_modules/playwright/index.mjs
EXPECTED_VITE_VERSION=8.3.2
SYSTEM_PATH=/usr/bin:/bin:/usr/sbin:/sbin
record_root=

fail() {
  message=$1
  printf '%s\n' "$message" >&2
  if [ -n "${record_root:-}" ] && [ -d "$record_root" ]; then
    printf '%s\n' "$message" >> "$record_root/preflight.stderr"
  fi
  exit 2
}

[ "$#" -eq 2 ] || fail "usage: GAME001HTJX_RUNTIME_RELEASE=1 SHARED_COMBAT_BASELINE_ROOT=/private/tmp/game-001htjx-baseline $0 $EXPECTED_CANDIDATE_ROOT /private/tmp/game-001htjx-gates-retry-d49ea27"
[ "${GAME001HTJX_RUNTIME_RELEASE:-}" = "1" ] || fail "runtime fence closed; root must set ${RELEASE_FENCE_ENV}=1 only after the Aether runtime window closes and releases"
[ "${SHARED_COMBAT_BASELINE_ROOT:-}" = "$EXPECTED_BASELINE_ROOT" ] || fail "set ${BASELINE_ROOT_ENV} to the exact immutable baseline $EXPECTED_BASELINE_ROOT"

candidate_root=$(CDPATH= cd "$1" 2>/dev/null && pwd -P) || fail "candidate root is unavailable: $1"
baseline_root=$(CDPATH= cd "$SHARED_COMBAT_BASELINE_ROOT" 2>/dev/null && pwd -P) || fail "baseline root is unavailable: $SHARED_COMBAT_BASELINE_ROOT"
[ "$candidate_root" = "$EXPECTED_CANDIDATE_ROOT" ] || fail "candidate path mismatch: $candidate_root"
[ "$baseline_root" = "$EXPECTED_BASELINE_ROOT" ] || fail "baseline path mismatch: $baseline_root"

case "$2" in /*) ;; *) fail "gate record directory must be an absolute path" ;; esac
record_parent=$(CDPATH= cd "$(dirname "$2")" 2>/dev/null && pwd -P) || fail "gate record parent is unavailable"
record_root="$record_parent/$(basename "$2")"
case "$record_root/" in
  "$candidate_root/"*|"$baseline_root/"*|"$OLD_RUNTIME_ROOT/"*) fail "gate records must be outside candidate, baseline, and obsolete runtime checkouts" ;;
esac
[ ! -e "$record_root" ] || fail "refusing to overwrite gate records: $record_root"
mkdir "$record_root" || fail "cannot create gate record directory: $record_root"
mkdir -p "$record_root/home" "$record_root/tmp" "$record_root/npm-cache" "$record_root/playwright-browsers" "$record_root/preexisting-generated-reports" "$record_root/new-generated-reports" || fail "cannot create private runtime directories"
printf '%s\n' "$$" > "$record_root/recorder.pid"
recorder_sha=$(/usr/bin/shasum -a 256 "$0" 2>/dev/null | /usr/bin/awk '{print $1}') || fail "cannot hash recorder"
printf 'recorder_path\t%s\nrecorder_sha256\t%s\n' "$0" "$recorder_sha" > "$record_root/recorder.tsv"

candidate_head=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD 2>/dev/null) || fail "candidate is not a Git checkout"
baseline_head=$(/usr/bin/git -C "$baseline_root" rev-parse HEAD 2>/dev/null) || fail "baseline root must be a Git checkout"
[ "$candidate_head" = "$EXPECTED_CANDIDATE" ] || fail "candidate HEAD mismatch: $candidate_head"
candidate_parent=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD^ 2>/dev/null) || fail "cannot inspect candidate parent"
[ "$candidate_parent" = "7a75c24da75167f2be278b46cbddaba4eb19edc7" ] || fail "candidate parent mismatch: $candidate_parent"
[ "$baseline_head" = "$EXPECTED_BASELINE" ] || fail "baseline HEAD mismatch: $baseline_head"
candidate_dirty=$(/usr/bin/git -C "$candidate_root" status --porcelain --untracked-files=all 2>/dev/null) || fail "cannot inspect candidate status"
baseline_dirty=$(/usr/bin/git -C "$baseline_root" status --porcelain --untracked-files=all 2>/dev/null) || fail "cannot inspect baseline status"
[ -z "$candidate_dirty" ] || fail "candidate checkout is dirty: $candidate_dirty"
[ -z "$baseline_dirty" ] || fail "baseline checkout is dirty: $baseline_dirty"
[ -x "$NODE_BINARY" ] || fail "pinned Node binary is unavailable: $NODE_BINARY"
[ -x "$NPM_BINARY" ] || fail "pinned npm entry point is unavailable: $NPM_BINARY"
[ -x "$EXPECTED_CHROME" ] || fail "pinned Chrome binary is unavailable: $EXPECTED_CHROME"
[ -f "$candidate_root/node_modules/playwright/package.json" ] || fail "private Playwright package is unavailable"
[ -f "$EXPECTED_PLAYWRIGHT_ENTRY" ] || fail "private Playwright entry is unavailable: $EXPECTED_PLAYWRIGHT_ENTRY"
[ -f "$candidate_root/node_modules/playwright-core/package.json" ] || fail "private Playwright core package is unavailable"
[ -f "$candidate_root/node_modules/vite/package.json" ] || fail "private Vite package is unavailable"

GENERATED_REPORT_PATH="$candidate_root/artifacts/guard-002r-round-1/release-isolation-evidence.json"
GENERATED_REPORT_BACKUP="$record_root/preexisting-generated-reports/release-isolation-evidence.json"
GENERATED_REPORT_OUTPUT="$record_root/new-generated-reports/release-isolation-evidence.json"
[ -f "$GENERATED_REPORT_PATH" ] || fail "pre-existing release evidence is unavailable: $GENERATED_REPORT_PATH"
/bin/cp -p "$GENERATED_REPORT_PATH" "$GENERATED_REPORT_BACKUP" || fail "cannot preserve pre-existing release evidence"
original_report_sha=$(/usr/bin/shasum -a 256 "$GENERATED_REPORT_BACKUP" 2>/dev/null | /usr/bin/awk '{print $1}') || fail "cannot hash pre-existing release evidence"
printf 'preexisting_report\t%s\t%s\nnew_report\t%s\n' "$original_report_sha" "$GENERATED_REPORT_PATH" "$GENERATED_REPORT_OUTPUT" > "$record_root/generated-reports.tsv"

fence() {
  label=$1
  path=$2
  expected=$3
  [ -f "$path" ] || fail "source fence file is missing for $label: $path"
  actual=$(/usr/bin/shasum -a 256 "$path" 2>/dev/null | /usr/bin/awk '{print $1}') || fail "cannot hash $path"
  [ -n "$actual" ] || fail "cannot hash $path"
  [ "$actual" = "$expected" ] || fail "source fence mismatch for $label: $actual"
  printf '%s\t%s\t%s\n' "$label" "$actual" "$path" >> "$record_root/source-fences.tsv"
}

printf 'source\tsha256\tpath\n' > "$record_root/source-fences.tsv"
fence baseline-kernel "$baseline_root/src/sim/battle-continuation-kernel.js" 115c43146f5818c69a98120e856ddaa5d20243fced3609320d90edc7ae933bea
fence baseline-battle-combat-facade "$baseline_root/src/sim/battle-combat.js" a9adf0d16359077bd0453cf2b8716e817d0a47c78073cde25a8b44a0c4ce3922
fence baseline-game-session-adapter "$baseline_root/src/sim/game-session.js" a11f43213632bcd7be3d4945846cf5dcbfaeaf4b961a32c420c590f67519daa1
fence baseline-live-battle-adapter "$baseline_root/src/sim/live-battle.js" 208186e8d90ba1501f563f55d42f2bb5ec5da1daaea46b96ef41c74b1a48da2a
fence candidate-kernel "$candidate_root/src/sim/battle-continuation-kernel.js" 502d46024ce38d6a655025a25bdc831687b98921d31c1c90ecaf9d41b0ebe732
fence candidate-factory "$candidate_root/src/sim/battle-combat-runtime.js" cdb0e1405ddd0a768e1f79de9266dcf4da764f7c063f61d8bc05e8935b84e1f8
fence candidate-opaque-helper "$candidate_root/src/sim/opaque-continuation.js" c1ea311230dc4f65bceccd46eff60b8be68d2c559fe60d9f9a9b9c3a2dfce84e
fence candidate-battle-combat-facade "$candidate_root/src/sim/battle-combat.js" a9adf0d16359077bd0453cf2b8716e817d0a47c78073cde25a8b44a0c4ce3922
fence candidate-game-session-adapter "$candidate_root/src/sim/game-session.js" a11f43213632bcd7be3d4945846cf5dcbfaeaf4b961a32c420c590f67519daa1
fence candidate-live-battle-adapter "$candidate_root/src/sim/live-battle.js" 208186e8d90ba1501f563f55d42f2bb5ec5da1daaea46b96ef41c74b1a48da2a
fence candidate-differential-test "$candidate_root/tests/battle-combat-baseline-differential.test.js" dfcbc51a16c9bbc8860fb22691138e0a7f5cb0e0a1d1a445e966385e1096b3a4
fence candidate-nondeterminism-guard "$candidate_root/tests/nondeterminism-guard.test.js" 637be08373a2de24409b35d9dc8d95d193f0fcfef2ac38571729a5800bc99a93
fence candidate-source-extraction-audit "$candidate_root/artifacts/shared-combat-factory-round-1/builder/source-extraction-audit.md" f22e7948aab667653338e9f9ca90533284c9d69a83b8188fcf71e60b63dee64e
fence candidate-package-manifest "$candidate_root/package.json" e3374ae28ad30665ebe0641f56e848d75cb13e1d1ac143c3955f56622be311cf
fence candidate-package-lock "$candidate_root/package-lock.json" d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4
fence candidate-test-portable "$candidate_root/scripts/test-portable.js" c026aa3191154f671eaa650153d63bce3b4cbb4c512f971b020c26a5290ad92c
fence candidate-release-builder "$candidate_root/scripts/build-release.js" a560990d45c1c32f0d62eca0fe036128aea28dd886079b3d61ce92fc562d1847
fence candidate-ordinary-runner "$candidate_root/tests/game-roster-troops-ordinary-runner.js" 443228fcccc4e439bb921b0b7d69eff6276fbeb2429a6ab20c2995c017ff5122
fence candidate-ordinary-test "$candidate_root/tests/game-roster-troops-ordinary.test.js" e333f9acdf184f8e19b5f71559541fafc9bc3f402fed3c6688dff439678dc1d8
fence candidate-aether-lifecycle-test "$candidate_root/tests/cards023k-aether-well.test.js" 1e754e52003c62a23d7d436075cc05b1c0b8b20db2e40fa7af708b42bcd60a31
fence candidate-buildings-runner "$candidate_root/tests/game-roster-buildings-runner.js" f71ab086a6e80549988201183359c94b1a920b7b041a94da200544d1b885d4eb
fence candidate-projectile-runner "$candidate_root/tests/game-roster-troops-projectile-runner.js" bb49b46b37552f5dda0b61130a9a37eff2aa19ca734649d2d6a8178b3b11205d
fence candidate-projectile-test "$candidate_root/tests/game-roster-troops-projectile.test.js" 385079a508fd2ce2c3b8ef09a7399435eb7a63aec784aaa7c871f3aa10893eac
fence private-playwright-package "$candidate_root/node_modules/playwright/package.json" 718c91812946dcfbb4b724cfa0084ee3be205c571df09094f218bc4571f43c2b
fence private-playwright-entry "$EXPECTED_PLAYWRIGHT_ENTRY" a0f5715ea22354f922791a9c53dc012d5d5c067ff9cc4cd35ffb7cd272071a9f
fence private-playwright-core-package "$candidate_root/node_modules/playwright-core/package.json" 16a25dbd7368a87af8b58a45c6216b9cec5a91a72cf704533344701997ebde22
fence private-vite-package "$candidate_root/node_modules/vite/package.json" 2b906339263f24e9be4219f93d966b4bcf0d4141adc05939a537c3a8fd6f760a

RUNTIME_PATH="$NODE_BIN_DIR:$SYSTEM_PATH"
RUNTIME_HOME="$record_root/home"
RUNTIME_TMP="$record_root/tmp"
RUNTIME_NPM_CACHE="$record_root/npm-cache"
RUNTIME_PLAYWRIGHT_BROWSERS="$record_root/playwright-browsers"
RUNTIME_SHIPPING_EVIDENCE="$GENERATED_REPORT_OUTPUT"
ENV_BIN=/usr/bin/env

{
  printf 'candidate_head\t%s\n' "$candidate_head"
  printf 'candidate_parent\t%s\n' "$candidate_parent"
  printf 'candidate_state\taccepted-Aether-9e04300816d5e6b2c94001ba221c0e89b6da2efe; factory-candidate-7a75c24da75167f2be278b46cbddaba4eb19edc7; validator-binding-repair-d49ea27509c710939a8f493e5122f359f2bab85c\n'
  printf 'candidate_root\t%s\n' "$candidate_root"
  printf 'baseline_head\t%s\n' "$baseline_head"
  printf '%s\t%s\n' "$BASELINE_ROOT_ENV" "$baseline_root"
  printf '%s\t%s\n' "$RELEASE_FENCE_ENV" "$GAME001HTJX_RUNTIME_RELEASE"
  printf 'node_binary\t%s\n' "$NODE_BINARY"
  printf 'node_expected_major\t22\n'
  printf 'npm_binary\t%s\n' "$NPM_BINARY"
  printf 'npm_expected_version\t%s\n' "$EXPECTED_NPM_VERSION"
  printf 'chrome_binary\t%s\n' "$EXPECTED_CHROME"
  printf 'chrome_expected_version\t%s\n' "$EXPECTED_CHROME_VERSION"
  printf 'playwright_package_root\t%s/node_modules/playwright\n' "$candidate_root"
  printf 'GAME_BROWSER_PLAYWRIGHT\t%s\n' "$EXPECTED_PLAYWRIGHT_ENTRY"
  printf 'SHIPPING_ISOLATION_RELEASE_EVIDENCE\t%s\n' "$RUNTIME_SHIPPING_EVIDENCE"
  printf 'playwright_expected_version\t%s\n' "$EXPECTED_PLAYWRIGHT_VERSION"
  printf 'vite_expected_version\t%s\n' "$EXPECTED_VITE_VERSION"
  printf 'node_modules_copy\tprivate copy from the prepared worktree host dependency tree\n'
  printf 'serial\ttrue\nstop_on_first_nonzero\ttrue\nstdout_stderr\traw separate files\n'
  printf 'argv_format\tone exact argument per line\ncwd_and_environment\trecorded per gate\ndifferential_skip_policy\tzero skipped tests; require 2 passed\n'
} > "$record_root/qualification.tsv"
printf 'gate\tdirect_pid\tdirect_exit\teffective_exit\n' > "$record_root/gates.tsv"
printf 'check\tactual\texpected\n' > "$record_root/toolchain-checks.tsv"

run_gate() {
  gate=$1
  shift
  argv_path="$record_root/$gate.argv.txt"
  env_path="$record_root/$gate.env.tsv"
  : > "$argv_path"
  {
    printf '%s\n' "$ENV_BIN" -i
    printf '%s\n' "PATH=$RUNTIME_PATH" "HOME=$RUNTIME_HOME" "TMPDIR=$RUNTIME_TMP"
    printf '%s\n' "SHARED_COMBAT_BASELINE_ROOT=$baseline_root" "GAME001HTJX_RUNTIME_RELEASE=1"
    printf '%s\n' "GAME_BROWSER_CHROME=$EXPECTED_CHROME" "GAME_BROWSER_PLAYWRIGHT=$EXPECTED_PLAYWRIGHT_ENTRY" "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUNTIME_SHIPPING_EVIDENCE" "PLAYWRIGHT_BROWSERS_PATH=$RUNTIME_PLAYWRIGHT_BROWSERS"
    printf '%s\n' "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1" "PLAYWRIGHT_PACKAGE_ROOT=$candidate_root/node_modules/playwright"
    printf '%s\n' "npm_config_cache=$RUNTIME_NPM_CACHE" "npm_config_update_notifier=false"
    printf '%s\n' LANG=C LC_ALL=C CI=1 NO_COLOR=1
    for argument in "$@"; do printf '%s\n' "$argument"; done
  } > "$argv_path"
  {
    printf 'PATH\t%s\n' "$RUNTIME_PATH"
    printf 'HOME\t%s\n' "$RUNTIME_HOME"
    printf 'TMPDIR\t%s\n' "$RUNTIME_TMP"
    printf 'SHARED_COMBAT_BASELINE_ROOT\t%s\n' "$baseline_root"
    printf 'GAME001HTJX_RUNTIME_RELEASE\t1\n'
    printf 'GAME_BROWSER_CHROME\t%s\n' "$EXPECTED_CHROME"
    printf 'GAME_BROWSER_PLAYWRIGHT\t%s\n' "$EXPECTED_PLAYWRIGHT_ENTRY"
    printf 'SHIPPING_ISOLATION_RELEASE_EVIDENCE\t%s\n' "$RUNTIME_SHIPPING_EVIDENCE"
    printf 'PLAYWRIGHT_BROWSERS_PATH\t%s\n' "$RUNTIME_PLAYWRIGHT_BROWSERS"
    printf 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD\t1\n'
    printf 'PLAYWRIGHT_PACKAGE_ROOT\t%s/node_modules/playwright\n' "$candidate_root"
    printf 'npm_config_cache\t%s\n' "$RUNTIME_NPM_CACHE"
    printf 'npm_config_update_notifier\tfalse\nLANG\tC\nLC_ALL\tC\nCI\t1\nNO_COLOR\t1\n'
  } > "$env_path"
  /bin/pwd -P > "$record_root/$gate.cwd.txt"
  printf 'RUN\t%s\n' "$gate"
  "$ENV_BIN" -i \
    "PATH=$RUNTIME_PATH" \
    "HOME=$RUNTIME_HOME" \
    "TMPDIR=$RUNTIME_TMP" \
    "SHARED_COMBAT_BASELINE_ROOT=$baseline_root" \
    "GAME001HTJX_RUNTIME_RELEASE=1" \
    "GAME_BROWSER_CHROME=$EXPECTED_CHROME" \
    "GAME_BROWSER_PLAYWRIGHT=$EXPECTED_PLAYWRIGHT_ENTRY" \
    "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUNTIME_SHIPPING_EVIDENCE" \
    "PLAYWRIGHT_BROWSERS_PATH=$RUNTIME_PLAYWRIGHT_BROWSERS" \
    "PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1" \
    "PLAYWRIGHT_PACKAGE_ROOT=$candidate_root/node_modules/playwright" \
    "npm_config_cache=$RUNTIME_NPM_CACHE" \
    "npm_config_update_notifier=false" \
    LANG=C LC_ALL=C CI=1 NO_COLOR=1 \
    "$@" > "$record_root/$gate.stdout" 2> "$record_root/$gate.stderr" &
  direct_pid=$!
  printf '%s\n' "$direct_pid" > "$record_root/$gate.pid"
  printf 'START\t%s\tpid=%s\tcwd=%s\n' "$gate" "$direct_pid" "$candidate_root"
  wait "$direct_pid"
  direct_exit=$?
  effective_exit=$direct_exit
  printf '%s\n' "$direct_exit" > "$record_root/$gate.exit-code"

  if [ "$gate" = "01-baseline-differential" ] && [ "$direct_exit" -eq 0 ]; then
    if /usr/bin/grep -q '# SKIP' "$record_root/$gate.stdout"; then
      printf 'FAIL\tbaseline differential reported a skipped test\n' > "$record_root/$gate.validation.txt"
      effective_exit=2
    elif ! /usr/bin/grep -Eq '^# tests 2$' "$record_root/$gate.stdout" || \
      ! /usr/bin/grep -Eq '^# pass 2$' "$record_root/$gate.stdout" || \
      ! /usr/bin/grep -Eq '^# fail 0$' "$record_root/$gate.stdout" || \
      ! /usr/bin/grep -Eq '^# skipped 0$' "$record_root/$gate.stdout"; then
      printf 'FAIL\tbaseline differential did not report exactly 2 passed and 0 skipped\n' > "$record_root/$gate.validation.txt"
      effective_exit=2
    else
      printf 'PASS\t2 tests passed; 0 skipped\n' > "$record_root/$gate.validation.txt"
    fi
  fi

  printf '%s\t%s\t%s\t%s\n' "$gate" "$direct_pid" "$direct_exit" "$effective_exit" >> "$record_root/gates.tsv"
  printf 'EXIT\t%s\tdirect=%s\teffective=%s\n' "$gate" "$direct_exit" "$effective_exit"
  if [ "$effective_exit" -ne 0 ]; then
    printf 'STOP\tfirst nonzero or failed validation at %s; raw output is in %s\n' "$gate" "$record_root" >&2
    exit "$effective_exit"
  fi
}

read_output() {
  /bin/cat "$record_root/$1.stdout"
}

expect_equal() {
  check=$1
  actual=$2
  expected=$3
  if [ "$actual" != "$expected" ]; then
    printf '%s\t%s\t%s\n' "$check" "$actual" "$expected" >> "$record_root/toolchain-checks.tsv"
    fail "$check mismatch: expected '$expected', got '$actual'"
  fi
  printf '%s\t%s\t%s\n' "$check" "$actual" "$expected" >> "$record_root/toolchain-checks.tsv"
}

cd "$candidate_root" || fail "cannot enter candidate checkout"
run_gate 00-node-version "$NODE_BINARY" --version
node_version=$(read_output 00-node-version)
case "$node_version" in v22.*) ;; *) fail "pinned Node must be major 22, got $node_version" ;; esac
printf 'node_major\t%s\t22\n' "${node_version%%.*}" >> "$record_root/toolchain-checks.tsv"

run_gate 00-npm-version "$NPM_BINARY" --version
expect_equal npm_version "$(read_output 00-npm-version)" "$EXPECTED_NPM_VERSION"

run_gate 00-playwright-version awk -F '"' '$2 == "version" { print $4; exit }' "$candidate_root/node_modules/playwright/package.json"
expect_equal playwright_version "$(read_output 00-playwright-version)" "$EXPECTED_PLAYWRIGHT_VERSION"

run_gate 00-playwright-core-version awk -F '"' '$2 == "version" { print $4; exit }' "$candidate_root/node_modules/playwright-core/package.json"
expect_equal playwright_core_version "$(read_output 00-playwright-core-version)" "$EXPECTED_PLAYWRIGHT_VERSION"

run_gate 00-vite-version awk -F '"' '$2 == "version" { print $4; exit }' "$candidate_root/node_modules/vite/package.json"
expect_equal vite_version "$(read_output 00-vite-version)" "$EXPECTED_VITE_VERSION"

run_gate 00-chrome-version /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CHROME_INFO_PLIST"
expect_equal chrome_version "$(read_output 00-chrome-version)" "$EXPECTED_CHROME_VERSION"

run_gate 01-baseline-differential "$NODE_BINARY" --test tests/battle-combat-baseline-differential.test.js
run_gate 02-battle-combat "$NODE_BINARY" tests/battle-combat-runner.js battle-combat
run_gate 03-battle-combat-external "$NODE_BINARY" tests/battle-combat-external-runner.js battle-combat-external
run_gate 04-battle-projectile-history "$NODE_BINARY" tests/battle-projectile-history-runner.js battle-projectile-history
run_gate 05-compact-capability-hostile "$NODE_BINARY" --test tests/compact-capability-hostile.test.js
run_gate 06-battle-towers-kernel "$NODE_BINARY" tests/battle-towers-kernel-runner.js battle-towers-kernel
run_gate 07-game-session "$NODE_BINARY" tests/game-session-runner.js game-session
run_gate 08-game-roster-troops-ordinary "$NODE_BINARY" tests/game-roster-troops-ordinary-runner.js game-roster-troops-ordinary
run_gate 09-aether-well-lifecycle "$NODE_BINARY" --test tests/cards023k-aether-well.test.js
run_gate 10-game-roster-buildings "$NODE_BINARY" tests/game-roster-buildings-runner.js game-roster-buildings
run_gate 11-game-roster-troops-projectile "$NODE_BINARY" tests/game-roster-troops-projectile-runner.js game-roster-troops-projectile
run_gate 12-nondeterminism-guard "$NODE_BINARY" tests/nondeterminism-guard-runner.js nondeterminism-guard
run_gate 13-shipping-isolation-guard "$NODE_BINARY" tests/shipping-isolation-guard-runner.js shipping-isolation-guard
run_gate 14-shipping-isolation-release "$NODE_BINARY" tests/shipping-isolation-release-runner.js shipping-isolation-release
run_gate 15-shipping-isolation-host "$NODE_BINARY" tests/shipping-isolation-host-runner.js shipping-isolation-host
run_gate 16-release-build "$NODE_BINARY" tests/release-build-runner.js release-build
run_gate 17-release-runtime "$NODE_BINARY" tests/release-runtime-runner.js release-runtime
run_gate 18-npm-test "$NPM_BINARY" test
run_gate 19-release-artifact "$NODE_BINARY" scripts/build-release.js --out "$record_root/release-artifact"

[ -d "$record_root/release-artifact" ] || fail "release artifact directory was not retained"
find "$record_root/release-artifact" -type f -print | sort > "$record_root/release-artifact-files.txt"
find "$record_root/release-artifact" -type f -exec /usr/bin/shasum -a 256 {} \; > "$record_root/release-artifact.sha256"
candidate_after=$(/usr/bin/git -C "$candidate_root" status --porcelain --untracked-files=all 2>/dev/null) || fail "cannot inspect post-run candidate status"
baseline_after=$(/usr/bin/git -C "$baseline_root" status --porcelain --untracked-files=all 2>/dev/null) || fail "cannot inspect post-run baseline status"
printf '%s\n' "$candidate_after" > "$record_root/post-run-candidate-status.txt"
printf '%s\n' "$baseline_after" > "$record_root/post-run-baseline-status.txt"
[ -z "$candidate_after" ] || fail "candidate source tree became dirty during qualification"
[ -z "$baseline_after" ] || fail "accepted baseline became dirty during qualification"
[ -f "$GENERATED_REPORT_OUTPUT" ] || fail "shipping-isolation release evidence was not retained"
actual_report_sha=$(/usr/bin/shasum -a 256 "$GENERATED_REPORT_PATH" 2>/dev/null | /usr/bin/awk '{print $1}') || fail "cannot verify pre-existing release evidence"
[ "$actual_report_sha" = "$original_report_sha" ] || fail "pre-existing release evidence changed during qualification"
new_report_sha=$(/usr/bin/shasum -a 256 "$GENERATED_REPORT_OUTPUT" 2>/dev/null | /usr/bin/awk '{print $1}') || fail "cannot hash generated release evidence"
printf 'preexisting_after\t%s\t%s\nnew_report_sha256\t%s\n' "$actual_report_sha" "$GENERATED_REPORT_PATH" "$new_report_sha" >> "$record_root/generated-reports.tsv"
rm -rf "$record_root/home" "$record_root/tmp" "$record_root/npm-cache" "$record_root/playwright-browsers"
printf 'COMPLETE\t19 gates and toolchain checks passed; raw logs and retained release artifact: %s\n' "$record_root"
