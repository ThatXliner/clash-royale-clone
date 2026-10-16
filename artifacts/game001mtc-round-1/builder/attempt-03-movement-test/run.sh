#!/bin/sh
set -u

checkout=/private/tmp/game001mtc-builder-69da
run_dir=/private/tmp/game001mtc-builder-69da/artifacts/game001mtc-round-1/builder/attempt-03-movement-test
npm_bin=/Users/me/.hermes/node/bin/npm

cd "$checkout" || exit 125
umask 077

env -i PATH="/Users/me/.hermes/node/bin:/usr/bin:/bin" \
  "$npm_bin" run test:game-roster-troops-movement \
  > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt" &
npm_pid=$!
printf '%s\n' "$npm_pid" > "$run_dir/direct-pid.txt"
wait "$npm_pid"
npm_status=$?
printf '%s\n' "$npm_status" > "$run_dir/exit-code.txt"
exit "$npm_status"
