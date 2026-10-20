#!/bin/sh
set -eu
TASK_ROOT='/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment'
TASK_RUN="$TASK_ROOT/run-20261020T180144Z"
TASK_PYTHON='/opt/homebrew/bin/python3'
TASK_POST="$TASK_ROOT/postprocess.py"
printf '%s\n' "$TASK_PYTHON" "$TASK_POST" > "$TASK_RUN/postprocess-argv.txt"
printf '%s\n' 'PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_RUN/postprocess-environment.txt"
/usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp \
  "$TASK_PYTHON" "$TASK_POST" \
  > "$TASK_RUN/postprocess-stdout.raw.txt" 2> "$TASK_RUN/postprocess-stderr.raw.txt" &
TASK_PID=$!
printf '%s\n' "$TASK_PID" > "$TASK_RUN/postprocess-pid.txt"
if wait "$TASK_PID"; then
  TASK_EXIT=0
else
  TASK_EXIT=$?
fi
printf '%s\n' "$TASK_EXIT" > "$TASK_RUN/postprocess-direct-exit-code.txt"
printf 'postprocess_exit=%s\nrun_dir=%s\n' "$TASK_EXIT" "$TASK_RUN" > "$TASK_RUN/postprocess-exit-summary.txt"
exit "$TASK_EXIT"
