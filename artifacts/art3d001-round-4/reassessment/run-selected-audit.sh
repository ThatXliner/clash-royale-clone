#!/bin/sh
set -eu

TASK_ROOT='/Users/me/.codex/clash-qualification/20261020-copperskiff-r4-reassessment'
TASK_REPO='/Users/me/.codex/worktrees/9456/clash-royale-clone'
TASK_ATTEMPT="$TASK_REPO/design/20261020-redesign/astra-round-4/generated/attempt-20261020T172856Z-81044"
TASK_BLEND="$TASK_ATTEMPT/comparison/tapered_canopy/copperskiff.blend"
TASK_GLB="$TASK_ATTEMPT/comparison/tapered_canopy/copperskiff.glb"
TASK_BLENDER_BIN='/Applications/Blender.app/Contents/MacOS/Blender'
TASK_PYTHON='/opt/homebrew/bin/python3'
TASK_AUDIT="$TASK_ROOT/audit_selected_scene.py"
TASK_POST="$TASK_ROOT/postprocess.py"
TASK_CONTEXT="$TASK_REPO/artifacts/art3d001-round-2/critic/tile-context/arena-ground-tile-64.png"
TASK_SOURCE_DIR="$TASK_ATTEMPT/source"
TASK_MODEL_SOURCE="$TASK_REPO/design/20261020-redesign/astra-round-4/copperskiff_model.py"
TASK_DELIVERY="$TASK_REPO/design/20261020-redesign/astra-round-4/DELIVERY.md"
TASK_MANIFEST="$TASK_ATTEMPT/comparison/manifest.json"
TASK_FROZEN="$TASK_ATTEMPT/frozen-sha256.txt"

if [ "$#" -ne 1 ]; then
  printf '%s\n' 'Pass a unique run stamp such as 20261020T181500Z.' >&2
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

TASK_HASH_INPUTS="$TASK_AUDIT $TASK_POST $0 $TASK_BLENDER_BIN $TASK_PYTHON $TASK_BLEND $TASK_GLB $TASK_MODEL_SOURCE $TASK_DELIVERY $TASK_MANIFEST $TASK_FROZEN $TASK_CONTEXT $TASK_SOURCE_DIR/copperskiff_model.py $TASK_SOURCE_DIR/build_comparison.py $TASK_SOURCE_DIR/round1_models.py $TASK_SOURCE_DIR/round2_pipeline.py $TASK_SOURCE_DIR/native_preview.py $TASK_SOURCE_DIR/verify_saved_asset.py $TASK_SOURCE_DIR/alternatives.json $TASK_SOURCE_DIR/comparison-plan.json $TASK_SOURCE_DIR/palette.json $TASK_SOURCE_DIR/run-comparison.sh $TASK_SOURCE_DIR/design-notes.md"
/usr/bin/shasum -a 256 $TASK_HASH_INPUTS > "$TASK_RUN/inputs-sha256-prelaunch.txt"
/usr/bin/stat -f '%N %z bytes %Sm' -t '%Y-%m-%dT%H:%M:%S%z' \
  $TASK_HASH_INPUTS > "$TASK_RUN/prelaunch-file-stat.txt"
printf '%s\n' 'PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_RUN/environment-allowlist.txt"
printf '%s\n' "$TASK_BLENDER_BIN" > "$TASK_RUN/blender-executable-path.txt"
/usr/bin/shasum -a 256 "$TASK_BLENDER_BIN" > "$TASK_RUN/blender-executable-prelaunch.sha256"
if ! (cd "$TASK_ATTEMPT" && /usr/bin/shasum -a 256 -c "$TASK_FROZEN") > "$TASK_RUN/frozen-delivery-check-prelaunch.txt" 2>&1; then
  printf '%s\n' 'Frozen R4 delivery check failed; Blender was not started.' >&2
  printf '%s\n' 'overall_exit=1' "run_dir=$TASK_RUN" > "$TASK_RUN/runner-exit-summary.txt"
  exit 65
fi

printf '%s\n' \
  "$TASK_BLENDER_BIN" \
  '--background' '--factory-startup' '--threads' '4' '--disable-autoexec' \
  '--python-exit-code' '1' '--python' "$TASK_AUDIT" '--' \
  '--blend' "$TASK_BLEND" '--out' "$TASK_RUN" \
  > "$TASK_RUN/blender-argv.txt"
printf '%s\n' 'PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_RUN/blender-environment.txt"
/usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp \
  "$TASK_BLENDER_BIN" --background --factory-startup --threads 4 --disable-autoexec \
  --python-exit-code 1 --python "$TASK_AUDIT" -- \
  --blend "$TASK_BLEND" --out "$TASK_RUN" \
  > "$TASK_RUN/blender-stdout.raw.txt" 2> "$TASK_RUN/blender-stderr.raw.txt" &
TASK_BLENDER_PID=$!
printf '%s\n' "$TASK_BLENDER_PID" > "$TASK_RUN/blender-pid.txt"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_RUN/blender-start-utc.txt"
if wait "$TASK_BLENDER_PID"; then
  TASK_BLENDER_EXIT=0
else
  TASK_BLENDER_EXIT=$?
fi
printf '%s\n' "$TASK_BLENDER_EXIT" > "$TASK_RUN/blender-direct-exit-code.txt"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_RUN/blender-end-utc.txt"

TASK_OVERALL=0
if [ "$TASK_BLENDER_EXIT" -ne 0 ]; then
  TASK_OVERALL=1
else
  printf '%s\n' "$TASK_PYTHON $TASK_POST" > "$TASK_RUN/postprocess-argv.txt"
  printf '%s\n' 'PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp' > "$TASK_RUN/postprocess-environment.txt"
  /usr/bin/env -i PATH=/usr/bin:/bin:/usr/sbin:/sbin HOME=/Users/me LANG=C.UTF-8 LC_ALL=C.UTF-8 TZ=UTC TMPDIR=/tmp \
    "$TASK_PYTHON" "$TASK_POST" \
    > "$TASK_RUN/postprocess-stdout.raw.txt" 2> "$TASK_RUN/postprocess-stderr.raw.txt" &
  TASK_POST_PID=$!
  printf '%s\n' "$TASK_POST_PID" > "$TASK_RUN/postprocess-pid.txt"
  if wait "$TASK_POST_PID"; then
    TASK_POST_EXIT=0
  else
    TASK_POST_EXIT=$?
    TASK_OVERALL=1
  fi
  printf '%s\n' "$TASK_POST_EXIT" > "$TASK_RUN/postprocess-direct-exit-code.txt"
fi

if ! (cd "$TASK_ATTEMPT" && /usr/bin/shasum -a 256 -c "$TASK_FROZEN") > "$TASK_RUN/frozen-delivery-check-postrun.txt" 2>&1; then
  TASK_OVERALL=1
fi
/usr/bin/shasum -a 256 $TASK_HASH_INPUTS > "$TASK_RUN/inputs-sha256-postrun.txt"
/usr/bin/shasum -a 256 "$TASK_BLENDER_BIN" > "$TASK_RUN/blender-executable-postrun.sha256"
printf '%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" > "$TASK_RUN/finished-at-utc.txt"
printf 'overall_exit=%s\nrun_dir=%s\nblender_exit=%s\n' \
  "$TASK_OVERALL" "$TASK_RUN" "$TASK_BLENDER_EXIT" > "$TASK_RUN/runner-exit-summary.txt"
exit "$TASK_OVERALL"
