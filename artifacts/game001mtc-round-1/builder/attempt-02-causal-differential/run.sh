#!/bin/sh
set -u

checkout=/private/tmp/game001mtc-builder-69da
run_dir=/private/tmp/game001mtc-builder-69da/artifacts/game001mtc-round-1/builder/attempt-02-causal-differential
node_bin=/Users/me/.hermes/node/bin/node
script=artifacts/game001mtc-round-1/builder/attempt-02-causal-differential/historical-current-differential.mjs

cd "$checkout" || exit 125
umask 077

env -i PATH="/Users/me/.hermes/node/bin:/usr/bin:/bin" \
  "$node_bin" "$script" > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt" &
node_pid=$!
printf '%s\n' "$node_pid" > "$run_dir/direct-pid.txt"
wait "$node_pid"
node_status=$?
printf '%s\n' "$node_status" > "$run_dir/exit-code.txt"
exit "$node_status"
