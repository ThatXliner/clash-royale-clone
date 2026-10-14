#!/bin/sh
set +e
art=/tmp/melee-area-critic-b5c735/critic
: > "$art/status.tsv"
run_case() {
  name=$1
  shift
  "$@" > "$art/$name.tap" 2>&1
  code=$?
  printf '%s\t%s\n' "$name" "$code" >> "$art/status.tsv"
}
run_case melee-area node --test tests/melee-area.test.js
run_case battle-combat npm run test:battle-combat
run_case battle-towers-kernel npm run test:battle-towers-kernel
run_case nondeterminism-guard npm run test:nondeterminism-guard
run_case ordinary-troop-roster npm run test:game-roster-troops-ordinary
run_case projectile-troop-roster npm run test:game-roster-troops-projectile
run_case melee npm run test:melee
run_case area-damage npm run test:area-damage
run_case game-session npm run test:game-session
run_case content-schema npm run test:content-schema
run_case rl-environment npm run test:rl-environment
run_case release-build npm run test:release-build
