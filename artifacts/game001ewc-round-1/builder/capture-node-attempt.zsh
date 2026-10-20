#!/bin/zsh

setopt pipefail

repo_root="/Users/me/.codex/clash-qualification/20261020-node-workload/builder"
evidence_root="/Users/me/.codex/clash-qualification/20261020-node-workload/attempts"
node_bin="/Users/me/.hermes/node/bin/node"
attempt_id="$1"
mode="$2"
attempt_dir="$evidence_root/$attempt_id"

if [[ -e "$attempt_dir" ]]; then
  print -r -- "refusing to reuse attempt directory: $attempt_dir" >&2
  exit 65
fi

case "$mode" in
  setup-byte-probe)
    argv=("$node_bin" "$repo_root/artifacts/game001ewc-round-1/builder/setup-byte-probe.mjs")
    ;;
  north-paid-probe)
    argv=("$node_bin" "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.mjs")
    ;;
  focused-suite)
    argv=("$node_bin" --test
      "--test-name-pattern=^game session endurance: shared policy preserves the active seed-zero match across chunks and restore cuts$"
      tests/game-session-endurance.test.js)
    ;;
  *)
    print -r -- "unknown attempt mode: $mode" >&2
    exit 64
    ;;
esac

mkdir -p "$attempt_dir/home" "$attempt_dir/tmp"

cd "$repo_root" || exit 66
pwd > "$attempt_dir/cwd.txt"
git rev-parse HEAD > "$attempt_dir/pre-head.txt"
git status --porcelain=v1 --untracked-files=all > "$attempt_dir/pre-git-status.txt"
git diff --binary > "$attempt_dir/pre-git-diff.patch"
git ls-files -z -- src tests package.json package-lock.json |
  xargs -0 shasum -a 256 > "$attempt_dir/pre-tracked-source.sha256"
shasum -a 256 \
  "$repo_root/tests/game-session-endurance.test.js" \
  "$repo_root/tests/helpers/endurance-workload.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/accepted-control.test.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/accepted-control.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/setup-byte-probe.mjs" \
  "$repo_root/artifacts/game001ewc-round-1/builder/first-focused-run.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/first-focused-run.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.executed-test.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.sources.sha256" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/candidate-for-critic.test.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/candidate-for-critic.sources.sha256" \
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.mjs" \
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/README.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/capture-node-attempt.zsh" \
  > "$attempt_dir/pre-owned-source.sha256"
shasum -a 256 "$node_bin" > "$attempt_dir/node-binary.sha256"

print -r -- "$mode" > "$attempt_dir/mode.txt"
print -r -- "$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)" > "$attempt_dir/started-at-utc.txt"
"$node_bin" --version > "$attempt_dir/node-version.txt" 2>&1

if [[ "$mode" == setup-byte-probe ]]; then
  cat > "$attempt_dir/argv.json" <<EOF
[
  "$node_bin",
  "$repo_root/artifacts/game001ewc-round-1/builder/setup-byte-probe.mjs"
]
EOF
elif [[ "$mode" == north-paid-probe ]]; then
  cat > "$attempt_dir/argv.json" <<EOF
[
  "$node_bin",
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.mjs"
]
EOF
else
  cat > "$attempt_dir/argv.json" <<EOF
[
  "$node_bin",
  "--test",
  "--test-name-pattern=^game session endurance: shared policy preserves the active seed-zero match across chunks and restore cuts$",
  "tests/game-session-endurance.test.js"
]
EOF
fi

cat > "$attempt_dir/env.json" <<EOF
{
  "CI": "1",
  "HOME": "$attempt_dir/home",
  "LANG": "C",
  "LC_ALL": "C",
  "NO_COLOR": "1",
  "PATH": "/bin:/usr/bin:/usr/sbin:/sbin:/Users/me/.hermes/node/bin",
  "TMPDIR": "$attempt_dir/tmp/"
}
EOF

/usr/bin/env -i \
  CI=1 \
  HOME="$attempt_dir/home" \
  LANG=C \
  LC_ALL=C \
  NO_COLOR=1 \
  PATH=/bin:/usr/bin:/usr/sbin:/sbin:/Users/me/.hermes/node/bin \
  TMPDIR="$attempt_dir/tmp/" \
  "${argv[@]}" > "$attempt_dir/stdout.raw" 2> "$attempt_dir/stderr.raw" &
direct_pid=$!
print -r -- "$direct_pid" > "$attempt_dir/direct-pid.txt"
ps -p "$direct_pid" -o pid=,comm=,args= > "$attempt_dir/direct-process.txt" 2>&1
wait "$direct_pid"
run_exit=$?
print -r -- "$run_exit" > "$attempt_dir/exit.txt"
print -r -- "$(/bin/date -u +%Y-%m-%dT%H:%M:%SZ)" > "$attempt_dir/finished-at-utc.txt"

git rev-parse HEAD > "$attempt_dir/post-head.txt"
git status --porcelain=v1 --untracked-files=all > "$attempt_dir/post-git-status.txt"
git diff --binary > "$attempt_dir/post-git-diff.patch"
git ls-files -z -- src tests package.json package-lock.json |
  xargs -0 shasum -a 256 > "$attempt_dir/post-tracked-source.sha256"
shasum -a 256 \
  "$repo_root/tests/game-session-endurance.test.js" \
  "$repo_root/tests/helpers/endurance-workload.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/accepted-control.test.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/accepted-control.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/setup-byte-probe.mjs" \
  "$repo_root/artifacts/game001ewc-round-1/builder/first-focused-run.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/first-focused-run.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.executed-test.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.sources.sha256" \
  "$repo_root/artifacts/game001ewc-round-1/builder/full-focused-run.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/candidate-for-critic.test.js" \
  "$repo_root/artifacts/game001ewc-round-1/builder/candidate-for-critic.sources.sha256" \
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.mjs" \
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/north-paid-probe.stdout.raw" \
  "$repo_root/artifacts/game001ewc-round-1/builder/README.md" \
  "$repo_root/artifacts/game001ewc-round-1/builder/capture-node-attempt.zsh" \
  > "$attempt_dir/post-owned-source.sha256"
shasum -a 256 "$attempt_dir/stdout.raw" "$attempt_dir/stderr.raw" \
  > "$attempt_dir/output.sha256"

if diff -q "$attempt_dir/pre-head.txt" "$attempt_dir/post-head.txt" >/dev/null &&
    diff -q "$attempt_dir/pre-git-status.txt" "$attempt_dir/post-git-status.txt" >/dev/null &&
    diff -q "$attempt_dir/pre-git-diff.patch" "$attempt_dir/post-git-diff.patch" >/dev/null &&
    diff -q "$attempt_dir/pre-tracked-source.sha256" "$attempt_dir/post-tracked-source.sha256" >/dev/null &&
    diff -q "$attempt_dir/pre-owned-source.sha256" "$attempt_dir/post-owned-source.sha256" >/dev/null; then
  print -r -- "passed: repository source and Git fences are unchanged across the run" \
    > "$attempt_dir/source-fence.txt"
else
  print -r -- "failed: one or more repository source or Git fences changed during the run" \
    > "$attempt_dir/source-fence.txt"
fi

print -r -- "attempt=$attempt_dir pid=$direct_pid exit=$run_exit"
exit "$run_exit"
