#!/bin/sh
set -u

if [ "$#" -ne 1 ]; then
  echo "usage: $0 troop-runtime|roster-troops-status" >&2
  exit 2
fi

case "$1" in
  troop-runtime)
    selector="troop-runtime"
    npm_script="test:game-troop-runtime"
    test_file="tests/game-troop-runtime.test.js"
    runner_file="tests/game-troop-runtime-runner.js"
    ;;
  roster-troops-status)
    selector="roster-troops-status"
    npm_script="test:game-roster-troops-status"
    test_file="tests/game-roster-troops-status.test.js"
    runner_file="tests/game-roster-troops-status-runner.js"
    ;;
  *)
    echo "unknown suite selector: $1" >&2
    exit 2
    ;;
esac

node_bin="/Users/me/.hermes/node/bin"
npm_bin="$node_bin/npm"
node_bin_exec="$node_bin/node"
project_root="$(git rev-parse --show-toplevel)"
builder_root="$project_root/artifacts/game001gtc-round-1/builder"
cd "$project_root" || exit 2

attempt_root="$(mktemp -d "$builder_root/attempt-$selector.XXXXXX")" || exit 2
mkdir -p "$attempt_root/executed-source"
cp "$test_file" "$attempt_root/executed-source/$(basename "$test_file")"
cp "$runner_file" "$attempt_root/executed-source/$(basename "$runner_file")"
cp package.json package-lock.json "$attempt_root/executed-source/"
cp "$0" "$attempt_root/executed-source/run-one-focused-suite.sh"
shasum -a 256 "$attempt_root"/executed-source/* > "$attempt_root/executed-source.sha256"

record_fence() {
  fence_file="$1"
  {
    printf 'HEAD %s\n' "$(git rev-parse HEAD)"
    printf 'src %s\n' "$(git rev-parse HEAD:src)"
    printf 'scripts %s\n' "$(git rev-parse HEAD:scripts)"
    printf 'package.json %s\n' "$(git rev-parse HEAD:package.json)"
    printf 'package-lock.json %s\n' "$(git rev-parse HEAD:package-lock.json)"
    printf 'public %s\n' "$(git rev-parse HEAD:public)"
    printf 'reference %s\n' "$(git rev-parse HEAD:reference)"
    printf 'worktree production paths:\n'
    git diff --name-only -- src scripts package.json package-lock.json public reference
  } > "$fence_file"
}

record_fence "$attempt_root/source-fences-before.txt"
git diff --name-only -- src scripts package.json package-lock.json public reference > "$attempt_root/production-diff-before.txt"
printf 'selector=%s\npackage_script=npm run %s\nworking_directory=%s\nhead=%s\n' \
  "$selector" "$npm_script" "$project_root" "$(git rev-parse HEAD)" > "$attempt_root/launch-record.txt"
printf 'environment=env -i PATH=%s:/usr/bin:/bin LANG=C LC_ALL=C TZ=UTC CI=1\n' \
  "$node_bin" >> "$attempt_root/launch-record.txt"
printf 'node=' >> "$attempt_root/runtime-versions.txt"
env -i PATH="$node_bin:/usr/bin:/bin" LANG=C LC_ALL=C TZ=UTC CI=1 "$node_bin_exec" --version >> "$attempt_root/runtime-versions.txt" 2>&1
printf 'npm=' >> "$attempt_root/runtime-versions.txt"
env -i PATH="$node_bin:/usr/bin:/bin" LANG=C LC_ALL=C TZ=UTC CI=1 "$npm_bin" --version >> "$attempt_root/runtime-versions.txt" 2>&1

# The background process keeps the shell free to record its exact PID before waiting.
env -i PATH="$node_bin:/usr/bin:/bin" LANG=C LC_ALL=C TZ=UTC CI=1 \
  "$npm_bin" run "$npm_script" > "$attempt_root/stdout.log" 2> "$attempt_root/stderr.log" &
direct_pid="$!"
printf '%s\n' "$direct_pid" > "$attempt_root/direct-pid.txt"
wait "$direct_pid"
exit_code="$?"
printf '%s\n' "$exit_code" > "$attempt_root/exit-code.txt"
record_fence "$attempt_root/source-fences-after.txt"
git diff --name-only -- src scripts package.json package-lock.json public reference > "$attempt_root/production-diff-after.txt"
exit "$exit_code"
