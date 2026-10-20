#!/bin/sh
set -eu
stage=$1
candidate=$2
baseline=$3
root=$4
manifest=$5
dest=$root/source-$stage
[ ! -e "$dest" ] || { printf 'refusing existing source snapshot: %s\n' "$dest" >&2; exit 2; }
/bin/mkdir -p "$dest/candidate" "$dest/baseline"

for subtree in src tests scripts public demo; do
  /usr/bin/ditto "$candidate/$subtree" "$dest/candidate/$subtree"
done
/usr/bin/ditto "$baseline/src" "$dest/baseline/src"
for file in package.json package-lock.json index.html vite.config.js; do
  if [ -f "$candidate/$file" ]; then /bin/cp -p "$candidate/$file" "$dest/candidate/$file"; fi
  if [ -f "$baseline/$file" ]; then /bin/cp -p "$baseline/$file" "$dest/baseline/$file"; fi
done
if [ -f "$baseline/package.json" ]; then /bin/cp -p "$baseline/package.json" "$dest/baseline/package.json"; fi
if [ -f "$baseline/package-lock.json" ]; then /bin/cp -p "$baseline/package-lock.json" "$dest/baseline/package-lock.json"; fi

candidate_head=$(/usr/bin/git -C "$candidate" rev-parse HEAD)
candidate_parent=$(/usr/bin/git -C "$candidate" rev-parse HEAD^)
baseline_head=$(/usr/bin/git -C "$baseline" rev-parse HEAD)
/usr/bin/git -C "$candidate" status --short --branch > "$dest/candidate-git-status.txt"
/usr/bin/git -C "$candidate" status --porcelain --untracked-files=all > "$dest/candidate-git-status-porcelain.txt"
/usr/bin/git -C "$baseline" status --short --branch > "$dest/baseline-git-status.txt"
/usr/bin/git -C "$baseline" status --porcelain --untracked-files=all > "$dest/baseline-git-status-porcelain.txt"
/usr/bin/git -C "$candidate" diff --name-only "$candidate_parent" "$candidate_head" -- > "$dest/candidate-parent-changed-paths.txt"
printf 'candidate_head\t%s\ncandidate_parent\t%s\nbaseline_head\t%s\n' "$candidate_head" "$candidate_parent" "$baseline_head" > "$dest/git-pins.tsv"
/usr/bin/cut -f 1 "$manifest" > "$dest/expected-factory-paths.txt"
/usr/bin/sort "$dest/candidate-parent-changed-paths.txt" > "$dest/candidate-parent-changed-paths.sorted.txt"
if /usr/bin/cmp -s "$dest/expected-factory-paths.txt" "$dest/candidate-parent-changed-paths.sorted.txt"; then
  printf 'candidate_parent_path_set\tPASS\n' > "$dest/git-fence-result.tsv"
else
  printf 'candidate_parent_path_set\tFAIL\n' > "$dest/git-fence-result.tsv"
fi
printf 'path\texpected_blob\tactual_blob\texpected_sha256\tactual_sha256\tresult\n' > "$dest/factory-source-fences.tsv"
tab=$(printf '\t')
while IFS="$tab" read -r relative expected_blob expected_sha; do
  [ -n "$relative" ] || continue
  actual_blob=$(/usr/bin/git -C "$candidate" rev-parse "$candidate_head:$relative")
  actual_sha=$(/usr/bin/shasum -a 256 "$candidate/$relative" | /usr/bin/awk '{print $1}')
  result=PASS
  [ "$actual_blob" = "$expected_blob" ] || result=FAIL
  [ "$actual_sha" = "$expected_sha" ] || result=FAIL
  printf '%s\t%s\t%s\t%s\t%s\t%s\n' "$relative" "$expected_blob" "$actual_blob" "$expected_sha" "$actual_sha" "$result" >> "$dest/factory-source-fences.tsv"
done < "$manifest"
(cd "$dest" && /usr/bin/find candidate baseline -type f -exec /usr/bin/shasum -a 256 {} \; | /usr/bin/sort) > "$dest/executed-inputs.sha256"
