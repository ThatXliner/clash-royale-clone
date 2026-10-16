#!/bin/sh
set -eu
repo=/Users/me/.codex/worktrees/9456/clash-royale-clone
sources=/private/tmp/game001mtc-critic.0m4ONi/sources
historical=6a2f26dc89f1fab9978d1a6e00cfb7c2f19016a2
parent=69daeff24563aff5df5379f36ef9c27f5582307c
candidate=75acd1ee37d1cf52124d346bfd9eed2ac79ac2e0
printf 'repo=%s\nhistorical=%s\nparent=%s\ncandidate=%s\n' "$repo" "$historical" "$parent" "$candidate" > "$sources/revisions.txt"
for spec in "historical:$historical" "parent:$parent" "candidate:$candidate"; do
  name=${spec%%:*}
  rev=${spec#*:}
  dest="$sources/$name"
  mkdir -p "$dest"
  git -C "$repo" archive --format=tar "$rev" | tar -xf - -C "$dest"
  rm -rf "$dest/artifacts"
done
printf 'Archived Git trees; only root artifacts/ removed after extraction.\n'
