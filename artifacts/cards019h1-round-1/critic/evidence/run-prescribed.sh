#!/usr/bin/env bash
set +e
EVIDENCE=/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/cards019h1-round-1/critic/evidence
mkdir -p "$EVIDENCE"
printf '%s\n' "$$" > "$EVIDENCE/runner.pid"
printf 'name\texit_code\tstatus\n' > "$EVIDENCE/runs.tsv"
run_gate() {
  local name="$1"
  shift
  printf '%s\t\tstarted\n' "$name" >> "$EVIDENCE/runs.tsv"
  "$@" > "$EVIDENCE/$name.raw.tap" 2>&1
  local code=$?
  printf '%s\t%s\t%s\n' "$name" "$code" "$([ "$code" -eq 0 ] && printf pass || printf fail)" >> "$EVIDENCE/runs.tsv"
}
run_gate game-roster-troops-ordinary npm run test:game-roster-troops-ordinary
run_gate game-roster-troops-projectile npm run test:game-roster-troops-projectile
run_gate game-roster-troops-projectile-profiles npm run test:game-roster-troops-projectile-profiles
run_gate game-roster-troop-profiles npm run test:game-roster-troop-profiles
run_gate game-roster-admission npm run test:game-roster-admission
run_gate game-roster-buildings npm test -- game-roster-buildings
run_gate game-session npm run test:game-session
run_gate rl-environment npm run test:rl-environment
run_gate content-schema npm run test:content-schema
run_gate nondeterminism-guard npm run test:nondeterminism-guard
run_gate shipping-isolation-guard npm run test:shipping-isolation-guard
run_gate shipping-isolation-release npm run test:shipping-isolation-release
run_gate shipping-isolation-host npm run test:shipping-isolation-host
run_gate integration-audit npm run test:integration-audit
printf 'all-prescribed-gates-complete\n'
