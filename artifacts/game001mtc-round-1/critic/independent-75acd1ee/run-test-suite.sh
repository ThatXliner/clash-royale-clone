#!/bin/sh
set -u
label=$1
source_root=$2
packet=/private/tmp/game001mtc-critic.0m4ONi/evidence
node_bin=/Users/me/.hermes/node/bin
run_dir="$packet/attempt-$label"
mkdir -p "$run_dir"
cd "$source_root"
{
  printf 'label=%s\n' "$label"
  printf 'source_root=%s\n' "$source_root"
  printf 'cwd=%s\n' "$PWD"
  printf 'argv=npm run test:game-roster-troops-movement\n'
  printf 'node='; "$node_bin/node" --version
  printf 'npm='; "$node_bin/npm" --version
  printf 'node_path='; command -v node
  printf 'npm_path='; command -v npm
  printf 'env:\n'; env | sort
} > "$run_dir/launch-record.txt"
"$node_bin/node" "$packet/capture-source-fence.mjs" "$source_root" > "$run_dir/source-fence-before.txt"
npm run test:game-roster-troops-movement > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt" &
test_pid=$!
printf '%s\n' "$test_pid" > "$run_dir/direct-pid.txt"
wait "$test_pid"
test_status=$?
printf '%s\n' "$test_status" > "$run_dir/exit-code.txt"
"$node_bin/node" "$packet/capture-source-fence.mjs" "$source_root" > "$run_dir/source-fence-after.txt"
if cmp -s "$run_dir/source-fence-before.txt" "$run_dir/source-fence-after.txt"; then
  printf 'source_fence=unchanged\n' > "$run_dir/source-fence-result.txt"
else
  printf 'source_fence=CHANGED\n' > "$run_dir/source-fence-result.txt"
fi
printf '%s pid=%s exit=%s\n' "$label" "$test_pid" "$test_status"
exit "$test_status"
