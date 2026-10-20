import csv, hashlib, pathlib, sys
root = pathlib.Path(sys.argv[1])
source = pathlib.Path(sys.argv[2])
target = pathlib.Path(sys.argv[3])
with source.open(newline="") as stream:
    reader = csv.DictReader(stream, delimiter="\t")
    fields = reader.fieldnames
    rows = list(reader)
for row in rows:
    if row["path"] == "src/ui/combat-art.js":
        data = (root / row["path"]).read_bytes()
        row["git_blob"] = hashlib.sha1(b"blob " + str(len(data)).encode() + bytes([0]) + data).hexdigest()
        row["sha256"] = hashlib.sha256(data).hexdigest()
        row["bytes"] = str(len(data))
        break
else:
    raise SystemExit("combat-art.js missing from source manifest")
with target.open("w", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=fields, delimiter="\t", lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
print("control manifest written; only src/ui/combat-art.js differs from positive manifest")
