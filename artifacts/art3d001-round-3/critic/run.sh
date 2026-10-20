#!/bin/sh
set -eu

TASK_ROOT='/Users/me/.codex/clash-qualification/20261020-model-r3-critic'
TASK_BLENDER_BIN='/Applications/Blender.app/Contents/MacOS/Blender'
TASK_REPO='/Users/me/.codex/worktrees/9456/clash-royale-clone'
TASK_AUDIT="$TASK_ROOT/audit_saved_model.py"
TASK_POST="$TASK_ROOT/postprocess.py"
TASK_PYTHON='/opt/homebrew/bin/python3'
TASK_CONTEXT="$TASK_REPO/artifacts/art3d001-round-2/critic/tile-context/arena-ground-tile-64.png"

if [ "$#" -ne 1 ]; then
  printf '%s\n' 'Pass one unique UTC run stamp, for example 20261020T171200Z.' >&2
  exit 64
fi
TASK_STAMP="$1"
case "$TASK_STAMP" in
  2026????T??????Z) ;;
  *) printf '%s\n' 'Run stamp must match 2026YYYYMMDDThhmmssZ shape.' >&2; exit 64 ;;
esac
TASK_RUN="$TASK_ROOT/run-$TASK_STAMP"
if [ -e "$TASK_RUN" ]; then
  printf '%s\n' "Run directory already exists: $TASK_RUN" >&2
  exit 73
fi
mkdir -p "$TASK_RUN"
printf '%s\n' "$TASK_RUN" > "$TASK_ROOT/active-run.txt"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_RUN/started-at-utc.txt"
printf '%s\n' "$$" > "$TASK_RUN/wrapper-pid.txt"

TASK_R2="$TASK_REPO/design/20261020-redesign/astra-round-2/generated/attempt-20261020T151650Z-28770/models/copperskiff.blend"
TASK_UMBRELLA="$TASK_REPO/design/20261020-redesign/astra-round-3-repair/generated/attempt-20261020T165935Z-71930/comparison/umbrella_barge/copperskiff.blend"
TASK_EXPOSED="$TASK_REPO/design/20261020-redesign/astra-round-3-repair/generated/attempt-20261020T165935Z-71930/comparison/exposed_deck/copperskiff.blend"
TASK_SPLIT="$TASK_REPO/design/20261020-redesign/astra-round-3-repair/generated/attempt-20261020T165935Z-71930/comparison/split_canvas/copperskiff.blend"
TASK_ARENA="$TASK_REPO/public/assets/moss-ember-arena-painted.webp"

/usr/bin/shasum -a 256 \
  "$TASK_AUDIT" "$TASK_POST" "$0" \
  "$TASK_R2" "$TASK_UMBRELLA" "$TASK_EXPOSED" "$TASK_SPLIT" \
  "$TASK_CONTEXT" "$TASK_ARENA" "$TASK_PYTHON" > "$TASK_RUN/runner-source-inputs-prelaunch.sha256"
/usr/bin/stat -f '%N %z bytes %Sm' -t '%Y-%m-%dT%H:%M:%S%z' \
  "$TASK_AUDIT" "$TASK_POST" "$0" \
  "$TASK_R2" "$TASK_UMBRELLA" "$TASK_EXPOSED" "$TASK_SPLIT" \
  "$TASK_CONTEXT" "$TASK_ARENA" "$TASK_PYTHON" > "$TASK_RUN/prelaunch-file-stat.txt"
printf '%s\n' 'PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_RUN/environment-allowlist.txt"
printf '%s\n' "$TASK_BLENDER_BIN" > "$TASK_RUN/blender-executable-path.txt"
/usr/bin/shasum -a 256 "$TASK_BLENDER_BIN" > "$TASK_RUN/blender-executable-prelaunch.sha256"

TASK_OVERALL=0
run_one() {
  TASK_VARIANT="$1"
  TASK_BLEND="$2"
  TASK_OUTPUT="$TASK_RUN/$TASK_VARIANT"
  mkdir -p "$TASK_OUTPUT"
  TASK_SCRIPT="$TASK_AUDIT"
  TASK_ARGS="$TASK_BLENDER_BIN --background --factory-startup --threads 4 --disable-autoexec --python-exit-code 1 --python $TASK_SCRIPT -- --blend $TASK_BLEND --variant $TASK_VARIANT --out $TASK_OUTPUT --native-size 64 --supersample 4"
  printf '%s\n' "$TASK_ARGS" > "$TASK_OUTPUT/argv.txt"
  printf '%s\n' 'PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_OUTPUT/environment.txt"
  /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp \
    "$TASK_BLENDER_BIN" --background --factory-startup --threads 4 --disable-autoexec \
    --python-exit-code 1 --python "$TASK_SCRIPT" -- \
    --blend "$TASK_BLEND" --variant "$TASK_VARIANT" --out "$TASK_OUTPUT" \
    --native-size 64 --supersample 4 > "$TASK_OUTPUT/blender-stdout.raw.txt" 2> "$TASK_OUTPUT/blender-stderr.raw.txt" &
  TASK_PID=$!
  printf '%s\n' "$TASK_PID" > "$TASK_OUTPUT/blender-pid.txt"
  printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_OUTPUT/start-utc.txt"
  if wait "$TASK_PID"; then
    TASK_EXIT=0
  else
    TASK_EXIT=$?
    TASK_OVERALL=1
  fi
  printf '%s\n' "$TASK_EXIT" > "$TASK_OUTPUT/direct-exit-code.txt"
  printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_OUTPUT/end-utc.txt"
}

run_one r2_control "$TASK_R2"
run_one umbrella_barge "$TASK_UMBRELLA"
run_one exposed_deck "$TASK_EXPOSED"
run_one split_canvas "$TASK_SPLIT"

printf '%s\n' "$TASK_PYTHON $TASK_POST $TASK_RUN $TASK_CONTEXT" > "$TASK_RUN/postprocess-argv.txt"
"$TASK_PYTHON" "$TASK_POST" "$TASK_RUN" "$TASK_CONTEXT" > "$TASK_RUN/postprocess-stdout.raw.txt" 2> "$TASK_RUN/postprocess-stderr.raw.txt" &
TASK_POST_PID=$!
printf '%s\n' "$TASK_POST_PID" > "$TASK_RUN/postprocess-pid.txt"
if wait "$TASK_POST_PID"; then
  TASK_POST_EXIT=0
else
  TASK_POST_EXIT=$?
  TASK_OVERALL=1
fi
printf '%s\n' "$TASK_POST_EXIT" > "$TASK_RUN/postprocess-exit-code.txt"

/usr/bin/shasum -a 256 \
  "$TASK_AUDIT" "$TASK_POST" "$0" \
  "$TASK_R2" "$TASK_UMBRELLA" "$TASK_EXPOSED" "$TASK_SPLIT" \
  "$TASK_CONTEXT" "$TASK_ARENA" "$TASK_PYTHON" > "$TASK_RUN/runner-source-inputs-postrun.sha256"
/usr/bin/shasum -a 256 "$TASK_BLENDER_BIN" > "$TASK_RUN/blender-executable-postrun.sha256"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_RUN/finished-at-utc.txt"
printf 'overall_exit=%s\nrun_dir=%s\n' "$TASK_OVERALL" "$TASK_RUN" > "$TASK_RUN/runner-exit-summary.txt"
exit "$TASK_OVERALL"
