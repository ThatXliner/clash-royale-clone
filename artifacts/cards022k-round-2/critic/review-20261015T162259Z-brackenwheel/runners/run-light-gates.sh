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
  printf 'cwd=%s\nargv=' "$PWD" > "$base.command.txt"
  printf '%q ' "$@" >> "$base.command.txt"
  printf '\nenvironment=TMPDIR=%s\n' "${TMPDIR:-<unset>}" >> "$base.command.txt"
  "$@" > "$base.stdout" 2> "$base.stderr"
  local rc=$?
  printf '%s\n' "$rc" > "$base.exit"
  printf '\n=== %s (exit %s) ===\n' "$name" "$rc"
  tail -n 18 "$base.stdout"
  if [ -s "$base.stderr" ]; then
    printf '%s\n' '--- stderr tail ---'
    tail -n 18 "$base.stderr"
  fi
  if [ "$rc" -ne 0 ]; then FAILED=1; fi
}

run focused-suite "$NODE" --test \
  tests/cards-basic-melee.test.js \
  tests/cards-basic-ranged.test.js \
  tests/cards022k-brackenwheel.test.js \
  tests/game-roster-troop-profiles.test.js \
  tests/game-roster-troops-ordinary.test.js \
  tests/game-roster-troops-projectile-profiles.test.js
run nondeterminism-guard "$NPM" run test:nondeterminism-guard
run game-roster-admission "$NPM" run test:game-roster-admission
run integration-audit "$NPM" run test:integration-audit
run shipping-isolation-guard "$NPM" run test:shipping-isolation-guard
run area-damage "$NPM" run test:area-damage
run melee "$NPM" run test:melee
run melee-area "$NODE" --test tests/melee-area.test.js
run game-session "$NPM" run test:game-session
run game-history-cap "$NPM" run test:game-history-cap
run editable-deck "$NPM" run test:editable-deck
run deck "$NPM" run test:deck
run elixir "$NPM" run test:elixir
run playable-roster "$NPM" run test:playable-roster
run rl-environment "$NPM" run test:rl-environment

printf '\n=== exit ledger ===\n'
for result in "$EVIDENCE_DIR"/tests/*.exit; do
  printf '%s=' "${result##*/}"
  cat "$result"
done
exit "$FAILED"
