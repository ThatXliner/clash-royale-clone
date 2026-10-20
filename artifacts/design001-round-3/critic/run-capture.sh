#!/bin/sh
set -u
repo_root=/Users/me/.codex/worktrees/9456/clash-royale-clone
evidence_root=/Users/me/.codex/clash-qualification/20261020-design-r3-critic
candidate_html=$repo_root/design/20261020-redesign/claude-round-3/design-board.html
input_html=$evidence_root/input/design-board.html
runner=$evidence_root/capture.mjs
node_binary=/Users/me/.hermes/node/bin/node
chrome_binary='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
expected_sha=427788064b231af280b8c67a271c63bf0daeb8ce86879f41a361a6587218d2e4

actual_sha=$(shasum -a 256 "$candidate_html" | awk '{print $1}')
if [ "$actual_sha" != "$expected_sha" ]; then
  printf 'candidate hash mismatch: expected %s, got %s\n' "$expected_sha" "$actual_sha" >&2
  exit 20
fi
input_sha=$(shasum -a 256 "$input_html" | awk '{print $1}')
if [ "$input_sha" != "$expected_sha" ]; then
  printf 'candidate copy hash mismatch: expected %s, got %s\n' "$expected_sha" "$input_sha" >&2
  exit 21
fi
source_paths='src/content/playable-roster.js src/content/session-troop-roster.js src/content/editable-deck.js src/content/cards/basic-flying.js src/content/cards/basic-melee.js src/content/cards/basic-ranged.js src/content/cards/ordinary-projectile-squads.js src/content/cards/ordinary-projectile-splash.js src/content/cards/swarms.js src/content/cards/structure-seeker.js src/content/cards/special-movement-knockback.js src/content/cards/buildings-defensive.js src/content/cards/buildings-resource.js'
write_fence() {
  target=$1
  {
    printf 'captured_at_utc: '
    date -u '+%Y-%m-%dT%H:%M:%SZ'
    printf 'repo_root: %s\n' "$repo_root"
    printf 'git_head: '
    git -C "$repo_root" rev-parse HEAD
    printf 'candidate_path: %s\n' "$candidate_html"
    printf 'candidate_sha256: %s\n' "$actual_sha"
    printf 'candidate_copy_path: %s\n' "$input_html"
    printf 'candidate_copy_sha256: %s\n' "$input_sha"
    printf 'runner_path: %s\n' "$runner"
    printf 'runner_sha256: '
    shasum -a 256 "$runner" | awk '{print $1}'
    printf 'node_binary_path: %s\n' "$node_binary"
    printf 'playwright_module_path: %s/node_modules/playwright/index.mjs\n' "$repo_root"
    printf 'chrome_binary_path: %s\n' "$chrome_binary"
    printf '\nAuthoritative Git HEAD source blob IDs:\n'
    for source_path in $source_paths; do
      printf '%s ' "$source_path"
      git -C "$repo_root" rev-parse "HEAD:$source_path"
    done
    printf '\nSelected working-tree source status:\n'
    git -C "$repo_root" status --short -- $source_paths
    printf '\nSelected dependency package versions:\n'
    awk -F'"' '/"version"/ { print "playwright=" $4; exit }' "$repo_root/node_modules/playwright/package.json"
    awk -F'"' '/"version"/ { print "playwright-core=" $4; exit }' "$repo_root/node_modules/playwright-core/package.json"
  } > "$target"
}
write_fence "$evidence_root/prelaunch.txt"
{
  printf 'wrapper_pid=%s\n' "$$"
  printf 'node_argv=%s %s\n' "$node_binary" "$runner"
  printf 'browser_argv=Playwright chromium.launch({headless:true, executablePath:%s})\n' "$chrome_binary"
  printf 'environment_allowlist_only:\n'
  printf 'PATH=%s\n' "${PATH-}"
  printf 'HOME=%s\n' "${HOME-}"
  printf 'TMPDIR=%s\n' "${TMPDIR-}"
  printf 'LANG=%s\n' "${LANG-}"
  printf 'LC_ALL=%s\n' "${LC_ALL-}"
  printf 'TZ=%s\n' "${TZ-}"
} > "$evidence_root/environment-allowlist.txt"

/usr/bin/env -i PATH="${PATH-}" HOME="${HOME-}" TMPDIR="${TMPDIR-/tmp}" LANG="${LANG-}" LC_ALL="${LC_ALL-}" TZ="${TZ-}" \
  "$node_binary" "$runner" > "$evidence_root/stdout.raw" 2> "$evidence_root/stderr.raw" &
node_pid=$!
printf '%s\n' "$node_pid" > "$evidence_root/node-pid.txt"
printf 'wrapper_pid=%s\nnode_pid=%s\n' "$$" "$node_pid" > "$evidence_root/processes-during.txt"
chrome_rows=
count=0
while [ "$count" -lt 40 ]; do
  chrome_rows=$(ps -axo pid=,ppid=,command= | awk -v parent="$node_pid" '$2 == parent && /Google Chrome/ { print }')
  if [ -n "$chrome_rows" ]; then break; fi
  sleep 0.25
  count=$((count + 1))
done
printf 'direct_chrome_children:\n%s\n' "$chrome_rows" >> "$evidence_root/processes-during.txt"
wait "$node_pid"
node_exit=$?
printf 'node_exit=%s\n' "$node_exit" >> "$evidence_root/processes-during.txt"
printf '%s\n' "$node_exit" > "$evidence_root/exit-code.txt"
write_fence "$evidence_root/postlaunch.txt"
printf 'runner_exit=%s\n' "$node_exit"
exit "$node_exit"
