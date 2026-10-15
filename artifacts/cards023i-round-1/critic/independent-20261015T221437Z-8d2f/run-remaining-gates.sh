#!/bin/bash
set +e
evidence_dir=$1
workspace_root=$2
mkdir -p "$evidence_dir"
cd "$workspace_root" || exit 97
gates=(
  test:game-ui-projection
  test:nondeterminism-guard
  test:visual-asset-manifest
  test:shipping-isolation-guard
  test:release-build
  test:shipping-isolation-release
  test:shipping-isolation-host
)
for gate_name in "${gates[@]}"; do
  command_path="$evidence_dir/$gate_name.command.txt"
  stdout_path="$evidence_dir/$gate_name.stdout.raw"
  stderr_path="$evidence_dir/$gate_name.stderr.raw"
  pid_path="$evidence_dir/$gate_name.pid.txt"
  exit_path="$evidence_dir/$gate_name.exit.txt"
  printf '%s\n' "env -i HOME=/Users/me PATH=/Users/me/.hermes/node/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/tmp LANG=C.UTF-8 GAME_BROWSER_PLAYWRIGHT=$workspace_root/node_modules/playwright/index.mjs GAME_BROWSER_CHROME=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome CARDS023I_ARTIFACTS=$evidence_dir APP_SHELL_ARTIFACTS=$evidence_dir /Users/me/.hermes/node/bin/npm run $gate_name" > "$command_path"
  env -i HOME=/Users/me PATH=/Users/me/.hermes/node/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR=/tmp LANG=C.UTF-8 GAME_BROWSER_PLAYWRIGHT="$workspace_root/node_modules/playwright/index.mjs" GAME_BROWSER_CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" CARDS023I_ARTIFACTS="$evidence_dir" APP_SHELL_ARTIFACTS="$evidence_dir" /Users/me/.hermes/node/bin/npm run "$gate_name" > "$stdout_path" 2> "$stderr_path" &
  gate_pid=$!
  printf '%s\n' "$gate_pid" > "$pid_path"
  printf 'START %s PID %s\n' "$gate_name" "$gate_pid"
  wait "$gate_pid"
  gate_exit_code=$?
  printf '%s\n' "$gate_exit_code" > "$exit_path"
  printf 'EXIT %s %s\n' "$gate_name" "$gate_exit_code"
  if [ "$gate_exit_code" -ne 0 ]; then
    printf '%s\n' "$gate_name" > "$evidence_dir/stopped-at.txt"
    exit "$gate_exit_code"
  fi
done
printf '%s\n' complete > "$evidence_dir/remaining-gates-complete.txt"
exit 0
