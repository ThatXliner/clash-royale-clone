#!/bin/bash

set -u

astra_source_dir="$(cd "$(dirname "$0")" && pwd)"
astra_blender_bin="${ASTRA_BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
astra_attempt="${astra_source_dir}/generated/attempt-$(date -u +%Y%m%dT%H%M%SZ)-$$"
astra_files=(build_comparison.py copperskiff_model.py alternatives.json round1_models.py
  round2_pipeline.py native_preview.py verify_saved_asset.py palette.json run-comparison.sh design-notes.md)
mkdir -p "${astra_attempt}/source"
for astra_file in "${astra_files[@]}"; do
  cp "${astra_source_dir}/${astra_file}" "${astra_attempt}/source/${astra_file}"
done
(
  cd "${astra_source_dir}" || exit 1
  shasum -a 256 "${astra_files[@]}"
) > "${astra_attempt}/source-sha256-before.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "${astra_attempt}/started-at-utc.txt"
printf '%s\n' "$$" > "${astra_attempt}/runner-pid.txt"
{
  uname -a
  printf 'PATH=%s\nLANG=%s\nLC_ALL=%s\nTZ=%s\n' "${PATH:-}" "${LANG:-}" "${LC_ALL:-}" "${TZ:-}"
  printf 'ASTRA_BLENDER_BIN=%s\n' "${astra_blender_bin}"
} > "${astra_attempt}/environment.txt"
printf '%s\n' "${astra_attempt}"
/usr/bin/python3 --version > "${astra_attempt}/syntax-python-version.txt" 2>&1
/usr/bin/python3 -m py_compile "${astra_source_dir}/build_comparison.py" "${astra_source_dir}/copperskiff_model.py" \
  "${astra_source_dir}/round1_models.py" "${astra_source_dir}/round2_pipeline.py" \
  "${astra_source_dir}/native_preview.py" "${astra_source_dir}/verify_saved_asset.py" \
  > "${astra_attempt}/syntax-stdout.txt" 2> "${astra_attempt}/syntax-stderr.txt"
astra_exit=$?
printf '%s\n' "${astra_exit}" > "${astra_attempt}/syntax-exit-code.txt"
if [ "${astra_exit}" -ne 0 ]; then
  printf '%s\n' "${astra_exit}" > "${astra_attempt}/exit-code.txt"
  exit "${astra_exit}"
fi
"${astra_blender_bin}" --version > "${astra_attempt}/blender-version.txt" 2>&1
astra_command=(
  "${astra_blender_bin}" --background --factory-startup --disable-autoexec --threads 4 --python-exit-code 1
  --python "${astra_source_dir}/build_comparison.py" --
  --output "${astra_attempt}/comparison" --selected exposed_deck
)
printf '%q ' "${astra_command[@]}" > "${astra_attempt}/command.txt"
printf '\n' >> "${astra_attempt}/command.txt"
"${astra_command[@]}" > "${astra_attempt}/stdout.txt" 2> "${astra_attempt}/stderr.txt" &
astra_blender_pid=$!
printf '%s\n' "${astra_blender_pid}" > "${astra_attempt}/blender-pid.txt"
printf 'Blender PID: %s\n' "${astra_blender_pid}"
wait "${astra_blender_pid}"
astra_exit=$?
printf '%s\n' "${astra_exit}" > "${astra_attempt}/generation-exit-code.txt"
if [ "${astra_exit}" -eq 0 ]; then
  astra_inspection=(
    "${astra_blender_bin}" --background --factory-startup --disable-autoexec --threads 2 --python-exit-code 1
    --python "${astra_source_dir}/verify_saved_asset.py" --
    --blend "${astra_attempt}/comparison/exposed_deck/copperskiff.blend"
    --output "${astra_attempt}/comparison/exposed_deck/saved-asset-inspection.json"
  )
  printf '%q ' "${astra_inspection[@]}" > "${astra_attempt}/inspection-command.txt"
  printf '\n' >> "${astra_attempt}/inspection-command.txt"
  "${astra_inspection[@]}" > "${astra_attempt}/inspection-stdout.txt" 2> "${astra_attempt}/inspection-stderr.txt" &
  astra_inspection_pid=$!
  printf '%s\n' "${astra_inspection_pid}" > "${astra_attempt}/inspection-pid.txt"
  printf 'Inspection PID: %s\n' "${astra_inspection_pid}"
  wait "${astra_inspection_pid}"
  astra_exit=$?
  printf '%s\n' "${astra_exit}" > "${astra_attempt}/inspection-exit-code.txt"
fi
(
  cd "${astra_source_dir}" || exit 1
  shasum -a 256 "${astra_files[@]}"
) > "${astra_attempt}/source-sha256-after.txt"
if cmp -s "${astra_attempt}/source-sha256-before.txt" "${astra_attempt}/source-sha256-after.txt"; then
  printf 'unchanged\n' > "${astra_attempt}/source-stability.txt"
else
  printf 'changed; do not freeze\n' > "${astra_attempt}/source-stability.txt"
  astra_exit=2
fi
printf '%s\n' "${astra_exit}" > "${astra_attempt}/exit-code.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "${astra_attempt}/finished-at-utc.txt"
printf 'Exit: %s\n' "${astra_exit}"
exit "${astra_exit}"
