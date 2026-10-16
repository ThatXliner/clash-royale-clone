#!/bin/sh
set -u
root=/tmp/clash-royale-game001otc-builder-20261015
out="$root/artifacts/game001otc-round-1/builder/probe"
node_bin=/Users/me/.hermes/node/bin
home_dir=/tmp/clash-royale-game001otc-home
mkdir -p "$home_dir"
printf '%s\n' '/Users/me/.hermes/node/bin/node artifacts/game001otc-round-1/builder/probe/probe-opponent.mjs' > "$out/argv.txt"
printf '%s\n' "$root" > "$out/cwd.txt"
printf '%s\n' 'PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin' 'HOME=/tmp/clash-royale-game001otc-home' 'all other inherited variables unset (env -i)' > "$out/env.txt"
/usr/bin/env -i PATH="$node_bin:/usr/bin:/bin" HOME="$home_dir" "$node_bin/node" "$root/artifacts/game001otc-round-1/builder/probe/probe-opponent.mjs" > "$out/stdout.json" 2> "$out/stderr.txt" &
probe_pid=$!
printf '%s\n' "$probe_pid" > "$out/direct-pid.txt"
ps -o pid=,ppid=,command= -p "$probe_pid" > "$out/process-snapshot.txt" || true
wait "$probe_pid"
status=$?
printf '%s\n' "$status" > "$out/exit.txt"
exit "$status"
