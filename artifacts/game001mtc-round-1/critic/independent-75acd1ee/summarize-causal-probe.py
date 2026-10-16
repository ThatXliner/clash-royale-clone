import hashlib
import json
from pathlib import Path

root = Path('/private/tmp/game001mtc-critic.0m4ONi/evidence/attempt-causal-probe')
data = json.loads((root / 'probe-data.json').read_text())
old = data['historical']
new = data['current']

def canonical_bytes(value):
    return len(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))

def path_diffs(left, right, path='$'):
    if type(left) is not type(right):
        return [{'path': path, 'old': left, 'current': right}]
    if isinstance(left, dict):
        out = []
        for key in sorted(set(left) | set(right)):
            if key not in left:
                out.append({'path': f'{path}.{key}', 'old': None, 'current': right[key]})
            elif key not in right:
                out.append({'path': f'{path}.{key}', 'old': left[key], 'current': None})
            else:
                out.extend(path_diffs(left[key], right[key], f'{path}.{key}'))
        return out
    if isinstance(left, list):
        out = []
        for index in range(max(len(left), len(right))):
            if index >= len(left):
                out.append({'path': f'{path}[{index}]', 'old': None, 'current': right[index]})
            elif index >= len(right):
                out.append({'path': f'{path}[{index}]', 'old': left[index], 'current': None})
            else:
                out.extend(path_diffs(left[index], right[index], f'{path}[{index}]'))
        return out
    return [] if left == right else [{'path': path, 'old': left, 'current': right}]

old_witness = old['witness']['parsed']
new_witness = new['witness']['parsed']
old_q = {item['key']: item for item in old_witness['questions']}
new_q = {item['key']: item for item in new_witness['questions']}
added_keys = sorted(set(new_q) - set(old_q))
removed_keys = sorted(set(old_q) - set(new_q))
changed_keys = sorted(key for key in set(old_q) & set(new_q) if old_q[key] != new_q[key])
old_roster = {item['id']: item for item in old_witness['roster']}
new_roster = {item['id']: item for item in new_witness['roster']}
roster_diffs = []
for card_id in sorted(set(old_roster) | set(new_roster)):
    if card_id not in old_roster or card_id not in new_roster or old_roster[card_id] != new_roster[card_id]:
        roster_diffs.append({
            'cardId': card_id,
            'fieldDiffs': path_diffs(old_roster.get(card_id), new_roster.get(card_id), f'$.roster[{card_id}]'),
        })

checks = []
for kind in ['ordinary', 'profiled']:
    for tick in [120, 200, 320]:
        old_capture = old['captures'][kind][str(tick)]
        new_capture = new['captures'][kind][str(tick)]
        comparison = data['comparison']['comparisons'][kind][str(tick)]
        counts = {}
        for event in new_capture['events']:
            counts[event['type']] = counts.get(event['type'], 0) + 1
        units = []
        for unit in new_capture['state'].get('units', []):
            movement = unit.get('movement') or {}
            units.append({
                'id': unit.get('id'), 'cardId': unit.get('cardId'), 'side': unit.get('side'),
                'alive': unit.get('alive'), 'hitpoints': unit.get('hitpoints'),
                'position': unit.get('position'), 'movementMode': movement.get('mode'),
                'target': movement.get('target'),
            })
        scheduled = [event for event in new_capture['events'] if event.get('type') == 'deploy-scheduled']
        checks.append({
            'kind': kind,
            'tick': tick,
            'historicalVsCurrent': {
                'stateEqual': comparison['stateEqual'],
                'stateDiffCount': len(comparison['stateDiff']),
                'fullPublicEventsEqual': comparison['fullEventsEqual'],
                'fullPublicEventsDiffCount': len(comparison['fullEventsDiff']),
                'fullReplayEqual': comparison['replayEqual'],
                'snapshotEqualAfterRemovingOnlyTopLevelSetup': comparison['snapshotEqualAfterRemovingOnlySetup'],
                'snapshotRemainingFieldDiffCount': len(comparison['snapshotWithoutSetupDiff']),
            },
            'snapshot': {
                'historicalBytes': len(old_capture['snapshotText'].encode('utf-8')),
                'currentBytes': len(new_capture['snapshotText'].encode('utf-8')),
                'byteDelta': len(new_capture['snapshotText'].encode('utf-8')) - len(old_capture['snapshotText'].encode('utf-8')),
                'historicalSha256': hashlib.sha256(old_capture['snapshotText'].encode('utf-8')).hexdigest(),
                'currentSha256': hashlib.sha256(new_capture['snapshotText'].encode('utf-8')).hexdigest(),
                'setupFieldPresent': {'historical': old_capture['setupPresent'], 'current': new_capture['setupPresent']},
            },
            'publicEventCount': len(new_capture['events']),
            'publicEventTypeCounts': dict(sorted(counts.items())),
            'scheduledDeploymentReceipts': scheduled,
            'units': units,
        })

old_120 = old['captures']['ordinary']['120']['snapshotText']
new_120 = new['captures']['ordinary']['120']['snapshotText']
old_200 = old['captures']['ordinary']['200']['snapshotText']
new_200 = new['captures']['ordinary']['200']['snapshotText']
old120_sha = hashlib.sha256(old_120.encode('utf-8')).hexdigest()
new120_sha = hashlib.sha256(new_120.encode('utf-8')).hexdigest()
old200_sha = hashlib.sha256(old_200.encode('utf-8')).hexdigest()
new200_sha = hashlib.sha256(new_200.encode('utf-8')).hexdigest()

report = {
    'method': data['method'],
    'witness': {
        'historical': {
            'serializedBytes': old['witness']['byteLength'], 'sha256': old['witness']['sha256'],
            'rosterBytes': old['witness']['rosterBytes'], 'questionBytes': old['witness']['questionBytes'],
            'questionCount': old['witness']['questionCount'],
        },
        'current': {
            'serializedBytes': new['witness']['byteLength'], 'sha256': new['witness']['sha256'],
            'rosterBytes': new['witness']['rosterBytes'], 'questionBytes': new['witness']['questionBytes'],
            'questionCount': new['witness']['questionCount'],
        },
        'delta': {
            'serializedBytes': new['witness']['byteLength'] - old['witness']['byteLength'],
            'rosterBytes': new['witness']['rosterBytes'] - old['witness']['rosterBytes'],
            'questionBytes': new['witness']['questionBytes'] - old['witness']['questionBytes'],
            'questionRecords': new['witness']['questionCount'] - old['witness']['questionCount'],
        },
        'addedQuestionRecords': [new_q[key] for key in added_keys],
        'removedQuestionKeys': removed_keys,
        'sameKeyQuestionValueChanges': [{'key': key, 'old': old_q[key], 'current': new_q[key]} for key in changed_keys],
        'changedRosterCards': roster_diffs,
    },
    'goldenPins': {
        'tick120': {
            'historicalExpectedBytes': 417386,
            'historicalActualBytes': len(old_120.encode('utf-8')),
            'historicalExpectedSha256': '0263778593d12c500721bb3914123269940e3e702ae5fc841f93613d2c2d0cb5',
            'historicalActualSha256': old120_sha,
            'historicalMatches': len(old_120.encode('utf-8')) == 417386 and old120_sha == '0263778593d12c500721bb3914123269940e3e702ae5fc841f93613d2c2d0cb5',
            'candidateExpectedBytes': 423499,
            'candidateActualBytes': len(new_120.encode('utf-8')),
            'candidateExpectedSha256': '538f8a87fe8478881ffd035bf6ddf30972c9a5daa4f5420f46bfea20d002cf5b',
            'candidateActualSha256': new120_sha,
            'candidateMatches': len(new_120.encode('utf-8')) == 423499 and new120_sha == '538f8a87fe8478881ffd035bf6ddf30972c9a5daa4f5420f46bfea20d002cf5b',
        },
        'tick200': {
            'historicalExpectedSha256': '07525d6e712c40fe9c9bb473f173ae7604f224a04f67eef12c0a0d3fc319d02d',
            'historicalActualSha256': old200_sha,
            'historicalMatches': old200_sha == '07525d6e712c40fe9c9bb473f173ae7604f224a04f67eef12c0a0d3fc319d02d',
            'candidateExpectedSha256': '63c23019fc6aadaedb47a72a79a24dae266970a281eb8aca8978d008b6f80996',
            'candidateActualSha256': new200_sha,
            'candidateMatches': new200_sha == '63c23019fc6aadaedb47a72a79a24dae266970a281eb8aca8978d008b6f80996',
        },
    },
    'historicalVsCurrentComparisons': checks,
}
Path('/private/tmp/game001mtc-critic.0m4ONi/evidence/causal-differential-report.json').write_text(json.dumps(report, indent=2, ensure_ascii=False) + '\n')
print(json.dumps(report, indent=2, ensure_ascii=False))
