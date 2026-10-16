#!/bin/sh
set -u
packet=/private/tmp/game001mtc-critic.0m4ONi/evidence
run_dir="$packet/attempt-causal-probe-summary"
mkdir -p "$run_dir"
cd "$packet"
{
  printf 'cwd=%s\n' "$PWD"
  printf 'argv=/usr/bin/python3 $packet/summarize-causal-probe.py\n'
  printf 'python='; /usr/bin/python3 --version
  printf 'env:\n'; env | sort
} > "$run_dir/launch-record.txt"
/usr/bin/python3 "$packet/summarize-causal-probe.py" > "$run_dir/stdout.txt" 2> "$run_dir/stderr.txt" &
summary_pid=$!
printf '%s\n' "$summary_pid" > "$run_dir/direct-pid.txt"
wait "$summary_pid"
summary_status=$?
printf '%s\n' "$summary_status" > "$run_dir/exit-code.txt"
printf 'summary pid=%s exit=%s\n' "$summary_pid" "$summary_status"
exit "$summary_status"
