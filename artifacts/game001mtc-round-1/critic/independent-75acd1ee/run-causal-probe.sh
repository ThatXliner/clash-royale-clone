#!/bin/sh
set -u
label=causal-probe
packet=/private/tmp/game001mtc-critic.0m4ONi/evidence
sources=/private/tmp/game001mtc-critic-sources.0m4ONi
node_bin=/Users/me/.hermes/node/bin
run_dir="$packet/attempt-causal-probe"
mkdir -p "$run_dir"
cd "$sources"
{
  printf 'label=%s\n' "$label"
  printf 'cwd=%s\n' "$PWD"
  printf 'argv=%s\n' "$node_bin/node $packet/historical-current-causal-probe.mjs $sources/historical $sources/candidate $run_dir/probe-data.json"
  printf 'node='; "$node_bin/node" --version
  printf 'npm='; "$node_bin/npm" --version
  printf 'node_path='; command -v node
  printf 'npm_path='; command -v npm
  printf 'env:\n'; env | sort
} > "$run_dir/launch-record.txt"
"$node_bin/node" "$packet/capture-source-fence.mjs" "$sources/historical" > "$run_dir/historical-source-fence-before.txt"
"$node_bin/node" "$packet/capture-source-fence.mjs" "$sources/candidate" > "$run_dir/candidate-source-fence-before.txt"
"$node_bin/node" "$packet/historical-current-causal-probe.mjs" \
  "$sources/historical" "$sources/candidate" "$run_dir/probe-data.json" \
  > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt" &
probe_pid=$!
printf '%s\n' "$probe_pid" > "$run_dir/direct-pid.txt"
wait "$probe_pid"
probe_status=$?
printf '%s\n' "$probe_status" > "$run_dir/exit-code.txt"
"$node_bin/node" "$packet/capture-source-fence.mjs" "$sources/historical" > "$run_dir/historical-source-fence-after.txt"
"$node_bin/node" "$packet/capture-source-fence.mjs" "$sources/candidate" > "$run_dir/candidate-source-fence-after.txt"
if cmp -s "$run_dir/historical-source-fence-before.txt" "$run_dir/historical-source-fence-after.txt" &&
    cmp -s "$run_dir/candidate-source-fence-before.txt" "$run_dir/candidate-source-fence-after.txt"; then
  printf 'source_fence=unchanged\n' > "$run_dir/source-fence-result.txt"
else
  printf 'source_fence=CHANGED\n' > "$run_dir/source-fence-result.txt"
fi
printf 'probe pid=%s exit=%s\n' "$probe_pid" "$probe_status"
exit "$probe_status"
