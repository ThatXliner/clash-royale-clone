#!/usr/bin/env python3
"""Independent, read-only audit of the frozen Pages verification note."""

from __future__ import annotations

import hashlib
import json
import posixpath
import re
import subprocess
import sys
from datetime import datetime, timezone
from html import unescape
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen


ROOT = "https://bryanhu.com/clash-royale-clone/"
REPOSITORY = "ThatXliner/clash-royale-clone"
API_ROOT = f"https://api.github.com/repos/{REPOSITORY}"
DOC_REV = "3af5418b234e262ac93e2917b1173b6991ba23cb"
RELEASE = "ae4a63e4bc544a8c195fc24abd5f6d17801cd1d4"
ENDURANCE = "796708ef622a0292cdd71fa4cf0a81c9af48b3b1"
LOCAL_CANDIDATE = "c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb"
WORKFLOW_RUN = 38431846142
ENDURANCE_DIR = "artifacts/game001gpr4-round-1/critic"


def git(*args: str, text: bool = True) -> str | bytes:
    result = subprocess.run(
        ["git", *args], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE
    )
    return result.stdout.decode() if text else result.stdout


def committed_file(revision: str, path: str) -> bytes:
    return git("show", f"{revision}:{path}", text=False)  # type: ignore[return-value]


def http_get(url: str) -> tuple[int, dict[str, str], bytes, str]:
    request = Request(url, headers={"User-Agent": "ship-current-round-2-critic/1.0"})
    try:
        with urlopen(request, timeout=30) as response:
            return (
                response.status,
                {key.lower(): value for key, value in response.headers.items()},
                response.read(),
                response.url,
            )
    except HTTPError as error:
        return (
            error.code,
            {key.lower(): value for key, value in error.headers.items()},
            error.read(),
            error.url,
        )


def api_json(path: str) -> dict | list:
    status, _headers, body, _url = http_get(f"{API_ROOT}/{path}")
    if status != 200:
        raise RuntimeError(f"GitHub API {path} returned HTTP {status}: {body[:200]!r}")
    return json.loads(body)


def check(report: dict, key: str, passed: bool, detail: object) -> None:
    report["checks"][key] = {"pass": bool(passed), "detail": detail}
    if not passed:
        report["failures"].append(key)


def ancestor(first: str, second: str) -> bool:
    result = subprocess.run(
        ["git", "merge-base", "--is-ancestor", first, second],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    if result.returncode not in (0, 1):
        raise RuntimeError(f"git merge-base failed: {first} -> {second}")
    return result.returncode == 0


def changed_paths(first: str, second: str, *paths: str) -> list[str]:
    output = git("diff", "--name-only", first, second, "--", *paths)
    return [line for line in output.splitlines() if line]


def frozen_string_array(source: str, name: str) -> list[str]:
    match = re.search(
        rf"\b{re.escape(name)}\s*=\s*Object\.freeze\(\[(.*?)\]\);",
        source,
        re.S,
    )
    if match is None:
        raise RuntimeError(f"could not parse frozen array {name}")
    return re.findall(r'"([^"\n]+)"', match.group(1))


CF_BEACON = re.compile(
    rb'  <script type="module" src="https://static\.cloudflareinsights\.com/beacon\.min\.js/[^\"]+" '
    rb'integrity="[^\"]+" data-cf-beacon=\'[^\']*\' crossorigin="anonymous"></script>\n</body>'
)


def remove_cf_beacon(body: bytes) -> tuple[bytes, int]:
    return CF_BEACON.subn(b"  </body>", body)


report: dict = {
    "checkedAtUtc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    "frozenDocument": {"revision": DOC_REV, "path": "docs/verification.md"},
    "releaseCommit": RELEASE,
    "enduranceCommit": ENDURANCE,
    "localCandidateCommit": LOCAL_CANDIDATE,
    "checks": {},
    "failures": [],
}

# Verify origin/main independently through Git's remote ref query and GitHub's API.
origin_line = git("ls-remote", "origin", "refs/heads/main").strip()
origin_sha = origin_line.split()[0] if origin_line else None
branch = api_json("branches/main")
branch_sha = branch["commit"]["sha"]
check(
    report,
    "origin-main",
    origin_sha == RELEASE and branch_sha == RELEASE,
    {"gitLsRemote": origin_sha, "githubApi": branch_sha, "branch": branch["name"]},
)

# Verify the named Pages run, both jobs, the Pages configuration, and latest deployment.
workflow = api_json(f"actions/runs/{WORKFLOW_RUN}")
jobs_payload = api_json(f"actions/runs/{WORKFLOW_RUN}/jobs?filter=latest")
jobs = jobs_payload["jobs"]
job_summary = [
    {
        "name": job["name"],
        "status": job["status"],
        "conclusion": job["conclusion"],
        "steps": [
            {"name": step["name"], "conclusion": step["conclusion"]}
            for step in job["steps"]
            if step["name"] in {
                "Verify shipping isolation rules",
                "Verify the release artifact builder",
                "Verify the Pages artifact",
                "Build the project-subpath artifact",
                "Upload Pages artifact",
                "Publish the manually requested Pages artifact",
            }
        ],
    }
    for job in jobs
]
gh_pages_result = subprocess.run(
    ["gh", "api", f"repos/{REPOSITORY}/pages"],
    check=True,
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE,
    text=True,
)
pages_config = json.loads(gh_pages_result.stdout)
deployments = api_json("deployments?environment=github-pages&per_page=10")
latest_deployment = max(deployments, key=lambda item: item["created_at"])
statuses = api_json(f"deployments/{latest_deployment['id']}/statuses")
latest_status = statuses[0]
check(
    report,
    "pages-publication",
    workflow["status"] == "completed"
    and workflow["conclusion"] == "success"
    and workflow["head_branch"] == "main"
    and workflow["head_sha"] == RELEASE
    and len(job_summary) == 2
    and all(job["status"] == "completed" and job["conclusion"] == "success" for job in job_summary)
    and pages_config.get("build_type") == "workflow"
    and pages_config.get("source", {}).get("branch") == "main"
    and pages_config.get("source", {}).get("path") == "/"
    and latest_deployment["sha"] == RELEASE
    and latest_deployment["ref"] == "main"
    and latest_status["state"] == "success",
    {
        "run": {
            "id": workflow["id"],
            "status": workflow["status"],
            "conclusion": workflow["conclusion"],
            "headBranch": workflow["head_branch"],
            "headSha": workflow["head_sha"],
            "htmlUrl": workflow["html_url"],
        },
        "jobs": job_summary,
        "pagesApi": {
            "htmlUrl": pages_config.get("html_url"),
            "buildType": pages_config.get("build_type"),
            "source": pages_config.get("source"),
        },
        "latestDeployment": {
            "id": latest_deployment["id"],
            "sha": latest_deployment["sha"],
            "ref": latest_deployment["ref"],
            "environment": latest_deployment["environment"],
            "state": latest_status["state"],
            "environmentUrl": latest_status.get("environment_url"),
            "targetUrl": latest_status.get("target_url"),
        },
    },
)

# Compare the two commits through GitHub and local Git. Include build inputs as well as runtime.
comparison = api_json(
    f"compare/{ENDURANCE}...{RELEASE}"
)
comparison_paths = [item["filename"] for item in comparison["files"]]
runtime_paths = [
    path for path in comparison_paths
    if path.startswith(("src/", "public/", "demo/"))
]
build_paths = [
    path for path in comparison_paths
    if path.startswith("scripts/") or path in {"package.json", "package-lock.json"}
]
local_runtime_and_build_diff = changed_paths(
    ENDURANCE,
    RELEASE,
    "src",
    "public",
    "demo",
    "scripts",
    "package.json",
    "package-lock.json",
)
release_has_endurance = ancestor(ENDURANCE, RELEASE)
candidate_in_release = ancestor(LOCAL_CANDIDATE, RELEASE)
candidate_in_endurance = ancestor(LOCAL_CANDIDATE, ENDURANCE)
check(
    report,
    "runtime-and-build-diff",
    comparison["base_commit"]["sha"] == ENDURANCE
    and comparison["ahead_by"] == 10
    and comparison["total_commits"] == 10
    and not runtime_paths
    and not build_paths
    and not local_runtime_and_build_diff
    and release_has_endurance
    and not candidate_in_release
    and not candidate_in_endurance,
    {
        "githubCompare": {
            "status": comparison["status"],
            "aheadBy": comparison["ahead_by"],
            "totalCommits": comparison["total_commits"],
            "changedPathCount": len(comparison_paths),
            "runtimePaths": runtime_paths,
            "buildPaths": build_paths,
        },
        "localDiffRuntimeAndBuildPaths": local_runtime_and_build_diff,
        "enduranceIsAncestorOfRelease": release_has_endurance,
        "localCandidateIsAncestorOfRelease": candidate_in_release,
        "localCandidateIsAncestorOfEndurance": candidate_in_endurance,
    },
)

# Confirm the local candidate adds five further squad identities, including default Briar Band.
candidate_parent = git("rev-parse", f"{LOCAL_CANDIDATE}^").strip()
candidate_claim_diff = git(
    "diff", "--no-ext-diff", ENDURANCE, LOCAL_CANDIDATE,
    "--", "src/shared/session-troop-source-confidence-authority.js"
)
candidate_claim_rows = re.findall(
    r'^\+\s*Object\.freeze\(\{\s*cardId:\s*"([^"]+)",\s*archetypeId:\s*"([^"]+)"\s*\}\),?',
    candidate_claim_diff,
    re.M,
)
candidate_cards = sorted({card_id for card_id, _archetype in candidate_claim_rows})
candidate_kernel = git(
    "show", f"{LOCAL_CANDIDATE}:src/sim/battle-continuation-kernel.js"
)
expected_candidate_cards = [
    "briar-band",
    "duskwing-trio",
    "forgeguard",
    "sunthread-pair",
    "thornscouts",
]
check(
    report,
    "local-c981-exclusion",
    candidate_cards == expected_candidate_cards
    and "entity.id-this.#nextEntityId" in candidate_kernel
    and not candidate_in_release
    and not candidate_in_endurance,
    {
        "candidateParent": candidate_parent,
        "newSquadCardIdsComparedWithEndurance": candidate_cards,
        "includesDefaultBriarBand": "briar-band" in candidate_cards,
        "candidateChangesSpawnScheduling": "entity.id-this.#nextEntityId" in candidate_kernel,
        "candidateInRelease": candidate_in_release,
        "candidateInEndurance": candidate_in_endurance,
    },
)

# Read the actual committed endurance artifacts, not the builder's summary.
verdict_path = f"{ENDURANCE_DIR}/verdict.md"
receipt_path = f"{ENDURANCE_DIR}/run-receipt.json"
result_path = f"{ENDURANCE_DIR}/endurance-result.json"
tap_path = f"{ENDURANCE_DIR}/full-endurance.tap"
endurance_verdict = committed_file(DOC_REV, verdict_path).decode()
endurance_receipt = json.loads(committed_file(DOC_REV, receipt_path))
endurance_result = json.loads(committed_file(DOC_REV, result_path))
endurance_tap = committed_file(DOC_REV, tap_path).decode()
telemetry = endurance_receipt["measuredTelemetry"]
noninitial_counts = telemetry["nonInitializationLongTaskCounts"]
tap_pass = int(re.search(r"^# pass (\d+)$", endurance_tap, re.M).group(1))
tap_fail = int(re.search(r"^# fail (\d+)$", endurance_tap, re.M).group(1))
tap_durations = [
    float(value) for value in re.findall(r"duration_ms:\s*([0-9.]+)", endurance_tap)
]
tap_workload_ms = max(tap_durations)
scope_is_explicit = (
    "seed-zero workload on the default eight-card deck" in endurance_verdict
    and "not every possible deck/command combination" in endurance_verdict
    and "no claim about those workloads" in endurance_verdict
)
check(
    report,
    "retained-endurance-evidence",
    endurance_receipt["candidate"]["commit"] == ENDURANCE
    and tap_pass == 2
    and tap_fail == 0
    and abs(tap_workload_ms - 811580.134083) < 0.001
    and telemetry["finalTick"] == 18000
    and telemetry["capsMilliseconds"]["initialization"] == 300
    and telemetry["capsMilliseconds"]["allOtherLongTasks"] == 50
    and telemetry["maxInitializationLongTaskMilliseconds"] == 197
    and all(count == 0 for count in noninitial_counts.values())
    and endurance_result["durationMilliseconds"] == 811434
    and scope_is_explicit,
    {
        "candidateCommit": endurance_receipt["candidate"]["commit"],
        "tap": {
            "tests": endurance_receipt["tap"]["testCount"],
            "pass": tap_pass,
            "fail": tap_fail,
            "mainWorkloadMs": tap_workload_ms,
            "totalMs": endurance_receipt["tap"]["totalDurationMilliseconds"],
        },
        "telemetry": {
            "finalTick": telemetry["finalTick"],
            "initializationCapMs": telemetry["capsMilliseconds"]["initialization"],
            "maxInitializationLongTaskMs": telemetry["maxInitializationLongTaskMilliseconds"],
            "otherLongTaskCapMs": telemetry["capsMilliseconds"]["allOtherLongTasks"],
            "nonInitializationLongTaskCounts": noninitial_counts,
        },
        "explicitScope": scope_is_explicit,
    },
)

# Cross-check the earlier independent integration verdict named in the document.
air_integration_dir = "artifacts/cards016-integration-round-2/critic"
air_integration_verdict = committed_file(
    DOC_REV, f"{air_integration_dir}/verdict.md"
).decode()
air_integration_receipt = json.loads(
    committed_file(DOC_REV, f"{air_integration_dir}/receipt.json")
)
air_suite_totals = air_integration_receipt["testSuiteTotals"]
air_browser = air_integration_receipt["browser"]
air_verdict_claims = (
    "Coppershade launched a projectile at an airborne Coppershade" in air_integration_verdict
    and "restored and replayed exactly" in air_integration_verdict
)
check(
    report,
    "prior-air-swarm-independent-review",
    air_integration_receipt["candidateCommit"] == "a8c39bcc02329ba22b3fdd50be7d1089bc6010dc"
    and air_suite_totals["passed"] == 58
    and air_suite_totals["failed"] == 0
    and air_browser["availableEditableCards"] == 18
    and all(card in air_browser["selectedDeck"]
            for card in ("gloamwing-cluster", "coppershade-flock"))
    and air_verdict_claims,
    {
        "candidateCommit": air_integration_receipt["candidateCommit"],
        "suiteTotals": air_suite_totals,
        "browserAvailableEditableCards": air_browser["availableEditableCards"],
        "selectedDeckContainsBothSwarms": all(
            card in air_browser["selectedDeck"]
            for card in ("gloamwing-cluster", "coppershade-flock")
        ),
        "airborneProjectileAndRestoreReplayInCriticVerdict": air_verdict_claims,
    },
)

# Resolve every local Markdown link against the frozen document's Git tree.
doc_bytes = committed_file(DOC_REV, "docs/verification.md")
doc_text = doc_bytes.decode()
doc_blob = git("rev-parse", f"{DOC_REV}:docs/verification.md").strip()
local_links: list[dict[str, str]] = []
for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", doc_text):
    if "://" in target or target.startswith("#"):
        continue
    normalized = posixpath.normpath(posixpath.join("docs", target.split("#", 1)[0]))
    result = subprocess.run(
        ["git", "cat-file", "-e", f"{DOC_REV}:{normalized}"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    local_links.append({"target": target, "resolvedPath": normalized,
                        "result": "PASS" if result.returncode == 0 else "FAIL"})
check(
    report,
    "frozen-doc-local-links",
    len(local_links) == 8 and all(link["result"] == "PASS" for link in local_links),
    {"blob": doc_blob, "localLinkCount": len(local_links), "links": local_links},
)

# Fetch the actual HTTPS publication and parse the loaded app/runtime assets.
root_status, root_headers, root_body, root_final_url = http_get(ROOT)
game_url = urljoin(ROOT, "game/public/index.html")
game_status, game_headers, game_body, game_final_url = http_get(game_url)
manifest_url = urljoin(ROOT, "game/release-manifest.json")
manifest_status, manifest_headers, manifest_body, manifest_final_url = http_get(manifest_url)
root_without_beacon, root_beacon_count = remove_cf_beacon(root_body)
_game_without_beacon, game_beacon_count = remove_cf_beacon(game_body)
live_http_summary = {
    "root": {
        "status": root_status,
        "url": root_final_url,
        "bytes": len(root_body),
        "contentType": root_headers.get("content-type"),
        "lastModified": root_headers.get("last-modified"),
        "sha256": hashlib.sha256(root_body).hexdigest(),
        "cloudflareInsightsBeaconsRemovedForSourceCompare": root_beacon_count,
        "normalizedSha256": hashlib.sha256(root_without_beacon).hexdigest(),
    },
    "gameIndex": {
        "status": game_status,
        "url": game_final_url,
        "bytes": len(game_body),
        "contentType": game_headers.get("content-type"),
        "lastModified": game_headers.get("last-modified"),
        "sha256": hashlib.sha256(game_body).hexdigest(),
        "cloudflareInsightsBeaconsRemovedForSourceCompare": game_beacon_count,
    },
    "releaseManifest": {
        "status": manifest_status,
        "url": manifest_final_url,
        "bytes": len(manifest_body),
        "contentType": manifest_headers.get("content-type"),
        "sha256": hashlib.sha256(manifest_body).hexdigest(),
    },
}

# Render the committed landing template exactly as build-pages.js does and compare bytes.
landing_template = committed_file(RELEASE, "site/index.html")
rendered_landing = landing_template
landing_values = {
    b"@@REPOSITORY_URL@@": f"https://github.com/{REPOSITORY}".encode(),
    b"@@RL_SOURCE_URL@@": f"https://github.com/{REPOSITORY}/blob/{RELEASE}/src/rl/environment.js".encode(),
    b"@@RL_DOCS_URL@@": f"https://github.com/{REPOSITORY}/blob/{RELEASE}/docs/rl-api.md".encode(),
}
for token, value in landing_values.items():
    rendered_landing = rendered_landing.replace(token, value)
root_html = root_body.decode("utf-8")
root_play_target = re.search(
    r'<a\s+class="primary-nav__play"\s+href="([^"]+)"', root_html
)
root_has_release_link = RELEASE.encode() in root_body

game_html = game_body.decode("utf-8")
entry_match = re.search(r'<script[^>]+src=["\']([^"\']+)', game_html)
app_shell_url = urljoin(game_final_url, entry_match.group(1))
app_status, app_headers, app_body, app_final_url = http_get(app_shell_url)
app_source = app_body.decode("utf-8")
runtime_import = re.search(
    r'from\s*["\']([^"\']*game-runtime~public/index-[^"\']+\.js)["\']',
    app_source,
)
runtime_url = urljoin(app_final_url, runtime_import.group(1))
runtime_status, runtime_headers, runtime_body, runtime_final_url = http_get(runtime_url)
runtime_source = runtime_body.decode("utf-8")
roster_import = re.search(
    r'from\s*["\'](\./index~public/ui-arena-shell~src/rl/environment~src/ui/arena-shell-entry-[^"\']+\.js)["\']',
    runtime_source,
)
roster_url = urljoin(runtime_final_url, roster_import.group(1))
roster_status, roster_headers, roster_body, roster_final_url = http_get(roster_url)
roster_source = roster_body.decode("utf-8")
manifest = json.loads(manifest_body)
manifest_files = {file["path"]: file for file in manifest["files"]}

def manifest_entry(url: str) -> dict | None:
    game_path = urlsplit(url).path.split("/game/", 1)[-1]
    return manifest_files.get(game_path)


runtime_manifest = manifest_entry(runtime_final_url)
roster_manifest = manifest_entry(roster_final_url)
runtime_sha = hashlib.sha256(runtime_body).hexdigest()
roster_sha = hashlib.sha256(roster_body).hexdigest()

playable_ids = frozen_string_array(roster_source, "PLAYABLE_CARD_IDS")
editable_block_ids = frozen_string_array(roster_source, "EDITABLE_DECK_CARD_IDS")
mixed_block_ids = frozen_string_array(roster_source, "EDITABLE_MIXED_DECK_CARD_IDS")
additional_troop_ids = [item for item in editable_block_ids if item not in playable_ids]
choice_ids = [*playable_ids, *additional_troop_ids, *mixed_block_ids]
choice_ui_uses_roster = (
    "EDITABLE_MIXED_DECK_CARD_IDS" in runtime_source
    and "EDITABLE_MIXED_DECK_CARD_IDS.includes(cardId)" in runtime_source
    and "EDITABLE_MIXED_DECK_CARD_IDS.filter((id) => !currentDeckIds.includes(id))" in runtime_source
)
air_swarm_ids = ["gloamwing-cluster", "coppershade-flock"]
live_runtime_summary = {
    "appShell": {
        "status": app_status,
        "url": app_final_url,
        "bytes": len(app_body),
        "sha256": hashlib.sha256(app_body).hexdigest(),
    },
    "runtimeBundle": {
        "status": runtime_status,
        "url": runtime_final_url,
        "bytes": len(runtime_body),
        "sha256": runtime_sha,
        "manifestMatch": runtime_manifest is not None
        and runtime_manifest["size"] == len(runtime_body)
        and runtime_manifest["sha256"] == runtime_sha,
    },
    "rosterBundle": {
        "status": roster_status,
        "url": roster_final_url,
        "bytes": len(roster_body),
        "sha256": roster_sha,
        "manifestMatch": roster_manifest is not None
        and roster_manifest["size"] == len(roster_body)
        and roster_manifest["sha256"] == roster_sha,
    },
    "choices": {
        "playableBaseCount": len(playable_ids),
        "additionalTroopCount": len(additional_troop_ids),
        "nonTroopChoiceCount": len(mixed_block_ids),
        "totalCount": len(choice_ids),
        "uniqueCount": len(set(choice_ids)),
        "ids": choice_ids,
        "airSwarmIds": air_swarm_ids,
        "bothAirSwarmsPresent": all(item in choice_ids for item in air_swarm_ids),
        "runtimeUsesChoiceArray": choice_ui_uses_roster,
    },
}
check(
    report,
    "live-https-and-choice-parse",
    root_status == game_status == manifest_status == app_status == runtime_status == roster_status == 200
    and root_final_url == ROOT
    and root_play_target is not None
    and root_play_target.group(1) == "./game/public/index.html"
    and root_without_beacon == rendered_landing
    and root_beacon_count <= 1
    and game_beacon_count <= 1
    and root_has_release_link
    and manifest.get("entrypoints") == ["public/index.html"]
    and runtime_manifest is not None
    and runtime_manifest["size"] == len(runtime_body)
    and runtime_manifest["sha256"] == runtime_sha
    and roster_manifest is not None
    and roster_manifest["size"] == len(roster_body)
    and roster_manifest["sha256"] == roster_sha
    and len(playable_ids) == 8
    and len(additional_troop_ids) == 9
    and len(mixed_block_ids) == 1
    and mixed_block_ids == ["squall-orb"]
    and len(choice_ids) == 18
    and len(set(choice_ids)) == 18
    and all(item in choice_ids for item in air_swarm_ids)
    and choice_ui_uses_roster,
    {"http": live_http_summary, "landingTemplateMatchesLiveAfterCloudflareBeaconRemoval": root_without_beacon == rendered_landing,
     "landingReferencesRelease": root_has_release_link,
     "landingPlayTarget": root_play_target.group(1) if root_play_target else None,
     "runtime": live_runtime_summary},
)

# Keep the review bounded to the explicitly documented workload and parity statement.
doc_scope_is_bounded = (
    "one seed-zero default-eight workload" in doc_text
    and "not every selectable deck or command combination" in doc_text
    and "no claim of full historical Clash Royale parity or complete roster coverage" in doc_text
)
check(
    report,
    "documented-scope",
    doc_scope_is_bounded,
    {
        "explicitSeedZeroDefaultEight": "one seed-zero default-eight workload" in doc_text,
        "explicitNonParityLimit": "not every selectable deck or command combination" in doc_text,
        "explicitNoFullRosterClaim": "no claim of full historical Clash Royale parity or complete roster coverage" in doc_text,
    },
)

report["passed"] = not report["failures"]
print(json.dumps(report, indent=2, sort_keys=True))
sys.exit(0 if report["passed"] else 1)
