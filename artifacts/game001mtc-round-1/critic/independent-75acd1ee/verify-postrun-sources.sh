#!/bin/sh
set -eu
repo=/Users/me/.codex/worktrees/9456/clash-royale-clone
source_base=/private/tmp/game001mtc-critic-sources.0m4ONi
evidence=/private/tmp/game001mtc-critic.0m4ONi/evidence/postrun-source-verification.txt
tmp="$evidence.tmp"
{
  printf 'Copies were made after both suite processes exited.\n'
  date -u '+copied_at=%Y-%m-%dT%H:%M:%SZ'
  for label in candidate parent; do
    case "$label" in
      candidate) rev=75acd1ee37d1cf52124d346bfd9eed2ac79ac2e0 ;;
      parent) rev=69daeff24563aff5df5379f36ef9c27f5582307c ;;
    esac
    printf '\n[%s commit=%s]\n' "$label" "$rev"
    for rel in package.json tests/game-roster-troops-movement-runner.js tests/game-roster-troops-movement.test.js; do
      copy="/private/tmp/game001mtc-critic.0m4ONi/evidence/executed-source-postrun/$label/$rel"
      sha=$(shasum -a 256 "$copy" | awk '{print $1}')
      before=$(awk -v target="$rel" '$2 == target {print $1}' "/private/tmp/game001mtc-critic.0m4ONi/evidence/attempt-$label/source-fence-before.txt")
      after=$(awk -v target="$rel" '$2 == target {print $1}' "/private/tmp/game001mtc-critic.0m4ONi/evidence/attempt-$label/source-fence-after.txt")
      git_blob=$(git -C "$repo" rev-parse "$rev:$rel")
      copy_blob=$(git -C "$repo" hash-object "$copy")
      if [ "$sha" != "$before" ] || [ "$sha" != "$after" ] || [ "$git_blob" != "$copy_blob" ]; then
        printf 'MISMATCH %s %s sha256=%s before=%s after=%s git_blob=%s copy_blob=%s\n' \
          "$label" "$rel" "$sha" "$before" "$after" "$git_blob" "$copy_blob"
        exit 1
      fi
      printf 'MATCH %s sha256=%s before=%s after=%s git_blob=%s copy_blob=%s\n' \
        "$rel" "$sha" "$before" "$after" "$git_blob" "$copy_blob"
    done
  done
} > "$tmp"
mv "$tmp" "$evidence"
