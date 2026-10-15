#!/bin/bash
set -u

ROOT=/tmp/release-guard-path-001-builder-bd9125
ARTIFACT_BASE="$ROOT/artifacts/release-guard-path-round-1/builder"
NODE_BIN=/Users/me/.hermes/node/bin/node
NPM_BIN=/Users/me/.local/bin/npm
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLAYWRIGHT="$ROOT/node_modules/playwright/index.mjs"
CLEAN_PATH=/Users/me/.hermes/node/bin:/Users/me/.local/bin:/usr/bin:/bin:/opt/homebrew/bin
ENV_BIN=/usr/bin/env
mkdir -p "$ARTIFACT_BASE/native-runs"
RUN_DIR="$("$ENV_BIN" /usr/bin/mktemp -d "$ARTIFACT_BASE/native-runs/attempt-guard-XXXXXX")"
DISTINCT_TMPDIR="$RUN_DIR/distinct-tmpdir"
mkdir -p "$DISTINCT_TMPDIR"
ORIGINAL_DIR="$RUN_DIR/report-originals"
CAPTURED_DIR="$RUN_DIR/report-generated"
REPORT_DIR="$ROOT/artifacts/release-001b-round-2"
REPORTS="artifacts/release-001b-round-2/evidence.json
artifacts/release-001b-round-2/escaped-css-producer-rejection.json
artifacts/release-001b-round-2/opaque-srcdoc-producer-rejection.json
artifacts/release-001b-round-2/external-base-producer-rejection.json
artifacts/release-asset-round-1/builder/pages-painted-briar.json
artifacts/release-asset-round-1/builder/pages-painted-briar.png
artifacts/guard-002r-round-1/release-isolation-evidence.json"
REPORTS_ACTIVE=0
REPORTS_FINALIZED=0
REPORT_RESTORE_FAILED=0

write_source_fence() {
  local output="$1"
  local file_list="$output.files"
  {
    /usr/bin/find src scripts tests public demo/assets docs reference/stats .github -print
    printf '%s\n' package.json package-lock.json LICENSE NOTICE index.html
  } | LC_ALL=C /usr/bin/sort > "$file_list"
  : > "$output"
  local path
  while IFS= read -r path; do
    if [[ -L "$path" ]]; then
      printf 'SYMLINK %s %s\n' "$path" "$(/usr/bin/readlink "$path")" >> "$output"
    elif [[ -f "$path" ]]; then
      /usr/bin/shasum -a 256 "$path" >> "$output"
    elif [[ -d "$path" ]]; then
      printf 'DIRECTORY %s\n' "$path" >> "$output"
    else
      printf 'MISSING %s\n' "$path" >> "$output"
    fi
  done < "$file_list"
}

prepare_reports() {
  mkdir -p "$ORIGINAL_DIR" "$CAPTURED_DIR"
  local report
  for report in $REPORTS; do
    if [[ -f "$ROOT/$report" ]]; then
      mkdir -p "$ORIGINAL_DIR/$(dirname "$report")"
      /bin/cp -p "$ROOT/$report" "$ORIGINAL_DIR/$report"
    else
      mkdir -p "$ORIGINAL_DIR/$(dirname "$report")"
      : > "$ORIGINAL_DIR/$report.missing-before"
    fi
  done
  REPORTS_ACTIVE=1
}

finalize_reports() {
  [[ "$REPORTS_ACTIVE" -eq 1 && "$REPORTS_FINALIZED" -eq 0 ]] || return 0
  local report
  for report in $REPORTS; do
    if [[ -f "$ROOT/$report" ]]; then
      mkdir -p "$CAPTURED_DIR/$(dirname "$report")"
      /bin/cp -p "$ROOT/$report" "$CAPTURED_DIR/$report"
    fi
    if [[ -f "$ORIGINAL_DIR/$report" ]]; then
      mkdir -p "$ROOT/$(dirname "$report")"
      /bin/cp -p "$ORIGINAL_DIR/$report" "$ROOT/$report"
      if ! /usr/bin/cmp -s "$ORIGINAL_DIR/$report" "$ROOT/$report"; then
        printf 'MISMATCH %s\n' "$report" >> "$RUN_DIR/report-restore-check.txt"
        REPORT_RESTORE_FAILED=1
      else
        printf 'RESTORED %s\n' "$report" >> "$RUN_DIR/report-restore-check.txt"
      fi
    else
      /bin/rm -f "$ROOT/$report"
      if [[ -e "$ROOT/$report" ]]; then
        printf 'MISMATCH expected-absent %s\n' "$report" >> "$RUN_DIR/report-restore-check.txt"
        REPORT_RESTORE_FAILED=1
      else
        printf 'RESTORED-ABSENT %s\n' "$report" >> "$RUN_DIR/report-restore-check.txt"
      fi
    fi
  done
  if /usr/bin/find "$CAPTURED_DIR" -type f -print -quit | /usr/bin/grep -q .; then
    /usr/bin/find "$CAPTURED_DIR" -type f -exec /usr/bin/shasum -a 256 {} \; > "$CAPTURED_DIR.sha256"
  else
    : > "$CAPTURED_DIR.sha256"
  fi
  REPORTS_FINALIZED=1
  REPORTS_ACTIVE=0
}

on_exit() {
  local final_code=$?
  finalize_reports
  write_source_fence "$RUN_DIR/source-after.sha256"
  if ! /usr/bin/cmp -s "$RUN_DIR/source-before.sha256.files" "$RUN_DIR/source-after.sha256.files" || \
     ! /usr/bin/cmp -s "$RUN_DIR/source-before.sha256" "$RUN_DIR/source-after.sha256"; then
    {
      /usr/bin/diff -u "$RUN_DIR/source-before.sha256.files" "$RUN_DIR/source-after.sha256.files" || true
      /usr/bin/diff -u "$RUN_DIR/source-before.sha256" "$RUN_DIR/source-after.sha256" || true
    } > "$RUN_DIR/source-fence.diff"
    printf 'Native gates changed a fenced source, test, package, workflow, art, or stats path.\n' >&2
    final_code=3
  fi
  if [[ "$REPORT_RESTORE_FAILED" -ne 0 ]]; then
    printf 'One or more generated reports could not be restored byte-for-byte.\n' >&2
    final_code=4
  fi
  printf 'SOURCE_BEFORE=%s\nSOURCE_AFTER=%s\nRUN_DIR=%s\n' \
    "$RUN_DIR/source-before.sha256" "$RUN_DIR/source-after.sha256" "$RUN_DIR"
  trap - EXIT
  exit "$final_code"
}
trap on_exit EXIT

cd "$ROOT"
if [[ ! -x "$NODE_BIN" || ! -x "$NPM_BIN" || ! -x "$CHROME" || ! -f "$PLAYWRIGHT" ]]; then
  printf 'Native gate preflight failed: pinned runtime path is absent.\n' >&2
  exit 2
fi
if ! /usr/bin/grep -q '"version": "1.58.2"' "$ROOT/node_modules/playwright/package.json"; then
  printf 'Native gate preflight failed: private Playwright is not 1.58.2.\n' >&2
  exit 2
fi

write_source_fence "$RUN_DIR/source-before.sha256"
printf 'RUN_DIR=%s\n' "$RUN_DIR"
{
  printf 'NODE=%s\n' "$NODE_BIN"
  "$NODE_BIN" --version
  printf 'NPM=%s\n' "$NPM_BIN"
  "$NPM_BIN" --version
  printf 'CHROME=%s\n' "$CHROME"
  "$CHROME" --version
  printf 'PLAYWRIGHT=%s\n' "$PLAYWRIGHT"
  /usr/bin/grep '"version":' "$ROOT/node_modules/playwright/package.json" | /usr/bin/head -n 1
} > "$RUN_DIR/runtime-paths.txt"
printf '%s\n' "$ROOT" > "$RUN_DIR/cwd.txt"
git rev-parse HEAD > "$RUN_DIR/source-commit.txt"
printf '%s\n' "$DISTINCT_TMPDIR" > "$RUN_DIR/distinct-tmpdir.path"

run_gate() {
  local name="$1"
  shift
  local prefix="$RUN_DIR/$name"
  printf '%s\n' "$ROOT" > "$prefix.cwd.txt"
  printf '%q ' "$@" > "$prefix.command.txt"
  printf '\n' >> "$prefix.command.txt"
  "$@" > "$prefix.stdout.raw" 2> "$prefix.stderr.raw" &
  local child_pid="$!"
  printf '%s\n' "$child_pid" > "$prefix.pid.txt"
  printf 'GATE_STARTED=%s PID=%s RECEIPT=%s\n' "$name" "$child_pid" "$prefix"
  wait "$child_pid"
  local child_exit="$?"
  printf '%s\n' "$child_exit" > "$prefix.exit.txt"
  /usr/bin/shasum -a 256 "$prefix.command.txt" "$prefix.cwd.txt" "$prefix.pid.txt" \
    "$prefix.stdout.raw" "$prefix.stderr.raw" "$prefix.exit.txt" > "$prefix.sha256"
  printf 'GATE=%s EXIT=%s PID=%s RECEIPT=%s\n' "$name" "$child_exit" "$child_pid" "$prefix"
  return "$child_exit"
}

run_gate focused-guard-tmpdir-root "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NODE_BIN" --test tests/release-001b-guards.test.js
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

run_gate focused-guard-distinct-tmpdir "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=$DISTINCT_TMPDIR" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NODE_BIN" --test tests/release-001b-guards.test.js
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

prepare_reports
run_gate release-build "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NPM_BIN" run test:release-build
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

run_gate shipping-isolation-guard "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NPM_BIN" run test:shipping-isolation-guard
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

run_gate shipping-isolation-release "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "SHIPPING_ISOLATION_RELEASE_EVIDENCE=$RUN_DIR/shipping-isolation-release-evidence.json" \
  "$NPM_BIN" run test:shipping-isolation-release
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

run_gate shipping-isolation-host "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NPM_BIN" run test:shipping-isolation-host
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

run_gate publication-pages "$ENV_BIN" -i \
  "PATH=$CLEAN_PATH" "HOME=/Users/me" "TMPDIR=/tmp" "LANG=en_US.UTF-8" \
  "GAME_BROWSER_CHROME=$CHROME" "GAME_BROWSER_PLAYWRIGHT=$PLAYWRIGHT" \
  "$NPM_BIN" run test:publication-pages
gate_exit="$?"
[[ "$gate_exit" -eq 0 ]] || exit "$gate_exit"

printf 'All release guard native gates returned zero.\n'
