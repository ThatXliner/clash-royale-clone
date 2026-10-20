#!/usr/bin/env python3
"""Independent stdlib-only provenance and RGBA audit for APP-REDESIGN-ATLAS-002."""
from __future__ import annotations
import hashlib, json, struct, subprocess, zlib
from pathlib import Path

REPO = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone')
COMMIT = 'f8f6cfe35f8b7756f169225eea57b20ed25720a9'
ART = Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-builder')
OUT = Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-critic')
EXT_ROOT = Path('/Users/me/.codex/clash-qualification/20261020-astra-sky-brass-reed-models/attempts/native-r1')
CARDS = ('skymaul', 'brassbolt', 'reedsting')
COLS = ('east', 'north', 'south', 'west')
ROWS = (('river','idle'),('river','walk'),('river','contact'),('ember','idle'),('ember','walk'),('ember','contact'))
EXPECTED = {(team,direction,pose) for team,pose in ROWS for direction in COLS}


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def req(ok: bool, message: str) -> None:
    if not ok:
        raise AssertionError(message)

def git_blob(path: str) -> bytes:
    return subprocess.check_output(['git','show',f'{COMMIT}:{path}'], cwd=REPO)

def decode_rgba_png(path: Path) -> tuple[int,int,list[bytes],dict]:
    data = path.read_bytes()
    req(data[:8] == b'\x89PNG\r\n\x1a\n', f'{path}: invalid PNG signature')
    pos = 8; width=height=depth=color=interlace=None; compressed=[]; chunks=[]; seen_iend=False
    while pos < len(data):
        req(pos + 12 <= len(data), f'{path}: truncated chunk header')
        n = struct.unpack('>I', data[pos:pos+4])[0]; typ=data[pos+4:pos+8]; start=pos+8; end=start+n
        req(end+4 <= len(data), f'{path}: truncated {typ!r} chunk')
        body=data[start:end]; crc=struct.unpack('>I',data[end:end+4])[0]
        req((zlib.crc32(typ+body)&0xffffffff)==crc, f'{path}: bad CRC in {typ!r}')
        chunks.append(typ.decode('ascii'))
        if typ == b'IHDR':
            req(n == 13 and width is None, f'{path}: bad IHDR')
            width,height,depth,color,compression,filter_method,interlace=struct.unpack('>IIBBBBB',body)
            req(compression == 0 and filter_method == 0, f'{path}: unsupported PNG method')
        elif typ == b'IDAT': compressed.append(body)
        elif typ == b'IEND': seen_iend=True; pos=end+4; break
        pos=end+4
    req(seen_iend and pos == len(data), f'{path}: missing or trailing bytes after IEND')
    req(depth == 8 and color == 6 and interlace == 0, f'{path}: expected non-interlaced RGBA8, got depth={depth} color={color} interlace={interlace}')
    raw=zlib.decompress(b''.join(compressed)); stride=width*4
    req(len(raw)==height*(stride+1), f'{path}: unexpected decompressed byte count')
    rows=[]; prior=bytearray(stride); offset=0
    def paeth(a:int,b:int,c:int)->int:
        p=a+b-c; pa=abs(p-a); pb=abs(p-b); pc=abs(p-c)
        return a if pa<=pb and pa<=pc else (b if pb<=pc else c)
    for _y in range(height):
        ft=raw[offset]; scan=bytearray(raw[offset+1:offset+1+stride]); offset+=stride+1
        req(ft in (0,1,2,3,4),f'{path}: unsupported PNG filter {ft}')
        for i in range(stride):
            left=scan[i-4] if i>=4 else 0; up=prior[i]; ul=prior[i-4] if i>=4 else 0
            if ft==1: scan[i]=(scan[i]+left)&255
            elif ft==2: scan[i]=(scan[i]+up)&255
            elif ft==3: scan[i]=(scan[i]+((left+up)//2))&255
            elif ft==4: scan[i]=(scan[i]+paeth(left,up,ul))&255
        rows.append(bytes(scan)); prior=scan
    return width,height,rows,{'bit_depth':depth,'color_type':color,'interlace':interlace,'chunks':chunks}

def file_digest(path: Path) -> dict:
    b=path.read_bytes(); return {'path':str(path),'bytes':len(b),'sha256':sha(b)}

src_map_bytes=(ART/'source-map.json').read_bytes()
source_map=json.loads(src_map_bytes)
source_map_hash=sha(src_map_bytes)
req(set(source_map['assets'])==set(CARDS), 'source map must cover exactly Skymaul, Brassbolt and Reedsting')
layout=source_map['layout']
req(layout['atlas_px']==[256,384] and layout['cell_px']==[64,64] and layout['source_px']==[256,256], 'wrong dimensions')
req(layout['columns']==list(COLS), 'wrong named direction axis')
req(layout['rows']==[{'team':t,'pose':p} for t,p in ROWS], 'wrong named team/pose axis')
req(layout['ground_pivot_px_per_cell']==[32,54], 'wrong ground pivot')

# The candidate's whole-file manifest must cover all package files except itself.
manifest={}
for line in (ART/'SHA256SUMS.txt').read_text().splitlines():
    if line.strip():
        expected_hash=line[:64]; rel=line[66:]
        req(len(expected_hash)==64 and rel, f'malformed SHA256SUMS line: {line!r}')
        manifest[rel]=expected_hash
actual_files={p.relative_to(ART).as_posix() for p in ART.rglob('*') if p.is_file() and p.name!='SHA256SUMS.txt'}
req(actual_files==set(manifest), f'SHA256SUMS file coverage differs: missing={sorted(actual_files-set(manifest))[:5]} extra={sorted(set(manifest)-actual_files)[:5]}')
manifest_mismatches=[]
for rel, expected_hash in manifest.items():
    if sha((ART/rel).read_bytes()) != expected_hash: manifest_mismatches.append(rel)
req(not manifest_mismatches, f'SHA256SUMS mismatches: {manifest_mismatches}')

copy_manifest=json.loads((ART/'evidence/source-copy-manifest.json').read_text())
copy_by_path={x['copy_path']:x for x in copy_manifest['files']}
req(len(copy_manifest['files'])==144 and len(copy_by_path)==144, 'source-copy manifest must identify 144 unique raw/native copies')
model_index_bytes=(ART/'evidence/upstream/model-artifact-index.json').read_bytes()
model_index=json.loads(model_index_bytes)
model_index_entries={x['path']:x for m in model_index['models'] for x in m['files']}
req(model_index['canonical_model_root']=='design/20261020-redesign/astra-next-three-round-1/models', 'wrong canonical model root')

report_git=git_blob('artifacts/next-three-native-round-1/report.md')
index_git=git_blob('artifacts/next-three-native-round-1/models/model-artifact-index.json')
license_git=git_blob('LICENSE')
req((ART/'evidence/upstream/accepted-critic-report.md').read_bytes()==report_git, 'copied accepted art critic report differs from canonical main commit blob')
req(model_index_bytes==index_git, 'copied model artifact index differs from canonical main commit blob')
req((ART/'evidence/project-LICENSE').read_bytes()==license_git, 'included project license differs from canonical main commit blob')

source_receipts=[]; model_hashes=[]; cell_records=[]
for card in CARDS:
    asset=source_map['assets'][card]
    req(asset['variant']=='native-r1', f'{card}: wrong source variant')
    req(asset['approval']['verdict']=='PASS' and 'standalone' in asset['approval']['scope'], f'{card}: approval metadata inaccurate')
    source_model=asset['source_model']
    model_blob=git_blob(source_model['canonical_path'])
    req(len(model_blob)==source_model['bytes'] and sha(model_blob)==source_model['sha256'], f'{card}: source model metadata differs from canonical Git blob')
    model_entry=model_index_entries.get(source_model['canonical_path'])
    req(model_entry is not None and model_entry['bytes']==len(model_blob) and model_entry['sha256']==sha(model_blob), f'{card}: artifact index model record mismatch')
    model_hashes.append({'card':card,'canonical_path':source_model['canonical_path'],'bytes':len(model_blob),'sha256':sha(model_blob),'evaluated_triangles':source_model['evaluated_triangles']})
    rec=asset['render_receipt']
    external_receipt=Path(rec['original_path'])
    receipt_bytes=external_receipt.read_bytes()
    copied_receipt=(ART/rec['path']).read_bytes()
    canonical_receipt=git_blob(asset['review_manifest']['canonical_receipt_path'])
    req(len(receipt_bytes)==rec['bytes'] and sha(receipt_bytes)==rec['sha256'], f'{card}: immutable actual receipt size/hash mismatch')
    req(copied_receipt==receipt_bytes and canonical_receipt==receipt_bytes, f'{card}: copied or canonical render receipt differs from immutable actual receipt')
    receipt=json.loads(receipt_bytes)
    req(receipt['card_id']==card and receipt['runtime_integration'] is False, f'{card}: receipt scope/card mismatch')
    images=[x for x in receipt['images'] if x.get('kind')=='color']
    receipt_cells={(x['team'],x['direction'],x['pose']):x for x in images}
    req(len(images)==24 and len(receipt_cells)==24 and set(receipt_cells)==EXPECTED, f'{card}: actual receipt color cells do not cover 24 expected named cells')
    mapped={(x['team'],x['direction'],x['pose']):x for x in asset['cells']}
    req(len(mapped)==24 and set(mapped)==EXPECTED, f'{card}: source-map does not cover 24 expected named cells')
    blend=receipt['blend']
    req(blend['bytes']==source_model['bytes'] and blend['sha256']==source_model['sha256'], f'{card}: receipt and canonical model metadata disagree')
    external_model=Path(source_model['external_path'])
    ext_model_bytes=external_model.read_bytes()
    req(len(ext_model_bytes)==source_model['bytes'] and sha(ext_model_bytes)==sha(model_blob), f'{card}: immutable run model copy differs from canonical Git blob')
    for (team,direction,pose), cell in mapped.items():
        image=receipt_cells[(team,direction,pose)]
        req(cell['source_render']=={k:image['raw'][k] for k in ('bytes','height','path','sha256','width')} | {'format':'PNG RGBA8'}, f'{card} {team}/{direction}/{pose}: raw metadata differs from actual receipt')
        req(cell['approved_native64']=={k:image['native'][k] for k in ('bytes','height','path','sha256','width')} | {'format':'PNG RGBA8'}, f'{card} {team}/{direction}/{pose}: native metadata differs from actual receipt')
        req(cell['renderer']=={k:image[k] for k in ('engine','view_transform','frame','evidence_origin')}, f'{card} {team}/{direction}/{pose}: renderer metadata differs from actual receipt')
        for role, copy_key, source_key, expected_dim in (
            ('raw_source','source_copy','raw',256),('approved_native64_reference','native_reference_copy','native',64)):
            copy_path=cell[copy_key]
            original=Path(image[source_key]['path'])
            copied=ART/copy_path
            original_bytes=original.read_bytes(); copied_bytes=copied.read_bytes()
            rec_img=image[source_key]
            req(len(original_bytes)==rec_img['bytes'] and sha(original_bytes)==rec_img['sha256'], f'{card} {team}/{direction}/{pose}: original {role} fails actual receipt hash')
            req(copied_bytes==original_bytes, f'{card} {team}/{direction}/{pose}: copied {role} is not byte-identical to original (no normalization/re-encoding)')
            width,height,rows,pnginfo=decode_rgba_png(copied)
            req((width,height)==(expected_dim,expected_dim), f'{card} {team}/{direction}/{pose}: {role} dimensions are {(width,height)}')
            req(rec_img['width']==width and rec_img['height']==height, f'{card} {team}/{direction}/{pose}: receipt dimensions mismatch')
            m=copy_by_path.get(copy_path)
            req(m is not None and m['role']==role and m['card']==card and m['team']==team and m['direction']==direction and m['pose']==pose, f'{card} {team}/{direction}/{pose}: source-copy manifest labels mismatch')
            req(m['original_path']==rec_img['path'] and m['bytes']==len(original_bytes) and m['sha256']==sha(original_bytes), f'{card} {team}/{direction}/{pose}: source-copy manifest provenance mismatch')
            if source_key=='native': native_pixels=rows
        cell_records.append({'card':card,'team':team,'direction':direction,'pose':pose,
                             'raw_sha256':sha((ART/cell['source_copy']).read_bytes()),
                             'native64_sha256':sha((ART/cell['native_reference_copy']).read_bytes()),
                             'renderer':cell['renderer']})
    source_receipts.append({'card':card,'render_receipt_sha256':sha(receipt_bytes),'color_frames':len(images),'source_model_sha256':sha(model_blob)})

# Verify provenance and output files for both independent clean builds, plus packaged clean-a/b.
builder_bytes=(ART/'scripts/build-next-three-atlases.py').read_bytes()
source_package_bytes=(ART/'evidence/upstream/source-package-provenance.json').read_bytes()
source_package=json.loads(source_package_bytes)
req(source_package['license']=='AGPL-3.0-only' and source_package['runtime_integration'] is False and source_package['reference_imported'] is False, 'source-package provenance license/scope flags mismatch')
req(sha(source_package_bytes)==source_map['source_package_provenance']['sha256'], 'source-package provenance hash mismatch')
sets={
 'fresh-a': OUT/'build-a',
 'fresh-b': OUT/'build-b',
 'submitted-clean-a': ART/'builds/clean-a',
 'submitted-clean-b': ART/'builds/clean-b',
}
output_hashes={}; output_size={}
provenance_data={}
for build_name, build_dir in sets.items():
    pbytes=(build_dir/'provenance.json').read_bytes(); prov=json.loads(pbytes); provenance_data[build_name]=pbytes
    req(prov['generator']['sha256']==sha(builder_bytes), f'{build_name}: provenance generator hash mismatch')
    req(prov['generator']['source_map_sha256']==source_map_hash, f'{build_name}: provenance source-map hash mismatch')
    req(prov['license']['license_copy_sha256']==sha(license_git) and prov['license']['spdx']=='AGPL-3.0-only', f'{build_name}: license provenance mismatch')
    req(prov['source_package_provenance']['sha256']==sha(source_package_bytes), f'{build_name}: source-package provenance mismatch')
    output_hashes[build_name]={}; output_size[build_name]={}
    for card in CARDS:
        atlas_path=build_dir/({'skymaul':'skymaul-battle-sprite.png','brassbolt':'brassbolt-battle-sprite.png','reedsting':'reedsting-battle-sprite.png'}[card])
        atlas_bytes=atlas_path.read_bytes(); w,h,atlas_rows,pnginfo=decode_rgba_png(atlas_path)
        req((w,h)==(256,384), f'{build_name}/{card}: wrong atlas dimensions')
        req(len(atlas_bytes)<=1048576, f'{build_name}/{card}: atlas exceeds 1 MiB')
        output_hashes[build_name][card]=sha(atlas_bytes); output_size[build_name][card]=len(atlas_bytes)
        pa=prov['assets'][card]
        req(pa['source_model']==source_map['assets'][card]['source_model'], f'{build_name}/{card}: provenance source model mismatch')
        req(pa['render_receipt']==source_map['assets'][card]['render_receipt'], f'{build_name}/{card}: provenance receipt mismatch')
        req(pa['review_manifest']==source_map['assets'][card]['review_manifest'], f'{build_name}/{card}: provenance model index mismatch')
        req(pa['approval']==source_map['assets'][card]['approval'], f'{build_name}/{card}: provenance approval mismatch')
        req(pa['output']['sha256']==sha(atlas_bytes) and pa['output']['bytes']==len(atlas_bytes) and pa['output']['dimensions_px']==[256,384], f'{build_name}/{card}: provenance output metadata mismatch')
        frames=pa['frames']; frame_map={(f['team'],f['direction'],f['pose']):f for f in frames}
        req(len(frames)==24 and set(frame_map)==EXPECTED, f'{build_name}/{card}: provenance frame axes/cell coverage mismatch')
        cells={(c['team'],c['direction'],c['pose']):c for c in source_map['assets'][card]['cells']}
        for team,pose in ROWS:
            row=ROWS.index((team,pose))
            for col,direction in enumerate(COLS):
                key=(team,direction,pose); x0=col*64; y0=row*64
                native_path=ART/cells[key]['native_reference_copy']
                nw,nh,native_rows,_=decode_rgba_png(native_path)
                decoded_cell=[r[x0*4:(x0+64)*4] for r in atlas_rows[y0:y0+64]]
                req(decoded_cell==native_rows, f'{build_name}/{card} {team}/{direction}/{pose}: decoded RGBA differs from immutable approved native64 pixels')
                f=frame_map[key]
                req(f['source_render']==cells[key]['source_render'] and f['approved_native64']==cells[key]['approved_native64'] and f['renderer']==cells[key]['renderer'], f'{build_name}/{card} {team}/{direction}/{pose}: provenance frame metadata mismatch')

req(output_hashes['fresh-a']==output_hashes['fresh-b'], 'independent fresh build atlas bytes differ')
req(provenance_data['fresh-a']==provenance_data['fresh-b'], 'independent fresh build provenance bytes differ')
req(output_hashes['submitted-clean-a']==output_hashes['submitted-clean-b'], 'submitted clean-a/clean-b atlas bytes differ')
req(provenance_data['submitted-clean-a']==provenance_data['submitted-clean-b'], 'submitted clean-a/clean-b provenance bytes differ')
req(output_hashes['fresh-a']==output_hashes['submitted-clean-a'], 'fresh and submitted atlas bytes differ')
req(provenance_data['fresh-a']==provenance_data['submitted-clean-a'], 'fresh and submitted provenance bytes differ')

# Verify the validator's axis-labeled comparison metadata and generated sheet halves.
validation=json.loads((OUT/'validation.json').read_text())
req(validation['status']=='PASS' and validation['source_cells_checked']==72 and validation['decoded_native64_cell_comparisons']==72, 'validator result numbers/status mismatch')
req(validation['layout']['columns']==list(COLS) and validation['layout']['rows']==[{'team':t,'pose':p} for t,p in ROWS], 'validator named axes mismatch')
comparison=[]
for item in validation['comparison_sheets']:
    sheet=Path('/Users/me/.codex/clash-qualification/20261020-next-three-atlas-critic/review-sandbox')/item['path']
    w,h,rows,_=decode_rgba_png(sheet)
    req((w,h)==(512,384), f'{sheet}: comparison dimensions mismatch')
    req(all(row[:256*4]==row[256*4:] for row in rows), f'{sheet}: comparison halves differ')
    req(sha(sheet.read_bytes())==item['sha256'], f'{sheet}: comparison sheet hash differs from validator record')
    comparison.append({'card':Path(item['path']).name.split('-atlas-')[0],'bytes':item['bytes'],'sha256':item['sha256'],'dimensions_px':[w,h],'left':item['left'],'right':item['right']})

result={
 'status':'PASS',
 'review_target':str(ART),
 'canonical_commit':COMMIT,
 'layout':layout,
 'source_manifest_files':len(manifest),
 'source_manifest_mismatches':manifest_mismatches,
 'copied_raw_source_frames_verified':72,
 'copied_approved_native64_frames_verified':72,
 'copies_byte_identical_to_actual_immutable_native_run':True,
 'raw_and_native_png_profile_chunks_compared_to_each_other':False,
 'immutable_actual_render_receipts':source_receipts,
 'canonical_source_models':model_hashes,
 'decoded_cell_comparisons':72,
 'clean_build_output_sha256':output_hashes,
 'clean_build_output_bytes':output_size,
 'byte_identical_clean_pngs':True,
 'byte_identical_clean_provenance':True,
 'largest_atlas_bytes':max(max(v.values()) for v in output_size.values()),
 'atlas_limit_bytes':1048576,
 'source_sha_mutation_rejection':validation['source_sha_mutation_rejection'],
 'comparison_sheets':comparison,
 'canonical_report_sha256':sha(report_git),
 'canonical_model_index_sha256':sha(index_git),
 'project_license_sha256':sha(license_git),
 'source_package_provenance_sha256':sha(source_package_bytes),
 'scope':'Standalone atlas packing only; no public registration, live integration, runtime motion, or full-cast acceptance.',
 'cells':cell_records,
}
(OUT/'independent-audit.json').write_text(json.dumps(result,indent=2,sort_keys=True)+'\n',encoding='utf-8')
print('INDEPENDENT AUDIT PASS')
print('72 raw-256 inputs and 72 approved native64 inputs match immutable native-run files byte-for-byte')
print('72 output cells equal immutable native64 RGBA pixels; rows River idle/walk/contact then Ember idle/walk/contact; columns East/North/South/West')
print('fresh A/B PNG SHA-256s:', json.dumps(output_hashes['fresh-a'],sort_keys=True))
print('fresh provenance SHA-256:', sha(provenance_data['fresh-a']))
print('largest atlas:', result['largest_atlas_bytes'], 'bytes / 1048576 bytes')
print('source-sha mutation:', json.dumps(result['source_sha_mutation_rejection'],sort_keys=True))
