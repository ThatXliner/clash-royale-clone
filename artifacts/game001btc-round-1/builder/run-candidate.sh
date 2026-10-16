#!/bin/sh
set -u
root=/tmp/clash-royale-game001btc-builder-20261015
out="$root/artifacts/game001btc-round-1/builder/candidate"
node_bin=/Users/me/.hermes/node/bin
home_dir=/tmp/clash-royale-game001btc-home
mkdir -p "$out" "$home_dir"
printf '%s\n' '/Users/me/.hermes/node/bin/npm run test:game-battle' > "$out/argv.txt"
printf '%s\n' "$root" > "$out/cwd.txt"
printf '%s\n' 'PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin' 'HOME=/tmp/clash-royale-game001btc-home' 'all other inherited variables unset (env -i)' > "$out/env.txt"
/usr/bin/env -i PATH="$node_bin:/usr/bin:/bin" HOME="$home_dir" "$node_bin/npm" run test:game-battle > "$out/stdout.txt" 2> "$out/stderr.txt" &
test_pid=$!
printf '%s\n' "$test_pid" > "$out/direct-pid.txt"
ps -o pid=,ppid=,command= -p "$test_pid" > "$out/process-snapshot.txt" || true
children=$(pgrep -P "$test_pid" 2>/dev/null || true)
if [ -n "$children" ]; then
  for child in $children; do ps -o pid=,ppid=,command= -p "$child" >> "$out/process-snapshot.txt" || true; done
fi
wait "$test_pid"
status=$?
printf '%s\n' "$status" > "$out/exit.txt"
exit "$status"
