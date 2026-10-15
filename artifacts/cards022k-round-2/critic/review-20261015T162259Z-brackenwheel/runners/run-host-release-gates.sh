#!/bin/bash
set +e
export PATH=/Users/me/.hermes/node/bin:/Users/me/.local/bin:$PATH

EVIDENCE_DIR=/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/cards022k-round-2/critic/review-20261015T162259Z-brackenwheel
NODE=/Users/me/.hermes/node/bin/node
NPM=/Users/me/.local/bin/npm
FAILED=0

run() {
  local name="$1"
  shift
  local base="$EVIDENCE_DIR/tests/$name"
  {
    printf 'cwd=%s\nargv=' "$PWD"
    printf '%q ' "$@"
    printf '\nenvironment=TMPDIR=%s\n' "${TMPDIR:-<unset>}"
    printf 'GAME_BROWSER_PLAYWRIGHT=%s\n' "${GAME_BROWSER_PLAYWRIGHT:-<unset; pinned test default>}"
    printf 'GAME_BROWSER_CHROME=%s\n' "${GAME_BROWSER_CHROME:-<unset; pinned test default>}"
    printf 'SHIPPING_ISOLATION_RELEASE_EVIDENCE=%s\n' "${SHIPPING_ISOLATION_RELEASE_EVIDENCE:-<unset>}"
  } > "$base.command.txt"
  "$@" > "$base.stdout" 2> "$base.stderr"
  local rc=$?
  printf '%s\n' "$rc" > "$base.exit"
  printf '\n=== %s (exit %s) ===\n' "$name" "$rc"
  tail -n 22 "$base.stdout"
  if [ -s "$base.stderr" ]; then
    printf '%s\n' '--- stderr tail ---'
    tail -n 22 "$base.stderr"
  fi
  if [ "$rc" -ne 0 ]; then FAILED=1; fi
}

run shipping-isolation-host "$NPM" run test:shipping-isolation-host

export SHIPPING_ISOLATION_RELEASE_EVIDENCE="$EVIDENCE_DIR/release-isolation-evidence.json"
run shipping-isolation-release "$NPM" run test:shipping-isolation-release

printf '\n=== host/release exit ledger ===\n'
for result in "$EVIDENCE_DIR"/tests/shipping-isolation-{host,release}.exit; do
  printf '%s=' "${result##*/}"
  cat "$result"
done
exit "$FAILED"
