from pathlib import Path
import hashlib, json, subprocess

packet = Path('/Users/me/.codex/clash-qualification/20261020-factory/frozen-r4-control-20261020T144338366262Z')
manifest = packet / 'SHA256SUMS'
rows = []
for line in manifest.read_text().splitlines():
    digest, name = line.split('  ', 1)
    p = packet / name
    assert p.is_file() and not p.is_symlink(), name
    assert packet.resolve() in p.resolve().parents, name
    assert hashlib.sha256(p.read_bytes()).hexdigest() == digest, name
    rows.append(name)
assert len(rows) == len(set(rows)) == 1580
assert set(rows) == {str(p.relative_to(packet)) for p in packet.rglob('*') if p.is_file() and p != manifest}
fixture_paths = [name for name in rows if 'node_modules' in Path(name).parts]
assert len(fixture_paths) == 28
for name in fixture_paths:
    assert '/tests/fixtures/shipping-isolation-guard/' in name, name
    relative = name[name.index('tests/fixtures/shipping-isolation-guard/'):]
    expected = subprocess.check_output(['git', 'show', '4a6e9f6171ae1042a03f7c8268863df9a97920e7:' + relative])
    assert (packet / name).read_bytes() == expected, name
for name in rows:
    assert '.git' not in Path(name).parts, name
receipt = {
    'packet': str(packet),
    'manifestSha256': hashlib.sha256(manifest.read_bytes()).hexdigest(),
    'payloadEntriesVerified': len(rows),
    'trackedFixtureCopiesVerifiedAgainstAcceptedGit': len(fixture_paths),
    'correction': 'Frozen README contains literal {accepted["direct_pid"]}; the actual accepted-control direct Node PID is 21296, as recorded in its original run metadata. Frozen bytes were preserved.',
    'scope': 'Integrity and fixture source identity verification, not a test pass or independent factory verdict.'
}
out = Path(__file__).with_name('frozen-packet-root-validation.json')
out.write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps(receipt))
