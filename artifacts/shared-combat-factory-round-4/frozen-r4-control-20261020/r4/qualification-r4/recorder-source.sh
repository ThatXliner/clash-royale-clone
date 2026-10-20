#!/bin/sh
set -u
PATH=/bin:/usr/bin:/usr/sbin:/sbin
export PATH

EXPECTED_BASELINE=7f41167c2429eec637dbb7c5f838fa3b404ab4d2
BASELINE_ROOT=/Users/me/.codex/clash-qualification/20261020-factory/baseline-7f41167c2429eec637dbb7c5f838fa3b404ab4d2
EXPECTED_FACTORY_SOURCE=a71f87d38eb423612474500cc0be60893ceb8eeb
PINNED_CANDIDATE=ffdaab6299f34308776cd2568f1d9f34903ecf14
PINNED_PARENT=4a6e9f6171ae1042a03f7c8268863df9a97920e7
EXPECTED_IDENTITY_RECEIPT_SHA=93be40f6654f27095a9097370244762a134144b4ed20278b7c5a398130225173
EXPECTED_FENCE_MANIFEST_SHA=c8031bd32d54a3045397b9e8b31c42311b0754142c325d4c471ae18276f25875
EXPECTED_FENCE_COUNT=5
NODE_BIN_DIR=/Users/me/.hermes/node/bin
NODE_BINARY=/Users/me/.hermes/node/bin/node
NPM_BINARY=/Users/me/.hermes/node/bin/npm
EXPECTED_NPM_VERSION=10.9.8
CHROME_BINARY='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
CHROME_INFO_PLIST='/Applications/Google Chrome.app/Contents/Info.plist'
EXPECTED_CHROME_VERSION=155.0.8059.85
EXPECTED_PLAYWRIGHT_VERSION=1.58.2
SYSTEM_PATH=/bin:/usr/bin:/usr/sbin:/sbin
ENV_BIN=/usr/bin/env
RELEASE_FENCE_ENV=GAME001HTJX_RUNTIME_RELEASE

CANDIDATE_ROOT=${FACTORY_CANDIDATE_ROOT:-}
EXPECTED_CANDIDATE=${FACTORY_CANDIDATE_COMMIT:-}
EXPECTED_PARENT=${FACTORY_ACCEPTED_PARENT:-}
RECORD_ROOT=${FACTORY_RECORD_ROOT:-}
record_root=

SCRIPT_DIR=$(CDPATH= cd "$(dirname "$0")" 2>/dev/null && /bin/pwd -P) || exit 2
SOURCE_FENCE_MANIFEST=$SCRIPT_DIR/source-fences-a71.tsv
SOURCE_IDENTITY_RECEIPT=$SCRIPT_DIR/source-identity-receipt.json

fail() {
  message=$1
  printf '%s\n' "$message" >&2
  if [ -n "${record_root:-}" ] && [ -d "$record_root" ]; then
    printf '%s\n' "$message" >> "$record_root/preflight.stderr"
  fi
  exit 2
}

[ "$#" -eq 0 ] || fail "usage: provide candidate, accepted-parent, and record-root pins through FACTORY_* environment variables"
[ "${GAME001HTJX_RUNTIME_RELEASE:-}" = "1" ] || fail "runtime fence closed; root must set ${RELEASE_FENCE_ENV}=1"
[ -n "$CANDIDATE_ROOT" ] || fail "FACTORY_CANDIDATE_ROOT is required"
[ -n "$EXPECTED_CANDIDATE" ] || fail "FACTORY_CANDIDATE_COMMIT is required"
[ -n "$EXPECTED_PARENT" ] || fail "FACTORY_ACCEPTED_PARENT is required"
[ "$EXPECTED_CANDIDATE" = "$PINNED_CANDIDATE" ] || fail "candidate commit must be exact R3 pin $PINNED_CANDIDATE"
[ "$EXPECTED_PARENT" = "$PINNED_PARENT" ] || fail "accepted parent must be exact R3 pin $PINNED_PARENT"
[ -n "$RECORD_ROOT" ] || fail "FACTORY_RECORD_ROOT is required"
case "$CANDIDATE_ROOT" in /*) ;; *) fail "candidate root must be an absolute path" ;; esac
case "$RECORD_ROOT" in /*) ;; *) fail "record root must be an absolute path" ;; esac
[ ! -e "$RECORD_ROOT" ] || fail "refusing to overwrite record root $RECORD_ROOT"
/bin/mkdir -p "$RECORD_ROOT" || fail "cannot create record root $RECORD_ROOT"
record_root=$RECORD_ROOT

candidate_root=$(CDPATH= cd "$CANDIDATE_ROOT" 2>/dev/null && /bin/pwd -P) || fail "candidate root unavailable: $CANDIDATE_ROOT"
baseline_root=$(CDPATH= cd "$BASELINE_ROOT" 2>/dev/null && /bin/pwd -P) || fail "baseline root unavailable: $BASELINE_ROOT"
[ "$candidate_root" = "$CANDIDATE_ROOT" ] || fail "candidate path mismatch: $candidate_root"
[ "$baseline_root" = "$BASELINE_ROOT" ] || fail "baseline path mismatch: $baseline_root"
case "$record_root/" in "$candidate_root/"*) fail "record root must be outside candidate checkout" ;; esac
case "$candidate_root/" in "$record_root/"*) fail "record root must not contain candidate checkout" ;; esac
case "$record_root/" in "$baseline_root/"*) fail "record root must be outside baseline checkout" ;; esac
case "$baseline_root/" in "$record_root/"*) fail "record root must not contain baseline checkout" ;; esac
[ -f "$SOURCE_FENCE_MANIFEST" ] || fail "factory source fence manifest unavailable: $SOURCE_FENCE_MANIFEST"
[ -f "$SOURCE_IDENTITY_RECEIPT" ] || fail "source identity receipt unavailable: $SOURCE_IDENTITY_RECEIPT"
identity_sha=$(/usr/bin/shasum -a 256 "$SOURCE_IDENTITY_RECEIPT" | /usr/bin/awk '{print $1}') || fail "cannot hash source identity receipt"
[ "$identity_sha" = "$EXPECTED_IDENTITY_RECEIPT_SHA" ] || fail "source identity receipt digest mismatch: $identity_sha"
manifest_sha=$(/usr/bin/shasum -a 256 "$SOURCE_FENCE_MANIFEST" | /usr/bin/awk '{print $1}') || fail "cannot hash factory source fence manifest"
[ "$manifest_sha" = "$EXPECTED_FENCE_MANIFEST_SHA" ] || fail "factory source fence manifest digest mismatch: $manifest_sha"

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

EXPECTED_PATHS=$(/usr/bin/cut -f 1 "$SOURCE_FENCE_MANIFEST" | /usr/bin/sort)
ACTUAL_PATHS=$(/usr/bin/git -C "$candidate_root" diff --name-only "$EXPECTED_PARENT" "$EXPECTED_CANDIDATE" -- | /usr/bin/sort) || fail "cannot inspect candidate changed paths"
[ "$ACTUAL_PATHS" = "$EXPECTED_PATHS" ] || fail "candidate must contain exactly the five factory paths: $ACTUAL_PATHS"

PLAYWRIGHT_ENTRY=$candidate_root/node_modules/playwright/index.mjs
[ -x "$NODE_BINARY" ] || fail "pinned Node binary unavailable: $NODE_BINARY"
[ -f "$NPM_BINARY" ] || fail "pinned npm entry point unavailable: $NPM_BINARY"
[ -x "$CHROME_BINARY" ] || fail "pinned Chrome binary unavailable: $CHROME_BINARY"
[ -f "$candidate_root/node_modules/playwright/package.json" ] || fail "private Playwright package unavailable"
[ -f "$PLAYWRIGHT_ENTRY" ] || fail "private Playwright entry unavailable: $PLAYWRIGHT_ENTRY"
[ -f "$candidate_root/node_modules/playwright-core/package.json" ] || fail "private Playwright core package unavailable"
[ -f "$candidate_root/node_modules/vite/package.json" ] || fail "private Vite package unavailable"

PLAYWRIGHT_ENTRY_SHA=$(/usr/bin/shasum -a 256 "$PLAYWRIGHT_ENTRY" | /usr/bin/awk '{print $1}') || fail "cannot hash private Playwright entry"
PLAYWRIGHT_PACKAGE_SHA=$(/usr/bin/shasum -a 256 "$candidate_root/node_modules/playwright/package.json" | /usr/bin/awk '{print $1}') || fail "cannot hash private Playwright package"
PLAYWRIGHT_CORE_SHA=$(/usr/bin/shasum -a 256 "$candidate_root/node_modules/playwright-core/package.json" | /usr/bin/awk '{print $1}') || fail "cannot hash private Playwright core package"
VITE_PACKAGE_SHA=$(/usr/bin/shasum -a 256 "$candidate_root/node_modules/vite/package.json" | /usr/bin/awk '{print $1}') || fail "cannot hash private Vite package"

/bin/mkdir -p "$record_root/home" "$record_root/tmp" "$record_root/npm-cache" "$record_root/playwright-browsers" "$record_root/preexisting-generated-reports/npm-default" "$record_root/new-generated-reports/npm-default"
/bin/cp -p "$SOURCE_FENCE_MANIFEST" "$record_root/source-fences-a71.tsv" || fail "cannot preserve source fence manifest"
/bin/cp -p "$SOURCE_IDENTITY_RECEIPT" "$record_root/source-identity-receipt.json" || fail "cannot preserve source identity receipt"
recorder_source=$SCRIPT_DIR/$(/usr/bin/basename "$0")
/bin/cp -p "$recorder_source" "$record_root/recorder-source.sh" || fail "cannot preserve the exact recorder source"
printf '%s\n' "recorder_path\t$recorder_source" "candidate_root\t$candidate_root" "candidate_commit\t$EXPECTED_CANDIDATE" "accepted_parent\t$EXPECTED_PARENT" "baseline_root\t$baseline_root" "baseline_commit\t$EXPECTED_BASELINE" "factory_source_commit\t$EXPECTED_FACTORY_SOURCE" "source_fence_manifest_sha256\t$manifest_sha" "source_identity_receipt_sha256\t$identity_sha" > "$record_root/pins.tsv"
printf '%s\n' "$0" > "$record_root/recorder-path.txt"
/usr/bin/shasum -a 256 "$0" | /usr/bin/awk '{print $1}' > "$record_root/recorder-sha256.txt"
/bin/pwd -P > "$record_root/recorder-launch-cwd.txt"
{
  printf 'FACTORY_CANDIDATE_ROOT\t%s\nFACTORY_CANDIDATE_COMMIT\t%s\nFACTORY_ACCEPTED_PARENT\t%s\nFACTORY_RECORD_ROOT\t%s\n' "$CANDIDATE_ROOT" "$EXPECTED_CANDIDATE" "$EXPECTED_PARENT" "$RECORD_ROOT"
  printf 'GAME001HTJX_RUNTIME_RELEASE\t%s\nSHARED_COMBAT_BASELINE_ROOT\t%s\n' "${GAME001HTJX_RUNTIME_RELEASE:-}" "$baseline_root"
} > "$record_root/recorder-request-environment.tsv"

fence_source() {
  gate=$1
  out=$record_root/$gate.source-fences.tsv
  actual_head=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD 2>/dev/null) || fail "$gate: cannot reread candidate HEAD"
  actual_parent=$(/usr/bin/git -C "$candidate_root" rev-parse HEAD^ 2>/dev/null) || fail "$gate: cannot reread candidate parent"
  actual_baseline=$(/usr/bin/git -C "$baseline_root" rev-parse HEAD 2>/dev/null) || fail "$gate: cannot reread baseline HEAD"
  [ "$actual_head" = "$EXPECTED_CANDIDATE" ] || fail "$gate: candidate HEAD changed: $actual_head"
  [ "$actual_parent" = "$EXPECTED_PARENT" ] || fail "$gate: candidate parent changed: $actual_parent"
  [ "$actual_baseline" = "$EXPECTED_BASELINE" ] || fail "$gate: baseline HEAD changed: $actual_baseline"
  actual_manifest_sha=$(/usr/bin/shasum -a 256 "$SOURCE_FENCE_MANIFEST" | /usr/bin/awk '{print $1}') || fail "$gate: cannot reread source manifest"
  [ "$actual_manifest_sha" = "$EXPECTED_FENCE_MANIFEST_SHA" ] || fail "$gate: source manifest changed: $actual_manifest_sha"
  actual_paths=$(/usr/bin/git -C "$candidate_root" diff --name-only "$EXPECTED_PARENT" "$EXPECTED_CANDIDATE" -- | /usr/bin/sort) || fail "$gate: cannot reread candidate changed paths"
  [ "$actual_paths" = "$EXPECTED_PATHS" ] || fail "$gate: candidate path set changed"
  {
    printf 'candidate_head\t%s\ncandidate_parent\t%s\nbaseline_head\t%s\nmanifest_sha256\t%s\n' "$actual_head" "$actual_parent" "$actual_baseline" "$actual_manifest_sha"
    printf 'path\texpected_blob\tactual_blob\texpected_sha256\tactual_sha256\n'
  } > "$out"
  fence_count=0
  tab=$(printf '\t')
  while IFS="$tab" read -r relative expected_blob expected_sha; do
    [ -n "$relative" ] || continue
    case "$relative" in /*|../*|*/../*|*/..) fail "$gate: unsafe relative source path: $relative" ;; esac
    source_path=$candidate_root/$relative
    [ -f "$source_path" ] || fail "$gate: missing fenced source: $relative"
    [ ! -L "$source_path" ] || fail "$gate: fenced source is a symlink: $relative"
    actual_blob=$(/usr/bin/git -C "$candidate_root" rev-parse "$EXPECTED_CANDIDATE:$relative" 2>/dev/null) || fail "$gate: cannot read Git blob for $relative"
    actual_sha=$(/usr/bin/shasum -a 256 "$source_path" | /usr/bin/awk '{print $1}') || fail "$gate: cannot hash $relative"
    [ "$actual_blob" = "$expected_blob" ] || fail "$gate: a71 blob mismatch for $relative: $actual_blob"
    [ "$actual_sha" = "$expected_sha" ] || fail "$gate: working-tree source mismatch for $relative: $actual_sha"
    printf '%s\t%s\t%s\t%s\t%s\n' "$relative" "$expected_blob" "$actual_blob" "$expected_sha" "$actual_sha" >> "$out"
    fence_count=$((fence_count + 1))
  done < "$SOURCE_FENCE_MANIFEST"
  [ "$fence_count" -eq "$EXPECTED_FENCE_COUNT" ] || fail "$gate: expected exactly five factory source fences, checked $fence_count"
}

fence_toolchain_files() {
  gate=$1
  current_entry=$(/usr/bin/shasum -a 256 "$PLAYWRIGHT_ENTRY" | /usr/bin/awk '{print $1}') || fail "$gate: cannot hash Playwright entry"
  current_package=$(/usr/bin/shasum -a 256 "$candidate_root/node_modules/playwright/package.json" | /usr/bin/awk '{print $1}') || fail "$gate: cannot hash Playwright package"
  current_core=$(/usr/bin/shasum -a 256 "$candidate_root/node_modules/playwright-core/package.json" | /usr/bin/awk '{print $1}') || fail "$gate: cannot hash Playwright core package"
  current_vite=$(/usr/bin/shasum -a 256 "$candidate_root/node_modules/vite/package.json" | /usr/bin/awk '{print $1}') || fail "$gate: cannot hash Vite package"
  [ "$current_entry" = "$PLAYWRIGHT_ENTRY_SHA" ] || fail "$gate: Playwright entry changed"
  [ "$current_package" = "$PLAYWRIGHT_PACKAGE_SHA" ] || fail "$gate: Playwright package changed"
  [ "$current_core" = "$PLAYWRIGHT_CORE_SHA" ] || fail "$gate: Playwright core package changed"
  [ "$current_vite" = "$VITE_PACKAGE_SHA" ] || fail "$gate: Vite package changed"
  printf 'playwright_entry\t%s\nplaywright_package\t%s\nplaywright_core_package\t%s\nvite_package\t%s\n' "$current_entry" "$current_package" "$current_core" "$current_vite" > "$record_root/$gate.toolchain-files.tsv"
}

RUNTIME_PATH=$NODE_BIN_DIR:$SYSTEM_PATH
RUNTIME_HOME=$record_root/home
RUNTIME_TMP=$record_root/tmp
RUNTIME_NPM_CACHE=$record_root/npm-cache
RUNTIME_PLAYWRIGHT_BROWSERS=$record_root/playwright-browsers
RUNTIME_SHIPPING_EVIDENCE=$record_root/new-generated-reports/release-isolation-evidence.json
PLAYWRIGHT_PACKAGE_ROOT=$candidate_root/node_modules/playwright

write_env() {
  gate=$1
  {
    printf 'PATH\t%s\nHOME\t%s\nTMPDIR\t%s\n' "$RUNTIME_PATH" "$RUNTIME_HOME" "$RUNTIME_TMP"
    printf 'SHARED_COMBAT_BASELINE_ROOT\t%s\nGAME001HTJX_RUNTIME_RELEASE\t1\n' "$baseline_root"
    printf 'GAME_BROWSER_CHROME\t%s\nGAME_BROWSER_PLAYWRIGHT\t%s\n' "$CHROME_BINARY" "$PLAYWRIGHT_ENTRY"
    printf 'PLAYWRIGHT_PACKAGE_ROOT\t%s\nPLAYWRIGHT_BROWSERS_PATH\t%s\n' "$PLAYWRIGHT_PACKAGE_ROOT" "$RUNTIME_PLAYWRIGHT_BROWSERS"
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
    printf '%s\n' "PLAYWRIGHT_PACKAGE_ROOT=$PLAYWRIGHT_PACKAGE_ROOT" "PLAYWRIGHT_BROWSERS_PATH=$RUNTIME_PLAYWRIGHT_BROWSERS"
    printf '%s\n' PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 "npm_config_cache=$RUNTIME_NPM_CACHE" npm_config_update_notifier=false
    printf '%s\n' "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUNTIME_SHIPPING_EVIDENCE" LANG=C LC_ALL=C CI=1 NO_COLOR=1
    for argument in "$@"; do printf '%s\n' "$argument"; done
  } > "$record_root/$gate.argv.txt"
}

snapshot_tree() {
  gate=$1
  root_pid=$2
  snapshot_name=$3
  /bin/ps -Ao pid=,ppid=,etime=,%cpu=,command= | /usr/bin/awk -v root="$root_pid" '
    { pid[NR]=$1; ppid[NR]=$2; row[NR]=$0 }
    END {
      keep[root]=1
      changed=1
      while (changed) {
        changed=0
        for (i=1; i<=NR; i++) if (keep[ppid[i]] && !keep[pid[i]]) { keep[pid[i]]=1; changed=1 }
      }
      for (i=1; i<=NR; i++) if (keep[pid[i]]) print row[i]
    }
  ' > "$record_root/$snapshot_name"
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
  printf 'SIGINT\treason=%s\npid_tree\t%s\n' "$reason" "$tree" >> "$record_root/01-repository-default-npm-test.stop.txt"
  for child_pid in $tree; do
    [ "$child_pid" = "$root_pid" ] && continue
    /bin/kill -INT "$child_pid" 2>/dev/null || true
  done
  /bin/kill -INT "$root_pid" 2>/dev/null || true
}

run_gate() {
  gate=$1
  shift
  fence_source "$gate"
  fence_toolchain_files "$gate"
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
    "PLAYWRIGHT_PACKAGE_ROOT=$PLAYWRIGHT_PACKAGE_ROOT" \
    "PLAYWRIGHT_BROWSERS_PATH=$RUNTIME_PLAYWRIGHT_BROWSERS" \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 \
    "npm_config_cache=$RUNTIME_NPM_CACHE" \
    npm_config_update_notifier=false \
    "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUNTIME_SHIPPING_EVIDENCE" \
    LANG=C LC_ALL=C CI=1 NO_COLOR=1 \
    "$@" > "$record_root/$gate.stdout" 2> "$record_root/$gate.stderr" &
  direct_pid=$!
  printf '%s\n' "$direct_pid" > "$record_root/$gate.pid"
  printf 'START\t%s\tdirect_pid=%s\tcwd=%s\n' "$gate" "$direct_pid" "$candidate_root"
  snapshot_tree "$gate" "$direct_pid" "$gate.process-snapshot-start.txt"
  (
    while /bin/kill -0 "$direct_pid" 2>/dev/null; do
      if [ "$gate" = "01-repository-default-npm-test" ] && /usr/bin/grep -Eq '^(not ok [0-9]+ |# fail [1-9][0-9]*$)' "$record_root/$gate.stdout"; then
        /bin/cp "$record_root/$gate.stdout" "$record_root/$gate.first-failure-raw-prefix.txt"
        /bin/cp "$record_root/$gate.stderr" "$record_root/$gate.first-failure-stderr-prefix.txt"
        stop_tree "$direct_pid" "first TAP failure marker observed; stop the default dispatcher"
        break
      fi
      snapshot_tree "$gate" "$direct_pid" "$gate.process-snapshot-live.txt"
      /bin/sleep 1
    done
  ) &
  monitor_pid=$!
  direct_exit=0
  wait "$direct_pid" || direct_exit=$?
  /bin/kill "$monitor_pid" 2>/dev/null || true
  wait "$monitor_pid" 2>/dev/null || true
  snapshot_tree "$gate" "$direct_pid" "$gate.process-snapshot-end.txt"
  printf '%s\n' "$direct_exit" > "$record_root/$gate.exit-code"
  printf '%s\t%s\t%s\n' "$gate" "$direct_pid" "$direct_exit" >> "$record_root/gates.tsv"
  printf 'EXIT\t%s\tdirect_exit=%s\n' "$gate" "$direct_exit"
  if [ "$direct_exit" -ne 0 ]; then
    printf 'STOP\tfirst nonzero at %s; raw output is preserved in %s\n' "$gate" "$record_root" >&2
    exit "$direct_exit"
  fi
}

REPORT_PATH=artifacts/guard-002r-round-1/release-isolation-evidence.json
GENERATED_ROOTS='artifacts/release-001b-round-2 artifacts/release-001w-round-1'
snapshot_ready=0
restoration_failure=0
capture_fatal=0

capture_problem() {
  message=$1
  printf '%s\n' "$message" >> "$record_root/worktree-capture-errors.txt"
  if [ "$capture_fatal" -eq 1 ]; then fail "$message"; fi
  restoration_failure=1
}

copy_changed_paths() {
  paths_file=$1
  destination_root=$2
  while IFS= read -r relative; do
    [ -n "$relative" ] || continue
    source_path=$candidate_root/$relative
    if [ -e "$source_path" ] || [ -L "$source_path" ]; then
      destination=$destination_root/$relative
      /bin/mkdir -p "$(/usr/bin/dirname "$destination")" || { capture_problem "cannot create evidence directory for $relative"; continue; }
      /usr/bin/ditto "$source_path" "$destination" || capture_problem "cannot preserve changed worktree file $relative"
    fi
  done < "$paths_file"
}

capture_worktree_changes() {
  stage=$1
  capture_fatal=$2
  stage_root=$record_root/worktree-changes/$stage
  /bin/mkdir -p "$stage_root/tracked-after" "$stage_root/untracked-after" || { capture_problem "cannot create worktree-change evidence directory for $stage"; return; }
  /usr/bin/git -C "$candidate_root" status --porcelain --untracked-files=all > "$stage_root/status-before-restore.txt" 2> "$stage_root/status.stderr" || capture_problem "cannot read status before $stage artifact restoration"
  /usr/bin/git -C "$candidate_root" diff --binary "$EXPECTED_CANDIDATE" -- > "$stage_root/tracked-worktree-diff.patch" 2> "$stage_root/tracked-worktree-diff.stderr" || capture_problem "cannot capture tracked diff for $stage"
  /usr/bin/git -C "$candidate_root" diff --name-only "$EXPECTED_CANDIDATE" -- > "$stage_root/tracked-paths.txt" 2> "$stage_root/tracked-paths.stderr" || capture_problem "cannot list tracked changes for $stage"
  /usr/bin/git -C "$candidate_root" ls-files --others --exclude-standard > "$stage_root/untracked-paths.txt" 2> "$stage_root/untracked-paths.stderr" || capture_problem "cannot list untracked changes for $stage"
  copy_changed_paths "$stage_root/tracked-paths.txt" "$stage_root/tracked-after"
  copy_changed_paths "$stage_root/untracked-paths.txt" "$stage_root/untracked-after"
  /usr/bin/awk 'index($0, "artifacts/") != 1 && NF { print }' "$stage_root/tracked-paths.txt" > "$stage_root/non-artifact-tracked-paths.txt"
  /usr/bin/awk 'index($0, "artifacts/") != 1 && NF { print }' "$stage_root/untracked-paths.txt" > "$stage_root/non-artifact-untracked-paths.txt"
  /usr/bin/awk 'index($0, "artifacts/") == 1 { print }' "$stage_root/tracked-paths.txt" > "$stage_root/artifact-tracked-paths.txt"
  /usr/bin/awk 'index($0, "artifacts/") == 1 { print }' "$stage_root/untracked-paths.txt" > "$stage_root/artifact-untracked-paths.txt"
  /usr/bin/find "$stage_root/tracked-after" "$stage_root/untracked-after" -type f -exec /usr/bin/shasum -a 256 {} \; > "$stage_root/after-files.sha256" 2>/dev/null || capture_problem "cannot checksum captured worktree files for $stage"

  while IFS= read -r relative; do
    [ -n "$relative" ] || continue
    /usr/bin/git -C "$candidate_root" restore --source="$EXPECTED_CANDIDATE" --worktree -- "$relative" || capture_problem "cannot restore generated tracked artifact $relative"
  done < "$stage_root/artifact-tracked-paths.txt"
  while IFS= read -r relative; do
    [ -n "$relative" ] || continue
    /bin/rm -f "$candidate_root/$relative" || capture_problem "cannot remove captured generated untracked artifact $relative"
  done < "$stage_root/artifact-untracked-paths.txt"

  if /usr/bin/git -C "$candidate_root" diff --quiet "$EXPECTED_CANDIDATE" -- artifacts/; then
    artifact_diff_status=0
  else
    artifact_diff_status=$?
  fi
  /usr/bin/git -C "$candidate_root" ls-files --others --exclude-standard -- artifacts/ > "$stage_root/artifact-untracked-after-restore.txt" 2> "$stage_root/artifact-untracked-after-restore.stderr" || capture_problem "cannot verify generated artifact restoration for $stage"
  {
    printf 'tracked_artifact_diff_exit\t%s\n' "$artifact_diff_status"
    if [ -s "$stage_root/artifact-untracked-after-restore.txt" ]; then printf 'untracked_artifacts\tremaining\n'; else printf 'untracked_artifacts\tnone\n'; fi
  } > "$stage_root/artifact-restoration-status.tsv"
  [ "$artifact_diff_status" -eq 0 ] || capture_problem "tracked artifacts did not restore exactly after $stage"
  [ ! -s "$stage_root/artifact-untracked-after-restore.txt" ] || capture_problem "untracked artifacts remain after $stage"

  if [ -f "$record_root/preexisting-generated-reports/artifacts/release-001b-round-2/evidence.json" ]; then
    /usr/bin/diff -r "$record_root/preexisting-generated-reports/artifacts/release-001b-round-2" "$candidate_root/artifacts/release-001b-round-2" > "$stage_root/release-001b-restoration.diff" 2>&1
    diff_exit=$?
    printf 'release-001b-diff-exit\t%s\n' "$diff_exit" >> "$record_root/artifact-restoration-verification.txt"
    [ "$diff_exit" -eq 0 ] || capture_problem "release-001b outputs did not match their pre-run snapshot after $stage"
  fi
  if [ -d "$record_root/preexisting-generated-reports/artifacts/release-001w-round-1" ]; then
    /usr/bin/diff -r "$record_root/preexisting-generated-reports/artifacts/release-001w-round-1" "$candidate_root/artifacts/release-001w-round-1" > "$stage_root/release-001w-restoration.diff" 2>&1
    diff_exit=$?
    printf 'release-001w-diff-exit\t%s\n' "$diff_exit" >> "$record_root/artifact-restoration-verification.txt"
    [ "$diff_exit" -eq 0 ] || capture_problem "release-001w outputs did not match their pre-run snapshot after $stage"
  fi
  if [ -f "$record_root/preexisting-generated-reports/$REPORT_PATH" ]; then
    /usr/bin/cmp -s "$record_root/preexisting-generated-reports/$REPORT_PATH" "$candidate_root/$REPORT_PATH"
    cmp_exit=$?
    printf 'shipping-isolation-cmp-exit\t%s\n' "$cmp_exit" >> "$record_root/artifact-restoration-verification.txt"
    [ "$cmp_exit" -eq 0 ] || capture_problem "shipping-isolation report did not match its pre-run snapshot after $stage"
  fi
}

finish() {
  final_status=$?
  trap - EXIT
  if [ "$snapshot_ready" -eq 1 ]; then
    capture_worktree_changes finalizer 0
  fi
  /usr/bin/git -C "$candidate_root" status --porcelain --untracked-files=all > "$record_root/post-restore-candidate-status.txt" 2>&1 || true
  /usr/bin/git -C "$baseline_root" status --porcelain --untracked-files=all > "$record_root/post-run-baseline-status.txt" 2>&1 || true
  if [ -d "$record_root/release-artifact" ]; then
    /usr/bin/find "$record_root/release-artifact" -type f -print | sort > "$record_root/release-artifact-files.txt"
    /usr/bin/find "$record_root/release-artifact" -type f -exec /usr/bin/shasum -a 256 {} \; > "$record_root/release-artifact.sha256"
  fi
  /bin/rm -rf "$record_root/home" "$record_root/tmp" "$record_root/npm-cache" "$record_root/playwright-browsers"
  if [ "$restoration_failure" -ne 0 ]; then final_status=1; fi
  printf 'recorder_exit\t%s\n' "$final_status" > "$record_root/recorder-exit.txt"
  exit "$final_status"
}

cd "$candidate_root" || fail "cannot enter candidate checkout"

# Preserve the known fixed report roots; the pinned clean candidate commit holds all other originals.
/bin/mkdir -p "$record_root/preexisting-generated-reports/artifacts"
for generated_root in $GENERATED_ROOTS; do
  [ -d "$candidate_root/$generated_root" ] || fail "expected generated-report root unavailable: $generated_root"
  /bin/mkdir -p "$record_root/preexisting-generated-reports/$generated_root"
  /usr/bin/ditto "$candidate_root/$generated_root" "$record_root/preexisting-generated-reports/$generated_root" || fail "cannot preserve $generated_root"
done
[ -f "$candidate_root/$REPORT_PATH" ] || fail "pre-existing shipping-isolation report unavailable"
/bin/mkdir -p "$record_root/preexisting-generated-reports/artifacts/guard-002r-round-1"
/bin/cp -p "$candidate_root/$REPORT_PATH" "$record_root/preexisting-generated-reports/$REPORT_PATH" || fail "cannot preserve $REPORT_PATH"
/usr/bin/find "$record_root/preexisting-generated-reports/artifacts" -type f -print | sort > "$record_root/preexisting-generated-reports/files.txt"
/usr/bin/find "$record_root/preexisting-generated-reports/artifacts" -type f -exec /usr/bin/shasum -a 256 {} \; > "$record_root/preexisting-generated-reports/sha256.txt"
printf 'artifact\tverification\n' > "$record_root/artifact-restoration-verification.txt"
snapshot_ready=1
trap finish EXIT

printf 'gate\tdirect_pid\tdirect_exit\n' > "$record_root/gates.tsv"
printf 'check\tactual\texpected\n' > "$record_root/toolchain-checks.tsv"

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

run_gate 01-repository-default-npm-test "$NPM_BINARY" test
capture_worktree_changes after-default-test 1
if [ -s "$record_root/worktree-changes/after-default-test/non-artifact-tracked-paths.txt" ] || [ -s "$record_root/worktree-changes/after-default-test/non-artifact-untracked-paths.txt" ]; then
  fail "default npm test left changes outside artifacts/; inspect preserved diffs before any release build"
fi
run_gate 02-retained-release-artifact "$NODE_BINARY" scripts/build-release.js --out "$record_root/release-artifact"
[ -d "$record_root/release-artifact" ] || fail "retained release artifact directory missing"
/usr/bin/find "$record_root/release-artifact" -type f -print | sort > "$record_root/release-artifact-files.txt"
[ -s "$record_root/release-artifact-files.txt" ] || fail "retained release artifact contains no files"
printf 'COMPLETE\trepository default npm test and retained release artifact passed\n' > "$record_root/qualification-result.txt"
