#!/bin/sh
set -u
PATH=/usr/bin:/bin:/usr/sbin:/sbin
export PATH

EXPECTED_CANDIDATE=591512ba77ee4c6f34b9ba1996630c516d09a856
EXPECTED_PARENT=4669996c5b8a37c621cfe81dd0ac522f17934e64
EXPECTED_BASELINE=7f41167c2429eec637dbb7c5f838fa3b404ab4d2
EXPECTED_A71=a71f87d38eb423612474500cc0be60893ceb8eeb
CANDIDATE_ROOT=/private/tmp/game-001htjx-round2-builder-591512b
BASELINE_ROOT=/private/tmp/game-001htjx-baseline
OLD_QUALIFIED_ROOT=/private/tmp/game-001htjx-runtime-prepared-7a75c24
RECORD_ROOT=/private/tmp/game-001htjx-r2-gates-591512ba/record
RELEASE_FENCE_ENV=GAME001HTJX_RUNTIME_RELEASE
NODE_BIN_DIR=/Users/me/.hermes/node/bin
NODE_BINARY=/Users/me/.hermes/node/bin/node
NPM_BINARY=/Users/me/.hermes/node/bin/npm
EXPECTED_NPM_VERSION=10.9.8
CHROME_BINARY=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
CHROME_INFO_PLIST=/Applications/Google Chrome.app/Contents/Info.plist
EXPECTED_CHROME_VERSION=155.0.8059.40
PLAYWRIGHT_ENTRY=/private/tmp/game-001htjx-round2-builder-591512b/node_modules/playwright/index.mjs
EXPECTED_PLAYWRIGHT_VERSION=1.58.2
EXPECTED_PLAYWRIGHT_ENTRY_SHA=a0f5715ea22354f922791a9c53dc012d5d5c067ff9cc4cd35ffb7cd272071a9f
SYSTEM_PATH=/usr/bin:/bin:/usr/sbin:/sbin
ENV_BIN=/usr/bin/env
record_root=

fail() {
  message=$1
  printf '%s\n' "$message" >&2
  if [ -n "${record_root:-}" ] && [ -d "$record_root" ]; then
    printf '%s\n' "$message" >> "$record_root/preflight.stderr"
  fi
  exit 2
}

[ "$#" -eq 0 ] || fail "usage: GAME001HTJX_RUNTIME_RELEASE=1 SHARED_COMBAT_BASELINE_ROOT=$BASELINE_ROOT $0"
[ "${GAME001HTJX_RUNTIME_RELEASE:-}" = "1" ] || fail "runtime fence closed; root must set ${RELEASE_FENCE_ENV}=1"
[ "${SHARED_COMBAT_BASELINE_ROOT:-}" = "$BASELINE_ROOT" ] || fail "set SHARED_COMBAT_BASELINE_ROOT to exact immutable baseline $BASELINE_ROOT"

candidate_root=$(CDPATH= cd "$CANDIDATE_ROOT" 2>/dev/null && pwd -P) || fail "candidate root unavailable: $CANDIDATE_ROOT"
baseline_root=$(CDPATH= cd "$BASELINE_ROOT" 2>/dev/null && pwd -P) || fail "baseline root unavailable: $BASELINE_ROOT"
[ "$candidate_root" = "$CANDIDATE_ROOT" ] || fail "candidate path mismatch: $candidate_root"
[ "$baseline_root" = "$BASELINE_ROOT" ] || fail "baseline path mismatch: $baseline_root"
[ ! -e "$RECORD_ROOT" ] || fail "refusing to overwrite record root $RECORD_ROOT"
mkdir -p "$RECORD_ROOT"
record_root=$RECORD_ROOT
mkdir -p "$record_root/home" "$record_root/tmp" "$record_root/npm-cache" "$record_root/playwright-browsers" "$record_root/preexisting-generated-reports/npm-default" "$record_root/new-generated-reports/npm-default"
printf '%s\n' "$$" > "$record_root/recorder.pid"
recorder_sha=$(/usr/bin/shasum -a 256 "$0" | /usr/bin/awk '{print $1}') || fail "cannot hash recorder"
printf 'recorder_path\t%s\nrecorder_sha256\t%s\n' "$0" "$recorder_sha" > "$record_root/recorder.tsv"

candidate_head=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD 2>/dev/null) || fail "candidate is not a Git checkout"
candidate_parent=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD^ 2>/dev/null) || fail "cannot inspect candidate parent"
baseline_head=$(/usr/bin/git -C "$baseline_root" rev-parse HEAD 2>/dev/null) || fail "baseline is not a Git checkout"
[ "$candidate_head" = "$EXPECTED_CANDIDATE" ] || fail "candidate HEAD mismatch: $candidate_head"
[ "$candidate_parent" = "$EXPECTED_PARENT" ] || fail "candidate parent mismatch: $candidate_parent"
[ "$baseline_head" = "$EXPECTED_BASELINE" ] || fail "baseline HEAD mismatch: $baseline_head"
candidate_dirty=$(/usr/bin/git -C "$candidate_root" status --porcelain --untracked-files=all 2>/dev/null) || fail "cannot inspect candidate status"
baseline_dirty=$(/usr/bin/git -C "$baseline_root" status --porcelain --untracked-files=all 2>/dev/null) || fail "cannot inspect baseline status"
[ -z "$candidate_dirty" ] || fail "candidate checkout is dirty before qualification: $candidate_dirty"
[ -z "$baseline_dirty" ] || fail "baseline checkout is dirty: $baseline_dirty"
[ -x "$NODE_BINARY" ] || fail "pinned Node binary unavailable: $NODE_BINARY"
[ -x "$NPM_BINARY" ] || fail "pinned npm entry point unavailable: $NPM_BINARY"
[ -x "$CHROME_BINARY" ] || fail "pinned Chrome binary unavailable: $CHROME_BINARY"
[ -f "$candidate_root/node_modules/playwright/package.json" ] || fail "private Playwright package unavailable"
[ -f "$PLAYWRIGHT_ENTRY" ] || fail "private Playwright entry unavailable: $PLAYWRIGHT_ENTRY"
[ -f "$candidate_root/node_modules/playwright-core/package.json" ] || fail "private Playwright core package unavailable"
[ -f "$candidate_root/node_modules/vite/package.json" ] || fail "private Vite package unavailable"

# The accepted R2 change is only the exact game-battle test fixture. Verify all
# production, package, asset, script, and other test blobs still match qualified a71.
/usr/bin/git -C "$candidate_root" diff --quiet "$EXPECTED_A71" "$EXPECTED_CANDIDATE" -- src demo public assets scripts tests package.json package-lock.json ':(exclude)tests/game-battle.test.js' || fail "production/package/assets/scripts/focused-test content differs from qualified a71 outside the accepted game-battle fixture"
source_diff=$(/usr/bin/git -C "$candidate_root" diff --name-status "$EXPECTED_A71" "$EXPECTED_CANDIDATE" -- src demo public assets scripts tests package.json package-lock.json 2>/dev/null) || fail "cannot list candidate/source differences"
printf '%s\n' "$source_diff" > "$record_root/a71-source-diff-name-status.txt"
expected_source_diff=$(printf 'M\ttests/game-battle.test.js')
[ "$source_diff" = "$expected_source_diff" ] || fail "unexpected source diff versus a71: $source_diff"
game_battle_blob=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD:tests/game-battle.test.js 2>/dev/null) || fail "cannot resolve game-battle test blob"
[ "$game_battle_blob" = "88d60de535858cec9ab9019daa09b683fe70b645" ] || fail "game-battle test is not exact accepted cb133 blob: $game_battle_blob"
game_battle_sha=$(/usr/bin/shasum -a 256 "$candidate_root/tests/game-battle.test.js" | /usr/bin/awk '{print $1}') || fail "cannot hash game-battle test"
[ "$game_battle_sha" = "d57a3fe11aa1c067a64d4f65896ee66d9411c6ce197fb55d6fa87b34b3cf114e" ] || fail "game-battle test SHA mismatch: $game_battle_sha"
playwright_entry_sha=$(/usr/bin/shasum -a 256 "$PLAYWRIGHT_ENTRY" | /usr/bin/awk '{print $1}') || fail "cannot hash private Playwright entry"
[ "$playwright_entry_sha" = "$EXPECTED_PLAYWRIGHT_ENTRY_SHA" ] || fail "private Playwright entry SHA mismatch: $playwright_entry_sha"

printf 'candidate_head\t%s\ncandidate_parent\t%s\nbaseline_head\t%s\na71_qualified_commit\t%s\na71_source_diff\t%s\ngame_battle_git_blob\t%s\ngame_battle_sha256\t%s\nGAME_BROWSER_PLAYWRIGHT\t%s\nGAME_BROWSER_PLAYWRIGHT_sha256\t%s\n' \
  "$candidate_head" "$candidate_parent" "$baseline_head" "$EXPECTED_A71" "$source_diff" "$game_battle_blob" "$game_battle_sha" "$PLAYWRIGHT_ENTRY" "$playwright_entry_sha" > "$record_root/qualification.tsv"
printf 'source\tsha256\tpath\n' > "$record_root/source-fences.tsv"
fence() {
  label=$1
  path=$2
  expected=$3
  [ -f "$path" ] || fail "missing source fence for $label: $path"
  actual=$(/usr/bin/shasum -a 256 "$path" | /usr/bin/awk '{print $1}') || fail "cannot hash $path"
  [ "$actual" = "$expected" ] || fail "source fence mismatch for $label: $actual"
  printf '%s\t%s\t%s\n' "$label" "$actual" "$path" >> "$record_root/source-fences.tsv"
}
fence candidate-kernel "$candidate_root/src/sim/battle-continuation-kernel.js" 502d46024ce38d6a655025a25bdc831687b98921d31c1c90ecaf9d41b0ebe732
fence candidate-factory "$candidate_root/src/sim/battle-combat-runtime.js" cdb0e1405ddd0a768e1f79de9266dcf4da764f7c063f61d8bc05e8935b84e1f8
fence candidate-opaque-helper "$candidate_root/src/sim/opaque-continuation.js" c1ea311230dc4f65bceccd46eff60b8be68d2c559fe60d9f9a9b9c3a2dfce84e
fence candidate-battle-combat-facade "$candidate_root/src/sim/battle-combat.js" a9adf0d16359077bd0453cf2b8716e817d0a47c78073cde25a8b44a0c4ce3922
fence candidate-game-session-adapter "$candidate_root/src/sim/game-session.js" a11f43213632bcd7be3d4945846cf5dcbfaeaf4b961a32c420c590f67519daa1
fence candidate-live-battle-adapter "$candidate_root/src/sim/live-battle.js" 208186e8d90ba1501f563f55d42f2bb5ec5da1daaea46b96ef41c74b1a48da2a
fence candidate-package-manifest "$candidate_root/package.json" e3374ae28ad30665ebe0641f56e848d75cb13e1d1ac143c3955f56622be311cf
fence candidate-package-lock "$candidate_root/package-lock.json" d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4
fence candidate-test-portable "$candidate_root/scripts/test-portable.js" c026aa3191154f671eaa650153d63bce3b4cbb4c512f971b020c26a5290ad92c
fence candidate-content-schema-dispatcher "$candidate_root/tests/content-schema-runner.js" 24e7c1f666760a80da82b9b2c052b02830db857c134d0872c0ed96f1135f9184
fence candidate-game-battle-test "$candidate_root/tests/game-battle.test.js" "$game_battle_sha"
fence candidate-ordinary-runner "$candidate_root/tests/game-roster-troops-ordinary-runner.js" 443228fcccc4e439bb921b0b7d69eff6276fbeb2429a6ab20c2995c017ff5122
fence candidate-ordinary-test "$candidate_root/tests/game-roster-troops-ordinary.test.js" e333f9acdf184f8e19b5f71559541fafc9bc3f402fed3c6688dff439678dc1d8
fence candidate-aether-lifecycle-test "$candidate_root/tests/cards023k-aether-well.test.js" 1e754e52003c62a23d7d436075cc05b1c0b8b20db2e40fa7af708b42bcd60a31
fence candidate-buildings-runner "$candidate_root/tests/game-roster-buildings-runner.js" f71ab086a6e80549988201183359c94b1a920b7b041a94da200544d1b885d4eb
fence candidate-projectile-runner "$candidate_root/tests/game-roster-troops-projectile-runner.js" bb49b46b37552f5dda0b61130a9a37eff2aa19ca734649d2d6a8178b3b11205d
fence candidate-projectile-test "$candidate_root/tests/game-roster-troops-projectile.test.js" 385079a508fd2ce2c3b8ef09a7399435eb7a63aec784aaa7c871f3aa10893eac
fence private-playwright-package "$candidate_root/node_modules/playwright/package.json" 718c91812946dcfbb4b724cfa0084ee3be205c571df09094f218bc4571f43c2b
fence private-playwright-entry "$PLAYWRIGHT_ENTRY" "$EXPECTED_PLAYWRIGHT_ENTRY_SHA"
fence private-playwright-core-package "$candidate_root/node_modules/playwright-core/package.json" 16a25dbd7368a87af8b58a45c6216b9cec5a91a72cf704533344701997ebde22
fence private-vite-package "$candidate_root/node_modules/vite/package.json" 2b906339263f24e9be4219f93d966b4bcf0d4141adc05939a537c3a8fd6f760a

# Preserve every pre-existing report in the fixed output roots before any tests.
mkdir -p "$record_root/preexisting-generated-reports/artifacts"
for generated_root in artifacts/release-001b-round-2 artifacts/release-001w-round-1; do
  [ -d "$candidate_root/$generated_root" ] || fail "expected generated-report root unavailable: $generated_root"
  mkdir -p "$record_root/preexisting-generated-reports/$generated_root"
  /usr/bin/ditto "$candidate_root/$generated_root" "$record_root/preexisting-generated-reports/$generated_root" || fail "cannot preserve $generated_root"
done
REPORT_PATH=artifacts/guard-002r-round-1/release-isolation-evidence.json
[ -f "$candidate_root/$REPORT_PATH" ] || fail "pre-existing shipping-isolation report unavailable"
mkdir -p "$record_root/preexisting-generated-reports/artifacts/guard-002r-round-1"
/bin/cp -p "$candidate_root/$REPORT_PATH" "$record_root/preexisting-generated-reports/$REPORT_PATH" || fail "cannot preserve $REPORT_PATH"
/usr/bin/find "$record_root/preexisting-generated-reports/artifacts" -type f -print | sort > "$record_root/preexisting-generated-reports/files.txt"
/usr/bin/find "$record_root/preexisting-generated-reports/artifacts" -type f -exec /usr/bin/shasum -a 256 {} \; > "$record_root/preexisting-generated-reports/sha256.txt"

RUNTIME_PATH="$NODE_BIN_DIR:$SYSTEM_PATH"
RUNTIME_HOME="$record_root/home"
RUNTIME_TMP="$record_root/tmp"
RUNTIME_NPM_CACHE="$record_root/npm-cache"
RUNTIME_PLAYWRIGHT_BROWSERS="$record_root/playwright-browsers"
RUNTIME_SHIPPING_EVIDENCE="$record_root/new-generated-reports/release-isolation-evidence.json"

write_env() {
  gate=$1
  {
    printf 'PATH\t%s\nHOME\t%s\nTMPDIR\t%s\n' "$RUNTIME_PATH" "$RUNTIME_HOME" "$RUNTIME_TMP"
    printf 'SHARED_COMBAT_BASELINE_ROOT\t%s\nGAME001HTJX_RUNTIME_RELEASE\t1\n' "$baseline_root"
    printf 'GAME_BROWSER_CHROME\t%s\nGAME_BROWSER_PLAYWRIGHT\t%s\n' "$CHROME_BINARY" "$PLAYWRIGHT_ENTRY"
    printf 'PLAYWRIGHT_PACKAGE_ROOT\t%s/node_modules/playwright\nPLAYWRIGHT_BROWSERS_PATH\t%s\n' "$candidate_root" "$RUNTIME_PLAYWRIGHT_BROWSERS"
    printf 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD\t1\nnpm_config_cache\t%s\nnpm_config_update_notifier\tfalse\n' "$RUNTIME_NPM_CACHE"
    printf 'SHIPPING_ISOLATION_RELEASE_EVIDENCE\t%s\nLANG\tC\nLC_ALL\tC\nCI\t1\nNO_COLOR\t1\n' "$RUNTIME_SHIPPING_EVIDENCE"
  } > "$record_root/$gate.env.tsv"
}
write_argv() {
  gate=$1
  shift
  {
    printf '%s\n' "$ENV_BIN" -i
    printf '%s\n' "PATH=$RUNTIME_PATH" "HOME=$RUNTIME_HOME" "TMPDIR=$RUNTIME_TMP"
    printf '%s\n' "SHARED_COMBAT_BASELINE_ROOT=$baseline_root" GAME001HTJX_RUNTIME_RELEASE=1
    printf '%s\n' "GAME_BROWSER_CHROME=$CHROME_BINARY" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT_ENTRY"
    printf '%s\n' "PLAYWRIGHT_PACKAGE_ROOT=$candidate_root/node_modules/playwright" "PLAYWRIGHT_BROWSERS_PATH=$RUNTIME_PLAYWRIGHT_BROWSERS"
    printf '%s\n' PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 "npm_config_cache=$RUNTIME_NPM_CACHE" npm_config_update_notifier=false
    printf '%s\n' "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUNTIME_SHIPPING_EVIDENCE" LANG=C LC_ALL=C CI=1 NO_COLOR=1
    for argument in "$@"; do printf '%s\n' "$argument"; done
  } > "$record_root/$gate.argv.txt"
}

snapshot_tree() {
  gate=$1
  root_pid=$2
  snapshot_name=$3
  /bin/ps -Ao pid=,ppid=,etime=,%cpu=,command= > "$record_root/$gate.ps.raw"
  /usr/bin/awk -v root="$root_pid" '
    { pid[NR]=$1; ppid[NR]=$2; row[NR]=$0 }
    END {
      keep[root]=1
      changed=1
      while (changed) {
        changed=0
        for (i=1; i<=NR; i++) {
          if (keep[ppid[i]] && !keep[pid[i]]) { keep[pid[i]]=1; changed=1 }
        }
      }
      for (i=1; i<=NR; i++) if (keep[pid[i]]) print row[i]
    }
  ' "$record_root/$gate.ps.raw" > "$record_root/$snapshot_name"
}

collect_descendants() {
  root_pid=$1
  all="$root_pid"
  todo="$root_pid"
  while [ -n "$todo" ]; do
    next=
    for parent_pid in $todo; do
      children=$(/bin/ps -Ao pid=,ppid= | /usr/bin/awk -v parent="$parent_pid" '$2 == parent { print $1 }')
      for child_pid in $children; do
        case " $all " in
          *" $child_pid "*) ;;
          *) all="$all $child_pid"; next="$next $child_pid" ;;
        esac
      done
    done
    todo=$next
  done
  printf '%s\n' "$all"
}

stop_tree() {
  root_pid=$1
  reason=$2
  tree=$(collect_descendants "$root_pid")
  printf 'SIGINT\treason=%s\npids\t%s\n' "$reason" "$tree" >> "$record_root/02-repository-default-npm-test.stop.txt"
  for child_pid in $tree; do
    [ "$child_pid" = "$root_pid" ] && continue
    /bin/kill -INT "$child_pid" 2>/dev/null || true
  done
  /bin/kill -INT "$root_pid" 2>/dev/null || true
}

run_gate() {
  gate=$1
  shift
  write_argv "$gate" "$@"
  write_env "$gate"
  /bin/pwd -P > "$record_root/$gate.cwd.txt"
  printf 'RUN\t%s\n' "$gate"
  "$ENV_BIN" -i \
    "PATH=$RUNTIME_PATH" \
    "HOME=$RUNTIME_HOME" \
    "TMPDIR=$RUNTIME_TMP" \
    "SHARED_COMBAT_BASELINE_ROOT=$baseline_root" \
    GAME001HTJX_RUNTIME_RELEASE=1 \
    "GAME_BROWSER_CHROME=$CHROME_BINARY" \
    "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT_ENTRY" \
    "PLAYWRIGHT_PACKAGE_ROOT=$candidate_root/node_modules/playwright" \
    "PLAYWRIGHT_BROWSERS_PATH=$RUNTIME_PLAYWRIGHT_BROWSERS" \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    "npm_config_cache=$RUNTIME_NPM_CACHE" \
    npm_config_update_notifier=false \
    "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUNTIME_SHIPPING_EVIDENCE" \
    LANG=C LC_ALL=C CI=1 NO_COLOR=1 \
    "$@" > "$record_root/$gate.stdout" 2> "$record_root/$gate.stderr" &
  direct_pid=$!
  printf '%s\n' "$direct_pid" > "$record_root/$gate.pid"
  printf 'START\t%s\tpid=%s\tcwd=%s\n' "$gate" "$direct_pid" "$candidate_root"
  snapshot_tree "$gate" "$direct_pid" "$gate.process-snapshot-start.txt"
  monitor_pid=
  (
    while /bin/kill -0 "$direct_pid" 2>/dev/null; do
      if [ "$gate" = "02-repository-default-npm-test" ] && /usr/bin/grep -Eq '^(not ok [0-9]+ |# fail [1-9][0-9]*$)' "$record_root/$gate.stdout"; then
        /bin/cp "$record_root/$gate.stdout" "$record_root/$gate.first-failure-raw-prefix.txt"
        /bin/cp "$record_root/$gate.stderr" "$record_root/$gate.first-failure-stderr-prefix.txt"
        stop_tree "$direct_pid" "first TAP failure marker observed; stop default dispatcher before further sections"
        break
      fi
      snapshot_tree "$gate" "$direct_pid" "$gate.process-snapshot-live.txt"
      /bin/sleep 2
    done
  ) &
  monitor_pid=$!
  wait "$direct_pid"
  direct_exit=$?
  /bin/kill "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true
  snapshot_tree "$gate" "$direct_pid" "$gate.process-snapshot-end.txt"
  printf '%s\n' "$direct_exit" > "$record_root/$gate.exit-code"
  printf '%s\t%s\t%s\n' "$gate" "$direct_pid" "$direct_exit" >> "$record_root/gates.tsv"
  printf 'EXIT\t%s\tdirect=%s\n' "$gate" "$direct_exit"
  if [ "$direct_exit" -ne 0 ]; then
    printf 'STOP\tfirst nonzero at %s; raw output is in %s\n' "$gate" "$record_root" >&2
    exit "$direct_exit"
  fi
}

finish() {
  final_status=$?
  trap - EXIT
  if [ -d "$record_root/preexisting-generated-reports/artifacts" ]; then
    /usr/bin/find "$candidate_root/artifacts/release-001b-round-2" "$candidate_root/artifacts/release-001w-round-1" -type f -print 2>/dev/null | sort > "$record_root/new-generated-reports/npm-default/files.txt"
    for generated_root in artifacts/release-001b-round-2 artifacts/release-001w-round-1; do
      if [ -d "$candidate_root/$generated_root" ]; then
        mkdir -p "$record_root/new-generated-reports/npm-default/$generated_root"
        /usr/bin/ditto "$candidate_root/$generated_root" "$record_root/new-generated-reports/npm-default/$generated_root" || true
      fi
    done
    if [ -f "$candidate_root/$REPORT_PATH" ]; then
      /bin/cp -p "$candidate_root/$REPORT_PATH" "$record_root/new-generated-reports/$REPORT_PATH" || true
    fi
    /usr/bin/find "$record_root/new-generated-reports" -type f -exec /usr/bin/shasum -a 256 {} \; > "$record_root/new-generated-reports/sha256.txt" 2>/dev/null || true
    for generated_root in artifacts/release-001b-round-2 artifacts/release-001w-round-1; do
      /bin/rm -rf "$candidate_root/$generated_root"
      /usr/bin/ditto "$record_root/preexisting-generated-reports/$generated_root" "$candidate_root/$generated_root" || true
    done
    /bin/cp -p "$record_root/preexisting-generated-reports/$REPORT_PATH" "$candidate_root/$REPORT_PATH" 2>/dev/null || true
  fi
  /usr/bin/git -C "$candidate_root" status --porcelain --untracked-files=all > "$record_root/post-restore-candidate-status.txt" 2>&1 || true
  /usr/bin/git -C "$baseline_root" status --porcelain --untracked-files=all > "$record_root/post-run-baseline-status.txt" 2>&1 || true
  if [ -d "$record_root/release-artifact" ]; then
    /usr/bin/find "$record_root/release-artifact" -type f -print | sort > "$record_root/release-artifact-files.txt"
    /usr/bin/find "$record_root/release-artifact" -type f -exec /usr/bin/shasum -a 256 {} \; > "$record_root/release-artifact.sha256"
  fi
  /bin/rm -rf "$record_root/home" "$record_root/tmp" "$record_root/npm-cache" "$record_root/playwright-browsers"
  printf 'recorder_exit\t%s\n' "$final_status" > "$record_root/recorder-exit.txt"
}
trap finish EXIT
printf 'gate\tdirect_pid\tdirect_exit\n' > "$record_root/gates.tsv"
printf 'check\tactual\texpected\n' > "$record_root/toolchain-checks.tsv"

cd "$candidate_root" || fail "cannot enter candidate checkout"
run_gate 00-node-version "$NODE_BINARY" --version
node_version=$(/bin/cat "$record_root/00-node-version.stdout")
case "$node_version" in v22.*) ;; *) fail "Node must be major 22, got $node_version" ;; esac
printf 'node_version\t%s\tv22.x\n' "$node_version" >> "$record_root/toolchain-checks.tsv"
run_gate 00-npm-version "$NPM_BINARY" --version
npm_version=$(/bin/cat "$record_root/00-npm-version.stdout")
[ "$npm_version" = "$EXPECTED_NPM_VERSION" ] || fail "npm version mismatch: $npm_version"
printf 'npm_version\t%s\t%s\n' "$npm_version" "$EXPECTED_NPM_VERSION" >> "$record_root/toolchain-checks.tsv"
run_gate 00-playwright-version /usr/bin/awk -F '"' '$2 == "version" { print $4; exit }' "$candidate_root/node_modules/playwright/package.json"
playwright_version=$(/bin/cat "$record_root/00-playwright-version.stdout")
[ "$playwright_version" = "$EXPECTED_PLAYWRIGHT_VERSION" ] || fail "Playwright version mismatch: $playwright_version"
printf 'playwright_version\t%s\t%s\n' "$playwright_version" "$EXPECTED_PLAYWRIGHT_VERSION" >> "$record_root/toolchain-checks.tsv"
run_gate 00-chrome-version /usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$CHROME_INFO_PLIST"
chrome_version=$(/bin/cat "$record_root/00-chrome-version.stdout")
[ "$chrome_version" = "$EXPECTED_CHROME_VERSION" ] || fail "Chrome version mismatch: $chrome_version"
printf 'chrome_version\t%s\t%s\n' "$chrome_version" "$EXPECTED_CHROME_VERSION" >> "$record_root/toolchain-checks.tsv"

run_gate 01-game-battle-11 "$NODE_BINARY" --test tests/game-battle.test.js
run_gate 02-repository-default-npm-test "$NPM_BINARY" test
run_gate 03-retained-release-artifact "$NODE_BINARY" scripts/build-release.js --out "$record_root/release-artifact"
[ -d "$record_root/release-artifact" ] || fail "retained release artifact directory missing"
printf 'COMPLETE\tgame-battle, repository-default npm test, and retained release artifact passed\n' > "$record_root/qualification-result.txt"
