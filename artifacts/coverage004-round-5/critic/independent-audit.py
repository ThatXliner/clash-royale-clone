#!/usr/bin/env python3
import difflib
import hashlib
import json
import re
import subprocess
from collections import Counter
from pathlib import Path
from urllib.parse import unquote

candidate = Path('/private/tmp/coverage004-r5-builder')
review = Path('/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/coverage004-round-5/critic')
round4 = '8a320759e5fd096d8fb6d77ae92c3e117f8a17ae'
release_commit = 'bf1e6120196db8a2927ce6ae893812e4c9b1115d'


def git(*args):
    return subprocess.check_output(['git', '-C', str(candidate), *args])


def sha(data):
    return hashlib.sha256(data).hexdigest()


def parse_manifest(path):
    rows = []
    for line in path.read_text().splitlines():
        if not line:
            continue
        match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
        if not match:
            raise AssertionError(f'invalid manifest line: {line}')
        rows.append((match.group(2), match.group(1)))
    return rows


guide_path = candidate / 'docs/completion-inventory.md'
guide_bytes = guide_path.read_bytes()
guide = guide_bytes.decode()
freeze = json.loads((candidate / 'artifacts/coverage004-round-5/builder/candidate-freeze.json').read_text())
round4_freeze = json.loads((candidate / 'artifacts/coverage004-round-4/builder/candidate-freeze.json').read_text())
release = json.loads((candidate / 'artifacts/coverage004-round-4/builder/live-release-evidence.json').read_text())
workflow = json.loads((candidate / 'artifacts/coverage004-round-4/builder/github-workflow-38510398827.json').read_text())
receipt = json.loads((review / 'clean-archive.stdout.txt').read_text())
build_stdout = (candidate / 'artifacts/coverage004-round-5/builder/clean-archive-check.stdout.txt').read_bytes()
build_stderr = (candidate / 'artifacts/coverage004-round-5/builder/clean-archive-check.stderr.txt').read_bytes()
critic_stdout = (review / 'clean-archive.stdout.txt').read_bytes()
critic_stderr = (review / 'clean-archive.stderr.txt').read_bytes()
exit_code = int((review / 'clean-archive.exit-code.txt').read_text().strip())

old_guide = git('show', f'{round4}:docs/completion-inventory.md').decode().splitlines()
new_guide = guide.splitlines()
changed_guide_lines = [
    {'line': i, 'before': old, 'after': new}
    for i, (old, new) in enumerate(zip(old_guide, new_guide), 1)
    if old != new
]
if len(old_guide) != len(new_guide):
    raise AssertionError('guide line count changed')

links = []
for match in re.finditer(r'\[[^\]]+\]\(([^)]+)\)', guide):
    target = match.group(1)
    if re.match(r'^https?://', target, re.I):
        continue
    target = unquote(target.split('#', 1)[0])
    if target:
        links.append(target)
missing_links = [target for target in links if not (guide_path.parent / target).exists()]

receipt_text = guide.split('The [captured live-release receipt]', 1)[1].split('The current portrait source', 1)[0]
receipt_field_claim = all(x in receipt_text for x in [
    'requested and final URL', 'HTTP status', 'selected response headers',
    'byte length', 'SHA-256', 'capture timestamp', 'landing-page full-commit check',
])
old_overclaim = 'response times' in git('show', f'{round4}:docs/completion-inventory.md').decode().lower()
no_duration_words_in_guide = not re.search(r'response\s+times?|duration|elapsed time|latency', guide, re.I)
endpoint_keys = {name: sorted(value.keys()) for name, value in release['live'].items()}
for endpoint in release['live'].values():
    assert {'url', 'finalUrl', 'status', 'headers', 'bytes', 'sha256'} <= endpoint.keys()
assert release['live']['landing'].get('containsFullReleaseCommit') is True
assert set(release.keys()) >= {'capturedAtUtc', 'release', 'live', 'checks'}
serialized_receipt_keys = json.dumps(release).lower()
no_elapsed_receipt_field = not re.search(r'"(?:response.?time|duration|elapsed|latency)[^"]*"\s*:', serialized_receipt_keys)
capture_script = (candidate / 'artifacts/coverage004-round-4/builder/capture-live-release.mjs').read_text()
no_duration_measure_in_capture_script = not any(token in capture_script for token in ['performance.now(', 'Date.now(', 'responseTime', 'elapsedMilliseconds', 'durationMilliseconds'])

prior_manifest_path = candidate / 'artifacts/coverage004-round-4/builder/preserved-prior-evidence.sha256'
prior_rows = parse_manifest(prior_manifest_path)
prior_checked = []
for path, expected in prior_rows:
    data = (candidate / path).read_bytes()
    baseline_data = git('show', f'{round4}:{path}')
    prior_checked.append({'path': path, 'matchesManifest': sha(data) == expected, 'matchesRound4Candidate': data == baseline_data})

round4_manifest = candidate / 'artifacts/coverage004-round-5/builder/round4-builder-preservation.sha256'
round4_rows = parse_manifest(round4_manifest)
round4_checked = []
for path, expected in round4_rows:
    data = (candidate / path).read_bytes()
    baseline_data = git('show', f'{round4}:{path}')
    round4_checked.append({'path': path, 'matchesManifest': sha(data) == expected, 'matchesOriginalRound4Candidate': data == baseline_data})

mapping = json.loads((candidate / 'artifacts/completion-inventory-current-18/card-coverage-109-current-18.json').read_text())
corpus = json.loads((candidate / 'reference/stats/cards.json').read_text())
historical_type_counts = dict(sorted(Counter(row['type'] for row in corpus['cards']).items()))
actual_source_tree = git('rev-parse', f'{release_commit}^{{tree}}').decode().strip()
source_changes = git('diff', '--name-only', f'{release_commit}..HEAD', '--', 'src', 'dist', 'public', 'reference/stats').decode().splitlines()
product_changes_from_accepted_root = git('diff', '--name-only', freeze['base']['acceptedRootDocsCommit'] + '..HEAD', '--', 'src', 'dist', 'public', 'tests', 'package.json').decode().splitlines()

comparison = json.loads((candidate / 'artifacts/cards-expansion-round-4/core-critic/default8-comparison.json').read_text())
endurance = json.loads((candidate / 'artifacts/game001gpr6-round-1/critic/full-browser-evidence.json').read_text())
review_plan = (candidate / 'PLAN.md').read_text()
review_rounds = (candidate / 'rounds.md').read_text()
i_verdict = (candidate / 'artifacts/cards019i-round-1/critic/verdict.txt').read_text()
h1_verdict = (candidate / 'artifacts/cards019h1-round-1/critic/verdict.md').read_text()
d_verdict = (candidate / 'artifacts/cards019d-round-2/critic/verdict.md').read_text()
app_tap = (candidate / 'artifacts/app004g-round-1/critic/candidate-app-polish.tap').read_text()
source_ledger = (candidate / 'reference/stats/SOURCES.md').read_text()

result = {
    'candidate': {
        'commit': git('rev-parse', 'HEAD').decode().strip(),
        'cleanWorktree': not bool(git('status', '--porcelain').decode().strip()),
        'guideSha256': sha(guide_bytes),
        'guideShaMatchesCleanArchiveReceipt': sha(guide_bytes) == receipt['guide']['sha256'],
        'guideChangedLinesFromOriginalRound4': changed_guide_lines,
        'guideCorrectionOnlyLine42': len(changed_guide_lines) == 1 and changed_guide_lines[0]['line'] == 42,
    },
    'receiptWording': {
        'priorGuideClaimedResponseTimes': old_overclaim,
        'currentGuideClaimsRecordedFields': receipt_field_claim,
        'currentGuideHasNoDurationClaim': no_duration_words_in_guide,
        'liveEndpointKeys': endpoint_keys,
        'captureTimestampUtc': release['capturedAtUtc'],
        'receiptHasNoElapsedOrDurationField': no_elapsed_receipt_field,
        'captureScriptMeasuresNoElapsedDuration': no_duration_measure_in_capture_script,
    },
    'cleanArchiveChecker': {
        'exitCode': exit_code,
        'stdoutBytes': len(critic_stdout),
        'stdoutSha256': sha(critic_stdout),
        'stderrBytes': len(critic_stderr),
        'stderrSha256': sha(critic_stderr),
        'stdoutByteMatchesCommittedBuilderLog': critic_stdout == build_stdout,
        'stderrByteMatchesCommittedBuilderLog': critic_stderr == build_stderr,
        'receipt': receipt,
    },
    'localMarkdownLinks': {
        'checked': len(links),
        'missing': missing_links,
    },
    'versionedCounts': {
        'historicalCorpusRows': len(corpus['cards']),
        'historicalCorpusTypes': historical_type_counts,
        'frozenMapRows': len(mapping['historicalRows']),
        'frozenMapTypes': mapping['counts']['historicalTypes'],
        'frozenMapSourceCommit': mapping['pinnedInputs']['sourceCommit'],
        'frozenEditableIds': len(mapping['currentEditableCards']),
        'fullHistoricalExecutions': mapping['counts']['fullHistoricalCardExecutions'],
        'historicalParityClaims': mapping['counts']['historicalParityClaims'],
        'currentEditableTroops': receipt['currentCollection']['editableTroopIds'],
        'currentMixedChoices': receipt['currentCollection']['mixedCollectionChoices'],
        'currentDefaultDeck': receipt['currentCollection']['defaultDeckIds'],
        'sessionCardCatalog': receipt['generatedCatalogs']['sessionCards'],
        'sessionTroopProfileCatalog': receipt['generatedCatalogs']['troopProfiles'],
    },
    'reviewStatusEvidence': {
        'h1VerdictPass': 'Verdict: PASS for the bounded H1 source-flag and shared-host target-following bar.' in h1_verdict,
        'h1Round439Recorded': 'R439 PASS' in (candidate / 'progress.html').read_text(),
        'h2QuestionInPlan': bool(re.search(r'\| CARDS-019H2 \|[^\n]*\| QUESTION \|', review_plan)),
        'cards019dVerdictPass': 'VERDICT: PASS' in d_verdict and ('CARDS019D' in d_verdict or 'CARDS-019D' in d_verdict),
        'cards019dRound443Recorded': 'R443 PASS' in (candidate / 'progress.html').read_text(),
        'app004gPassInPlan': bool(re.search(r'\| APP-004G \|[^\n]*\| PASS \|', review_plan)),
        'app004gRound444Recorded': 'R444 PASS' in (candidate / 'progress.html').read_text(),
        'app004gTapOnePass': '# tests 1' in app_tap and '# pass 1' in app_tap and '# fail 0' in app_tap,
        'cards019iCandidateUnaccepted': 'VERDICT: FAIL' in i_verdict and '32c31da5269391cc0f6766cfacc0c78f0982fa5d' in i_verdict,
        'cards019iRound445FailRecorded': 'R445 FAIL' in (candidate / 'progress.html').read_text(),
    },
    'defaultEightAndEndurance': {
        'baselineCommit': comparison['baselineCommit'],
        'reviewedCommit': comparison['reviewedCommit'],
        'exactSnapshotCount': len(comparison['snapshots']),
        'snapshotSeedTicks': [{'seed': s['seed'], 'tick': s['tick'], 'exact': s['exact']} for s in comparison['snapshots']],
        'enduranceCandidate': endurance['candidateCommit'],
        'enduranceSeed': endurance['result']['seed'],
        'enduranceDeckSize': endurance['result']['deckSize'],
        'enduranceTicks': endurance['result']['terminalTick'],
        'enduranceSegments': endurance['result']['segments'],
        'enduranceCapsMs': endurance['result']['longTaskCapsMilliseconds'],
        'pauseResumeTranscriptCounts': {k: endurance['result']['serializedTranscriptEventCountsAtTerminal'][k] for k in ['pause', 'resume']},
        'guideStatesEnduranceDoesNotApplyToBf1': 'does not establish endurance for the current `bf1e612` runtime' in guide,
    },
    'releaseSnapshot': {
        'sourceCommit': release['release']['commit'],
        'sourceTreeAtCommit': actual_source_tree,
        'treeMatchesRound4Freeze': actual_source_tree == round4_freeze['sourceSnapshot']['tree'],
        'acceptedRootDocsTreeMatchesFreeze': git('rev-parse', freeze['base']['acceptedRootDocsCommit'] + '^{tree}').decode().strip() == freeze['base']['acceptedRootDocsTree'],
        'noSourceOrReleaseProductPathsChangedAfterBf1': source_changes,
        'workflowRunId': workflow['databaseId'],
        'workflowHeadSha': workflow['headSha'],
        'workflowCompletedSuccessful': workflow['status'] == 'completed' and workflow['conclusion'] == 'success' and all(j['status'] == 'completed' and j['conclusion'] == 'success' for j in workflow['jobs']),
        'liveStatuses': {k: v['status'] for k, v in release['live'].items()},
        'portraitBytes': release['live']['kilnkeeperPortrait']['bytes'],
        'portraitSha256': release['live']['kilnkeeperPortrait']['sha256'],
        'portraitMatchesSourceBytes': release['live']['kilnkeeperPortrait']['sha256'] == sha((candidate / 'public/assets/kilnkeeper-portrait-painted.webp').read_bytes()),
    },
    'preservation': {
        'round4BuilderFiles': len(round4_checked),
        'round4BuilderMismatchesVsManifest': [x['path'] for x in round4_checked if not x['matchesManifest']],
        'round4BuilderMismatchesVsOriginalCandidate8a': [x['path'] for x in round4_checked if not x['matchesOriginalRound4Candidate']],
        'olderGuideEvidenceFiles': len(prior_checked),
        'olderGuideEvidenceMismatchesVsManifest': [x['path'] for x in prior_checked if not x['matchesManifest']],
        'olderGuideEvidenceMismatchesVsOriginalCandidate8a': [x['path'] for x in prior_checked if not x['matchesRound4Candidate']],
    },
    'scope': {
        'productChangesSinceAcceptedRootDocsCommit': product_changes_from_accepted_root,
        'guideCandidateOwnedFiles': (candidate / 'artifacts/coverage004-round-5/builder/candidate-owned-files.txt').read_text().splitlines(),
        'round5CandidateCommitPaths': git('diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD').decode().splitlines(),
    },
    'sourceLedger': {
        'saysHistoricalReconstruction': 'historical reconstruction' in source_ledger.lower(),
        'lowConfidenceFieldsExplicitlyUnverified': 'unverified_fields' in source_ledger and 'Confidence' in source_ledger,
        'statesNullIsNotUnverifiedNumericClaim': 'Null values are “not applicable/not safely expressible,” not unverified numeric claims.' in source_ledger,
    },
}

# Assertions keep this receipt decisive and fail closed if any requested audit boundary changes.
assert result['candidate']['commit'] == '124c0b322efd6252a9d2bf6e5f891e4e3e7ff661'
assert result['candidate']['cleanWorktree']
assert result['candidate']['guideCorrectionOnlyLine42'] and result['candidate']['guideShaMatchesCleanArchiveReceipt']
assert result['receiptWording']['priorGuideClaimedResponseTimes']
assert result['receiptWording']['currentGuideClaimsRecordedFields']
assert result['receiptWording']['currentGuideHasNoDurationClaim']
assert result['receiptWording']['receiptHasNoElapsedOrDurationField']
assert result['receiptWording']['captureScriptMeasuresNoElapsedDuration']
assert exit_code == 0 and critic_stdout == build_stdout and critic_stderr == build_stderr
assert len(links) == 23 and not missing_links
assert result['versionedCounts']['historicalCorpusRows'] == 109
assert result['versionedCounts']['historicalCorpusTypes'] == {'building': 13, 'spell': 18, 'troop': 78}
assert result['versionedCounts']['frozenMapRows'] == 109 and result['versionedCounts']['frozenMapTypes'] == {'building': 13, 'spell': 18, 'troop': 78}
assert result['versionedCounts']['frozenEditableIds'] == 18
assert result['versionedCounts']['fullHistoricalExecutions'] == 0 and result['versionedCounts']['historicalParityClaims'] == 0
assert (result['versionedCounts']['currentEditableTroops'], result['versionedCounts']['currentMixedChoices'], result['versionedCounts']['currentDefaultDeck']) == (18, 20, 8)
assert actual_source_tree == 'a306815db49583c41059dc19b37628aa5cb8c7a7'
assert result['releaseSnapshot']['acceptedRootDocsTreeMatchesFreeze']
assert not source_changes and not product_changes_from_accepted_root
assert result['preservation']['round4BuilderFiles'] == 10 and not result['preservation']['round4BuilderMismatchesVsManifest'] and not result['preservation']['round4BuilderMismatchesVsOriginalCandidate8a']
assert result['preservation']['olderGuideEvidenceFiles'] == 43 and not result['preservation']['olderGuideEvidenceMismatchesVsManifest'] and not result['preservation']['olderGuideEvidenceMismatchesVsOriginalCandidate8a']
assert result['releaseSnapshot']['workflowRunId'] == 38510398827 and result['releaseSnapshot']['workflowHeadSha'] == release_commit and result['releaseSnapshot']['workflowCompletedSuccessful']
assert result['releaseSnapshot']['liveStatuses'] == {'landing': 200, 'game': 200, 'kilnkeeperPortrait': 200}
assert result['releaseSnapshot']['portraitMatchesSourceBytes']
assert all(result['reviewStatusEvidence'].values()), json.dumps(result['reviewStatusEvidence'])
assert result['defaultEightAndEndurance']['baselineCommit'].startswith('6dcf64b8')
assert result['defaultEightAndEndurance']['reviewedCommit'].startswith('e3413fdc')
assert result['defaultEightAndEndurance']['exactSnapshotCount'] == 6
assert result['defaultEightAndEndurance']['enduranceCandidate'] == '9f64011378d3ce1c6281d9292950a7b52f11fd2c'
assert result['defaultEightAndEndurance']['enduranceDeckSize'] == 8
assert result['defaultEightAndEndurance']['enduranceTicks'] == 18000 and result['defaultEightAndEndurance']['enduranceSegments'] == 67
assert result['defaultEightAndEndurance']['guideStatesEnduranceDoesNotApplyToBf1']
assert all(result['sourceLedger'].values())

(review / 'independent-audit.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({
    'candidate': result['candidate'],
    'cleanArchiveChecker': {k:v for k,v in result['cleanArchiveChecker'].items() if k != 'receipt'},
    'localMarkdownLinks': result['localMarkdownLinks'],
    'versionedCounts': result['versionedCounts'],
    'releaseSnapshot': result['releaseSnapshot'],
    'preservation': result['preservation'],
    'reviewStatusEvidence': result['reviewStatusEvidence'],
    'sourceLedger': result['sourceLedger'],
}, indent=2))
