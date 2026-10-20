#!/bin/sh
set -eu
TASK_ROOT='/Users/me/.codex/clash-qualification/20261020-model-r3-critic'
TASK_RUN="$TASK_ROOT/run-20261020T170642Z"
TASK_FIX="$TASK_RUN/capture-fix"
TASK_CONTEXT='/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/art3d001-round-2/critic/tile-context/arena-ground-tile-64.png'
TASK_POST="$TASK_ROOT/postprocess-capture-fix.py"
TASK_PYTHON='/opt/homebrew/bin/python3'
mkdir -p "$TASK_FIX"
printf '%s\n' 'Capture-only correction: read existing raw PNGs from <run>/<variant>/raw-256/<variant>/ after the original processor incorrectly looked in <run>/raw-256/<variant>/. No Blender rerun.' > "$TASK_FIX/correction.txt"
printf '%s\n' "/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp $TASK_PYTHON $TASK_POST $TASK_RUN $TASK_CONTEXT" > "$TASK_FIX/argv.txt"
printf '%s\n' 'PATH=/opt/homebrew/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_FIX/environment.txt"
find "$TASK_RUN/r2_control/raw-256" "$TASK_RUN/umbrella_barge/raw-256" "$TASK_RUN/exposed_deck/raw-256" "$TASK_RUN/split_canvas/raw-256" -type f -name '*.png' -print | sort > "$TASK_FIX/raw-inputs.list"
find "$TASK_RUN/r2_control" "$TASK_RUN/umbrella_barge" "$TASK_RUN/exposed_deck" "$TASK_RUN/split_canvas" -maxdepth 2 -type f -name '*-blender-audit.json' -print | sort > "$TASK_FIX/audit-inputs.list"
cat "$TASK_FIX/raw-inputs.list" "$TASK_FIX/audit-inputs.list" > "$TASK_FIX/data-inputs.list"
/usr/bin/shasum -a 256 "$TASK_POST" "$TASK_ROOT/postprocess.py" "$TASK_ROOT/run.sh" "$TASK_ROOT/run-capture-fix.sh" "$TASK_PYTHON" "$TASK_CONTEXT" > "$TASK_FIX/processor-inputs-prelaunch.sha256"
xargs /usr/bin/shasum -a 256 < "$TASK_FIX/data-inputs.list" > "$TASK_FIX/data-inputs-prelaunch.sha256"
/usr/bin/shasum -a 256 "$TASK_PYTHON" > "$TASK_FIX/python-executable-prelaunch.sha256"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_FIX/start-utc.txt"
/usr/bin/env -i PATH=/opt/homebrew/bin:/usr/bin:/bin LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp \
  "$TASK_PYTHON" "$TASK_POST" "$TASK_RUN" "$TASK_CONTEXT" > "$TASK_FIX/stdout.raw.txt" 2> "$TASK_FIX/stderr.raw.txt" &
TASK_PID=$!
printf '%s\n' "$TASK_PID" > "$TASK_FIX/pid.txt"
if wait "$TASK_PID"; then TASK_EXIT=0; else TASK_EXIT=$?; fi
printf '%s\n' "$TASK_EXIT" > "$TASK_FIX/exit-code.txt"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_FIX/end-utc.txt"
xargs /usr/bin/shasum -a 256 < "$TASK_FIX/data-inputs.list" > "$TASK_FIX/data-inputs-postrun.sha256"
/usr/bin/shasum -a 256 "$TASK_POST" "$TASK_ROOT/postprocess.py" "$TASK_ROOT/run.sh" "$TASK_ROOT/run-capture-fix.sh" "$TASK_PYTHON" "$TASK_CONTEXT" > "$TASK_FIX/processor-inputs-postrun.sha256"
/usr/bin/shasum -a 256 "$TASK_PYTHON" > "$TASK_FIX/python-executable-postrun.sha256"
find "$TASK_RUN/native-64" "$TASK_RUN/tile-context" -type f -print > "$TASK_FIX/output-files.list"
find "$TASK_RUN" -maxdepth 1 -type f \( -name 'candidate-choice-*' -o -name 'selected-*' -o -name 'native-bounds-and-context.json' \) -print >> "$TASK_FIX/output-files.list"
sort -o "$TASK_FIX/output-files.list" "$TASK_FIX/output-files.list"
xargs /usr/bin/shasum -a 256 < "$TASK_FIX/output-files.list" > "$TASK_FIX/output-files.sha256"
if cmp -s "$TASK_FIX/data-inputs-prelaunch.sha256" "$TASK_FIX/data-inputs-postrun.sha256"; then
  printf '%s\n' 'unchanged' > "$TASK_FIX/data-inputs-fence-result.txt"
else
  printf '%s\n' 'changed' > "$TASK_FIX/data-inputs-fence-result.txt"
fi
if cmp -s "$TASK_FIX/processor-inputs-prelaunch.sha256" "$TASK_FIX/processor-inputs-postrun.sha256"; then
  printf '%s\n' 'unchanged' > "$TASK_FIX/processor-fence-result.txt"
else
  printf '%s\n' 'changed' > "$TASK_FIX/processor-fence-result.txt"
fi
exit "$TASK_EXIT"
