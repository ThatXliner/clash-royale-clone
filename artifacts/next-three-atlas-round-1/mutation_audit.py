import hashlib, json, shutil, subprocess, sys
from pathlib import Path
OUT=Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-critic')
ART=Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-builder')
case=OUT/'independent-mutation-case'
if case.exists(): shutil.rmtree(case)
(case/'scripts').mkdir(parents=True)
(case/'inputs').mkdir()
shutil.copy2(ART/'source-map.json',case/'source-map.json')
shutil.copy2(ART/'scripts/build-next-three-atlases.py',case/'scripts/build-next-three-atlases.py')
shutil.copytree(ART/'inputs/raw-256',case/'inputs/raw-256')
source_map=json.loads((case/'source-map.json').read_text())
cell=next(x for x in source_map['assets']['skymaul']['cells'] if (x['team'],x['direction'],x['pose'])==('river','east','idle'))
p=case/cell['source_copy']; original=p.read_bytes(); changed=bytearray(original); changed[-1]^=1; p.write_bytes(changed)
out=OUT/'independent-mutation-case-output'
if out.exists(): shutil.rmtree(out)
cmd=[sys.executable,str(case/'scripts/build-next-three-atlases.py'),'--output-dir',str(out)]
r=subprocess.run(cmd,capture_output=True,text=True,check=False)
combined=r.stdout+r.stderr
(OUT/'logs/mutation.txt').write_text(combined,encoding='utf-8')
files=sorted(str(x.relative_to(out)) for x in out.rglob('*') if x.is_file()) if out.exists() else []
result={'command':' '.join(cmd),'exit_code':r.returncode,'mutated_copy':cell['source_copy'],'original_sha256':hashlib.sha256(original).hexdigest(),'mutated_sha256':hashlib.sha256(changed).hexdigest(),'rejection_text_found':'source sha256 changed' in combined,'output_dir_exists':out.exists(),'output_files':files,'output_file_count':len(files),'passed':r.returncode!=0 and 'source sha256 changed' in combined and not files}
(OUT/'independent-mutation.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n')
assert result['passed'],result
p=OUT/'independent-audit.json'; data=json.loads(p.read_text()); data['independent_source_sha_mutation_rejection']=result; p.write_text(json.dumps(data,indent=2,sort_keys=True)+'\n')
print('INDEPENDENT MUTATION PASS')
print(json.dumps(result,sort_keys=True))
print('actual stdout/stderr:',repr(combined))
