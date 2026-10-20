#!/bin/bash

set -u

astra_source_dir="$(cd "$(dirname "$0")" && pwd)"
astra_blender_bin="${ASTRA_BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
astra_attempt="${astra_source_dir}/generated/attempt-$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "${astra_attempt}/source"
cp "${astra_source_dir}/build_models.py" "${astra_source_dir}/palette.json" \
  "${astra_source_dir}/run-model-build.sh" "${astra_source_dir}/design-notes.md" "${astra_attempt}/source/"
shasum -a 256 "${astra_source_dir}/build_models.py" "${astra_source_dir}/palette.json" \
  "${astra_source_dir}/run-model-build.sh" > "${astra_attempt}/source-sha256-before.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "${astra_attempt}/started-at-utc.txt"
printf '%s\n' "$$" > "${astra_attempt}/runner-pid.txt"
{
  uname -a
  printf 'PATH=%s\nLANG=%s\nLC_ALL=%s\nTZ=%s\n' "${PATH:-}" "${LANG:-}" "${LC_ALL:-}" "${TZ:-}"
  printf 'ASTRA_BLENDER_BIN=%s\n' "${astra_blender_bin}"
  printf 'Environment receipt is limited to non-secret rendering/runtime settings.\n'
} > "${astra_attempt}/environment.txt"
printf '%s\n' "${astra_attempt}"

/usr/bin/python3 --version > "${astra_attempt}/syntax-python-version.txt" 2>&1
/usr/bin/python3 -m py_compile "${astra_source_dir}/build_models.py" \
  > "${astra_attempt}/syntax-stdout.txt" 2> "${astra_attempt}/syntax-stderr.txt"
astra_syntax_exit=$?
printf '%s\n' "${astra_syntax_exit}" > "${astra_attempt}/syntax-exit-code.txt"
if [ "${astra_syntax_exit}" -ne 0 ]; then
  printf '%s\n' "${astra_syntax_exit}" > "${astra_attempt}/exit-code.txt"
  exit "${astra_syntax_exit}"
fi

"${astra_blender_bin}" --version > "${astra_attempt}/blender-version.txt" 2>&1
astra_command=(
  "${astra_blender_bin}" --background --factory-startup --threads 4 --python-exit-code 1
  --python "${astra_source_dir}/build_models.py" --
  --output "${astra_attempt}/models" --team river --engine eevee
  --previews --preview-set quick --preview-size 256 --samples 8
)
printf '%q ' "${astra_command[@]}" > "${astra_attempt}/command.txt"
printf '\n' >> "${astra_attempt}/command.txt"
"${astra_command[@]}" > "${astra_attempt}/stdout.txt" 2> "${astra_attempt}/stderr.txt" &
astra_blender_pid=$!
printf '%s\n' "${astra_blender_pid}" > "${astra_attempt}/blender-pid.txt"
printf 'Blender PID: %s\n' "${astra_blender_pid}"
wait "${astra_blender_pid}"
astra_exit=$?
printf '%s\n' "${astra_exit}" > "${astra_attempt}/exit-code.txt"
date -u +%Y-%m-%dT%H:%M:%SZ > "${astra_attempt}/finished-at-utc.txt"
shasum -a 256 "${astra_source_dir}/build_models.py" "${astra_source_dir}/palette.json" \
  "${astra_source_dir}/run-model-build.sh" > "${astra_attempt}/source-sha256-after.txt"
if cmp -s "${astra_attempt}/source-sha256-before.txt" "${astra_attempt}/source-sha256-after.txt"; then
  printf 'unchanged\n' > "${astra_attempt}/source-stability.txt"
else
  printf 'changed during run; this attempt must not be treated as a frozen source\n' > "${astra_attempt}/source-stability.txt"
  if [ "${astra_exit}" -eq 0 ]; then
    astra_exit=2
  fi
fi
printf 'Exit: %s\n' "${astra_exit}"
exit "${astra_exit}"
