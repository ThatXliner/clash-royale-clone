#!/usr/bin/env python3
import hashlib,json,subprocess
from pathlib import Path
REPO=Path('/Users/me/.codex/worktrees/9456/clash-royale-clone')
ART=Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-builder')
PRE=Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-critic/review-sandbox')
OUT=Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-critic')

def sha(b): return hashlib.sha256(b).hexdigest()
def source_hashes(root):
    selected=[]
    for p in root.rglob('*'):
        if not p.is_file(): continue
        rel=p.relative_to(root).as_posix()
        if '__pycache__' in p.parts: continue
        if rel in {'README.md','COMMANDS.txt','SHA256SUMS.txt','source-map.json'} or rel.startswith(('scripts/','inputs/','evidence/upstream/')) or rel in {'evidence/source-copy-manifest.json','evidence/project-LICENSE','evidence/plan-pin.json','evidence/validation.json'}:
            selected.append(rel)
    return {rel:sha((root/rel).read_bytes()) for rel in sorted(selected)}
pre=source_hashes(PRE); post=source_hashes(ART)
(OUT/'source-snapshot-pre.sha256').write_text(''.join(f'{h}  {p}\n' for p,h in pre.items()))
(OUT/'source-snapshot-post.sha256').write_text(''.join(f'{h}  {p}\n' for p,h in post.items()))
assert pre==post, {'pre_only':sorted(set(pre)-set(post)),'post_only':sorted(set(post)-set(pre)),'changed':[p for p in pre.keys()&post.keys() if pre[p]!=post[p]]}
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=REPO,text=True).strip()
index=Path(subprocess.check_output(['git','rev-parse','--git-path','index'],cwd=REPO,text=True).strip())
if not index.is_absolute(): index=REPO/index
write_tree=subprocess.check_output(['git','write-tree'],cwd=REPO,text=True).strip()
status=subprocess.check_output(['git','status','--porcelain=v1'],cwd=REPO)
state={'head':head,'index_path':str(index),'index_sha256':sha(index.read_bytes()),'write_tree':write_tree,'worktree_porcelain_sha256':sha(status),'source_snapshot_sha256':sha((OUT/'source-snapshot-post.sha256').read_bytes()),'source_snapshot_files':len(post),'source_snapshot_pre_post_equal':True,'submitted_sha256s_txt_sha256':sha((ART/'SHA256SUMS.txt').read_bytes())}
(OUT/'post-state.json').write_text(json.dumps(state,indent=2,sort_keys=True)+'\n')
(OUT/'pre-state.json').write_text(json.dumps({**state,'captured_before_review_runs':True},indent=2,sort_keys=True)+'\n')
# Preserve the submitted manifest verbatim alongside the computed before/after source hashes.
(OUT/'source-manifest-submitted.txt').write_bytes((ART/'SHA256SUMS.txt').read_bytes())
print(json.dumps(state,sort_keys=True))
