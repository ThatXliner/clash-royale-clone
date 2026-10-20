#!/bin/sh
set -u
repo_root=/Users/me/.codex/worktrees/9456/clash-royale-clone
evidence_root=/Users/me/.codex/clash-qualification/20261020-design-r2-critic
candidate_html=$repo_root/design/20261020-redesign/claude-round-2/design-board.html
candidate_dir=$repo_root/design/20261020-redesign/claude-round-2
input_html=$evidence_root/input/design-board.html
runner=$evidence_root/capture.mjs
node_binary=/Users/me/.hermes/node/bin/node
chrome_binary=/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome
expected_sha=329af7bdcad3b13d35d074d5c26393ccf0267ebbdaf3a5429581cae6e13d5604

mkdir -p "$evidence_root/input" "$evidence_root/raw/normal" "$evidence_root/raw/audit"
cp "$candidate_html" "$input_html"
actual_sha=$(shasum -a 256 "$input_html" | awk '{print $1}')
if [ "$actual_sha" != "$expected_sha" ]; then
  printf 'candidate hash mismatch: expected %s, got %s\n' "$expected_sha" "$actual_sha" >&2
  exit 20
fi

source_paths='src/content/cards/basic-melee.js src/content/cards/basic-flying.js src/content/cards/basic-ranged.js src/content/cards/swarms.js src/content/cards/structure-seeker.js src/content/cards/ordinary-projectile-squads.js src/sim/deck.js src/sim/battle-continuation-kernel.js src/ui/card-lore.js'
{
  printf 'captured_at_utc: '
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  printf 'repo_root: %s\n' "$repo_root"
  printf 'git_head: '
  git -C "$repo_root" rev-parse HEAD
  printf 'candidate_expected_sha256: %s\n' "$expected_sha"
  printf 'candidate_copy_sha256: %s\n' "$actual_sha"
  printf 'node_binary: %s\n' "$node_binary"
  printf 'node_version: '
  "$node_binary" --version
  printf 'playwright_package: %s/node_modules/playwright/index.mjs\n' "$repo_root"
  printf 'playwright_version: '
  awk -F'"' '/"version"/ { print $4; exit }' "$repo_root/node_modules/playwright/package.json"
  printf 'chrome_binary: %s\n' "$chrome_binary"
  printf 'runner_path: %s\n' "$runner"
  printf 'runner_sha256: '
  shasum -a 256 "$runner" | awk '{print $1}'
  printf '\nCandidate and runner source hashes before launch:\n'
  shasum -a 256 "$candidate_dir/design-board.html" "$candidate_dir/art-direction.md" "$candidate_dir/character-to-3D-handoff.md" "$candidate_dir/motion-direction.md" "$runner" "$repo_root/node_modules/playwright/package.json" "$repo_root/node_modules/playwright-core/package.json"
  printf '\nAuthoritative HEAD source blob IDs before launch:\n'
  for source_path in $source_paths; do
    printf '%s ' "$source_path"
    git -C "$repo_root" rev-parse "HEAD:$source_path"
  done
  printf '\nSelected working-tree source status:\n'
  git -C "$repo_root" status --short -- $source_paths
} > "$evidence_root/prelaunch.txt"

{
  printf 'wrapper_pid=%s\n' "$$"
  printf 'node_argv=%s %s\n' "$node_binary" "$runner"
  printf 'browser_argv=Playwright chromium.launch({headless:true, executablePath:%s})\n' "$chrome_binary"
  printf '\nSanitized inherited environment:\n'
  env | LC_ALL=C sort | awk -F= 'BEGIN { IGNORECASE=1 } { key=$1; if (key ~ /(TOKEN|SECRET|PASSWORD|CREDENTIAL|AUTH|COOKIE|PRIVATE|API.?KEY)/) print key "=<redacted>"; else print }'
} > "$evidence_root/environment-sanitized.txt"

"$node_binary" "$runner" > "$evidence_root/stdout.raw" 2> "$evidence_root/stderr.raw" &
node_pid=$!
printf '%s\n' "$node_pid" > "$evidence_root/node-pid.txt"
printf 'node_pid=%s\n' "$node_pid" > "$evidence_root/processes-during.txt"
chrome_rows=
count=0
while [ "$count" -lt 40 ]; do
  chrome_rows=$(ps -axo pid=,ppid=,command= | awk -v parent="$node_pid" '$2 == parent && /Google Chrome/ { print }')
  if [ -n "$chrome_rows" ]; then
    break
  fi
  sleep 0.25
  count=$((count + 1))
done
printf 'direct_chrome_children:\n%s\n' "$chrome_rows" >> "$evidence_root/processes-during.txt"
wait "$node_pid"
node_exit=$?
printf '%s\n' "$node_exit" > "$evidence_root/exit-code.txt"
printf 'node_exit=%s\n' "$node_exit" >> "$evidence_root/processes-during.txt"
{
  printf 'captured_at_utc: '
  date -u '+%Y-%m-%dT%H:%M:%SZ'
  printf 'repo_root: %s\n' "$repo_root"
  printf 'git_head: '
  git -C "$repo_root" rev-parse HEAD
  printf '\nCandidate and runner source hashes after launch:\n'
  shasum -a 256 "$candidate_dir/design-board.html" "$candidate_dir/art-direction.md" "$candidate_dir/character-to-3D-handoff.md" "$candidate_dir/motion-direction.md" "$runner" "$repo_root/node_modules/playwright/package.json" "$repo_root/node_modules/playwright-core/package.json"
  printf '\nAuthoritative HEAD source blob IDs after launch:\n'
  for source_path in $source_paths; do
    printf '%s ' "$source_path"
    git -C "$repo_root" rev-parse "HEAD:$source_path"
  done
  printf '\nSelected working-tree source status:\n'
  git -C "$repo_root" status --short -- $source_paths
} > "$evidence_root/postlaunch.txt"
printf 'runner_exit=%s\n' "$node_exit"
exit "$node_exit"
