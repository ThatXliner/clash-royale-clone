#!/bin/sh
set -u
name=$1
tempdir=$2
shift 2
root=/tmp/release-001b-critic-run.1c3cbh
evidence=$root/artifacts/release-guard-path-round-1/critic/release-guard-path-001-r2-L10qff
run=$evidence/runs/$name
mkdir -p "$run"
printf '%s\n' "$PWD" > "$run/cwd-logical.txt"
pwd -P > "$run/cwd-physical.txt"
printf 'TMPDIR=%s\n' "$tempdir" > "$run/environment.txt"
printf 'COMMAND=' >> "$run/environment.txt"
printf '%s ' "$@" >> "$run/environment.txt"
printf '\n' >> "$run/environment.txt"
printf '%s\n' 'ALLOWLIST=HOME PATH TMPDIR GAME_BROWSER_CHROME GAME_BROWSER_PLAYWRIGHT npm_config_userconfig npm_config_cache SHIPPING_ISOLATION_RELEASE_EVIDENCE' >> "$run/environment.txt"
env -i HOME=/Users/me PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin:/usr/sbin:/sbin TMPDIR="$tempdir" GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' GAME_BROWSER_PLAYWRIGHT='/Users/me/.codex/worktrees/d092a29e-844b-459d-b145-c548db10d485/billion/node_modules/.pnpm/playwright@1.58.2/node_modules/playwright/index.mjs' npm_config_userconfig=/dev/null npm_config_cache="$evidence/npm-cache" SHIPPING_ISOLATION_RELEASE_EVIDENCE="$evidence/shipping-isolation-release-evidence.json" "$@" > "$run/stdout.raw" 2> "$run/stderr.raw" &
pid=$!
printf '%s\n' "$pid" | tee "$run/pid.txt"
wait "$pid"
status=$?
printf '%s\n' "$status" > "$run/direct-exit.txt"
printf '%s\n' "DIRECT_EXIT=$status"
printf '%s\n' '--- STDOUT RAW ---'
cat "$run/stdout.raw"
printf '%s\n' '--- STDERR RAW ---'
cat "$run/stderr.raw"
exit "$status"
