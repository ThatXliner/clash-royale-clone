#!/bin/sh
RUN_DIR='/Users/me/.codex/clash-qualification/20261020-model-r2-critic/run-20261020T155005Z'
TASK_BLENDER_BIN='/Applications/Blender.app/Contents/MacOS/Blender'
TASK_BLEND='/Users/me/.codex/worktrees/9456/clash-royale-clone/design/20261020-redesign/astra-round-2/generated/attempt-20261020T151650Z-28770/models/copperskiff.blend'
TASK_SCRIPT="$RUN_DIR/copper_audit_render.py"
TASK_OUT="$RUN_DIR"
TASK_ENV='PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp'
printf '%s\n' "$TASK_ENV" > "$RUN_DIR/environment.txt"
printf '%s\n' "/usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp $TASK_BLENDER_BIN --background --factory-startup --threads 4 --disable-autoexec --python-exit-code 1 --python $TASK_SCRIPT -- --blend $TASK_BLEND --out $TASK_OUT --idle-frame 1 --contact-frame 100 --resolution 256" > "$RUN_DIR/argv.txt"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$RUN_DIR/started-at-utc.txt"
/usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp "$TASK_BLENDER_BIN" --background --factory-startup --threads 4 --disable-autoexec --python-exit-code 1 --python "$TASK_SCRIPT" -- --blend "$TASK_BLEND" --out "$TASK_OUT" --idle-frame 1 --contact-frame 100 --resolution 256 > "$RUN_DIR/blender-stdout.txt" 2> "$RUN_DIR/blender-stderr.txt" &
TASK_BLENDER_PID=$!
printf '%s\n' "$TASK_BLENDER_PID" > "$RUN_DIR/blender-pid.txt"
wait "$TASK_BLENDER_PID"
TASK_BLENDER_EXIT=$?
printf '%s\n' "$TASK_BLENDER_EXIT" > "$RUN_DIR/direct-exit-code.txt"
date -u '+%Y-%m-%dT%H:%M:%SZ' > "$RUN_DIR/finished-at-utc.txt"
exit "$TASK_BLENDER_EXIT"
