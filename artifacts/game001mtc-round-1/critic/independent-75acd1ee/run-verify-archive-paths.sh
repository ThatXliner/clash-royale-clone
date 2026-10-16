#!/bin/sh
set -u
packet=/private/tmp/game001mtc-critic.0m4ONi/evidence
run_dir="$packet/archive-path-verification"
mkdir -p "$run_dir"
cd "$packet"
{
  printf 'cwd=%s\n' "$PWD"
  printf 'argv=/usr/bin/python3 $packet/verify-archive-paths.py\n'
  printf 'python='; /usr/bin/python3 --version
  printf 'env:\n'; env | sort
} > "$run_dir/launch-record.txt"
/usr/bin/python3 "$packet/verify-archive-paths.py" > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt" &
verify_pid=$!
printf '%s\n' "$verify_pid" > "$run_dir/direct-pid.txt"
wait "$verify_pid"
verify_status=$?
printf '%s\n' "$verify_status" > "$run_dir/exit-code.txt"
printf 'archive path verify pid=%s exit=%s\n' "$verify_pid" "$verify_status"
exit "$verify_status"
