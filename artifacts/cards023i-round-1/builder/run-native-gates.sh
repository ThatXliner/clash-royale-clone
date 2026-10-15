#!/bin/bash
set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
cd "$ROOT"

ARTIFACT_BASE="$ROOT/artifacts/cards023i-round-1/builder"
mkdir -p "$ARTIFACT_BASE/native-runs"
RUN_DIR="$(mktemp -d "$ARTIFACT_BASE/native-runs/attempt-XXXXXX")"
NODE_BIN="/Users/me/.hermes/node/bin/node"
NPM_BIN="/Users/me/.local/bin/npm"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PLAYWRIGHT="$ROOT/node_modules/playwright/index.mjs"
REPORT_DIR="$ROOT/artifacts/release-001b-round-2"
ORIGINAL_DIR="$RUN_DIR/release-001b-originals"
CAPTURED_DIR="$RUN_DIR/release-001b-generated"
REPORTS=(
  evidence.json
  escaped-css-producer-rejection.json
  opaque-srcdoc-producer-rejection.json
  external-base-producer-rejection.json
)
RELEASE_REPORTS_ACTIVE=0
RELEASE_REPORTS_FINALIZED=0

PROTECTED_ROOTS=(src scripts tests public demo/assets docs/art reference/stats)
PACKAGE_FILES=(package.json package-lock.json)

write_source_fence() {
  local output="$1"
  local file_list="$output.files"
  {
    local root
    for root in "${PROTECTED_ROOTS[@]}"; do
      find "$root" -print
    done
    printf '%s\n' "${PACKAGE_FILES[@]}"
  } | LC_ALL=C sort > "$file_list"
  : > "$output"
  local path
  while IFS= read -r path; do
    if [[ -L "$path" ]]; then
      printf 'SYMLINK %s %s\n' "$path" "$(readlink "$path")" >> "$output"
    elif [[ -f "$path" ]]; then
      shasum -a 256 "$path" >> "$output"
    elif [[ -d "$path" ]]; then
      printf 'DIRECTORY %s\n' "$path" >> "$output"
    else
      printf 'MISSING %s\n' "$path" >> "$output"
    fi
  done < "$file_list"
}

if [[ ! -x "$NODE_BIN" || ! -x "$NPM_BIN" || ! -x "$CHROME" || ! -f "$PLAYWRIGHT" ]]; then
  printf 'Native gate preflight failed: a pinned Node/npm/Chrome/Playwright path is absent.\n' >&2
  exit 2
fi
if ! /usr/bin/grep -q '"version": "1.58.2"' "$ROOT/node_modules/playwright/package.json"; then
  printf 'Native gate preflight failed: private Playwright package is not 1.58.2.\n' >&2
  exit 2
fi

write_source_fence "$RUN_DIR/source-before.sha256"
printf 'EVIDENCE_DIR=%s\n' "$RUN_DIR"
printf 'NODE=%s\nNPM=%s\nCHROME=%s\nPLAYWRIGHT=%s\n' \
  "$NODE_BIN" "$NPM_BIN" "$CHROME" "$PLAYWRIGHT" > "$RUN_DIR/runtime-paths.txt"

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
  wait "$child_pid"
  local status="$?"
  printf '%s\n' "$status" > "$prefix.exit.txt"
  shasum -a 256 "$prefix.command.txt" "$prefix.cwd.txt" "$prefix.pid.txt" \
    "$prefix.stdout.raw" "$prefix.stderr.raw" "$prefix.exit.txt" > "$prefix.sha256"
  printf 'GATE=%s EXIT=%s RECEIPT=%s\n' "$name" "$status" "$prefix"
  return "$status"
}

prepare_release_reports() {
  mkdir -p "$ORIGINAL_DIR" "$CAPTURED_DIR"
  local report
  for report in "${REPORTS[@]}"; do
    if [[ -f "$REPORT_DIR/$report" ]]; then
      cp -p "$REPORT_DIR/$report" "$ORIGINAL_DIR/$report"
    else
      : > "$ORIGINAL_DIR/$report.missing-before-run"
    fi
  done
  RELEASE_REPORTS_ACTIVE=1
}

finalize_release_reports() {
  [[ "$RELEASE_REPORTS_ACTIVE" -eq 1 && "$RELEASE_REPORTS_FINALIZED" -eq 0 ]] || return 0
  local report
  for report in "${REPORTS[@]}"; do
    if [[ -f "$REPORT_DIR/$report" ]]; then
      cp -p "$REPORT_DIR/$report" "$CAPTURED_DIR/$report"
    fi
    if [[ -f "$ORIGINAL_DIR/$report" ]]; then
      cp -p "$ORIGINAL_DIR/$report" "$REPORT_DIR/$report"
    else
      rm -f "$REPORT_DIR/$report"
    fi
  done
  if compgen -G "$CAPTURED_DIR/*.json" > /dev/null; then
    shasum -a 256 "$CAPTURED_DIR"/*.json > "$CAPTURED_DIR.sha256"
  else
    : > "$CAPTURED_DIR.sha256"
  fi
  RELEASE_REPORTS_FINALIZED=1
  RELEASE_REPORTS_ACTIVE=0
}
trap finalize_release_reports EXIT INT TERM

run_gate app-shell env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  APP_SHELL_ARTIFACTS="$RUN_DIR/app-shell" \
  "$NPM_BIN" run test:app-shell
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate cards023-browser env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  CARDS023I_ARTIFACTS="$RUN_DIR/cards023-browser" \
  "$NODE_BIN" --test tests/cards023-browser-integration.test.js
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate ui-combat-state env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:ui-combat-state
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate game-ui-projection env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:game-ui-projection
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate nondeterminism-guard env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:nondeterminism-guard
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate visual-asset-manifest env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:visual-asset-manifest
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate shipping-isolation-guard env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:shipping-isolation-guard
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

prepare_release_reports
run_gate release-build env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:release-build
status="$?"
finalize_release_reports
[[ "$status" -eq 0 ]] || exit "$status"

run_gate shipping-isolation-release env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  SHIPPING_ISOLATION_RELEASE_EVIDENCE="$RUN_DIR/shipping-isolation-release-evidence.json" \
  "$NPM_BIN" run test:shipping-isolation-release
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

run_gate shipping-isolation-host env \
  GAME_BROWSER_CHROME="$CHROME" \
  GAME_BROWSER_PLAYWRIGHT="$PLAYWRIGHT" \
  "$NPM_BIN" run test:shipping-isolation-host
status="$?"
[[ "$status" -eq 0 ]] || exit "$status"

write_source_fence "$RUN_DIR/source-after.sha256"
if ! cmp -s "$RUN_DIR/source-before.sha256.files" "$RUN_DIR/source-after.sha256.files" || \
   ! cmp -s "$RUN_DIR/source-before.sha256" "$RUN_DIR/source-after.sha256"; then
  {
    diff -u "$RUN_DIR/source-before.sha256.files" "$RUN_DIR/source-after.sha256.files" || true
    diff -u "$RUN_DIR/source-before.sha256" "$RUN_DIR/source-after.sha256" || true
  } > "$RUN_DIR/source-fence.diff"
  printf 'Native gates changed protected production, test, package, asset, art, or stats files.\n' >&2
  exit 3
fi
printf 'All native gates returned zero and source fences match. Inspect the recorded Chrome version before accepting.\n'
