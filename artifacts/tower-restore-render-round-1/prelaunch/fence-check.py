import csv, hashlib, json, pathlib, sys
root, expected_source, expected_public, out = map(pathlib.Path, sys.argv[1:])
out.mkdir(parents=True, exist_ok=True)
tab, newline, nul = chr(9), chr(10), bytes([0])
def digest_rows(expected_path, output_name):
    with expected_path.open(newline='') as source:
        expected = list(csv.DictReader(source, delimiter=tab))
    actual=[]
    for row in expected:
        data=(root / row['path']).read_bytes()
        blob=hashlib.sha1(b'blob '+str(len(data)).encode()+nul+data).hexdigest()
        actual.append({'path':row['path'],'git_blob':blob,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
    for want, got in zip(expected, actual, strict=True):
        if any(want[key] != str(got[key]) for key in ('path','git_blob','sha256','bytes')):
            raise SystemExit(f"fence mismatch: {got['path']}")
    with (out / output_name).open('w', newline='') as target:
        writer=csv.DictWriter(target, fieldnames=['path','git_blob','sha256','bytes'], delimiter=tab, lineterminator=newline)
        writer.writeheader(); writer.writerows(actual)
    return len(actual)
counts={'source':digest_rows(expected_source,'source-hashes.tsv'),'public':digest_rows(expected_public,'public-assets.tsv')}
(out/'hash-check.json').write_text(json.dumps({'match':True,'counts':counts},indent=2)+newline)
print(json.dumps({'match':True,'counts':counts}))
