#!/usr/bin/env python3
"""Reproducibly inspect the pinned RoyaleAPI tree for level-index semantics.

This reads only the immutable upstream commit and writes a compact receipt next
to this script. It is reference research, not runtime code.
"""

from __future__ import annotations

import hashlib
import json
import urllib.request
from pathlib import Path


COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
REPO = "RoyaleAPI/cr-api-data"
API = f"https://api.github.com/repos/{REPO}"
RAW = f"https://raw.githubusercontent.com/{REPO}/{COMMIT}"
OUT = Path(__file__).with_name("pinned-schema-probe.json")
USER_AGENT = "clash-royale-reference-level-index-audit"

DATA_FILES = (
    "docs/json/rarities.json",
    "docs/json/cards_stats_troop.json",
    "docs/json/cards_stats_characters.json",
    "docs/json/cards_stats_building.json",
    "docs/json/cards_stats_spell.json",
    "docs/json/cards_stats_projectile.json",
    "docs/json/cards_stats_character_buff.json",
)
DOC_FILES = ("README.md", "docs/index.html")
INDEX_FIELDS = (
    "summon_character_level_index",
    "spawn_character_level_index",
    "projectile_level_index",
)
CODE_SUFFIXES = {
    ".c",
    ".cc",
    ".cpp",
    ".cs",
    ".go",
    ".h",
    ".hpp",
    ".java",
    ".js",
    ".mjs",
    ".py",
    ".proto",
    ".rs",
    ".ts",
    ".xsd",
}
SCHEMA_NAMES = ("schema", "generator", "consumer", "parser")


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def sha256(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def count_keys(value: object, sought: str) -> int:
    if isinstance(value, dict):
        return sum((key == sought) + count_keys(child, sought) for key, child in value.items())
    if isinstance(value, list):
        return sum(count_keys(child, sought) for child in value)
    return 0


def by_name(rows: list[dict], name: str) -> dict:
    matches = [row for row in rows if row.get("name") == name]
    if len(matches) != 1:
        raise ValueError(f"expected one row named {name!r}, found {len(matches)}")
    return matches[0]


def rarity_indexes(rows: list[dict]) -> dict[str, int]:
    return {
        row["name"]: row["tournament_level_index"]
        for row in rows
        if row.get("name") in {"Common", "Rare", "Epic", "Legendary", "Champion"}
    }


def select(row: dict, *fields: str) -> dict:
    return {field: row.get(field) for field in fields}


def main() -> None:
    commit_record = json.loads(fetch(f"{API}/git/commits/{COMMIT}"))
    tree_sha = commit_record["tree"]["sha"]
    tree_record = json.loads(fetch(f"{API}/git/trees/{tree_sha}?recursive=1"))
    paths = sorted(entry["path"] for entry in tree_record["tree"])
    code_or_schema_candidates = sorted(
        path
        for path in paths
        if Path(path).suffix.lower() in CODE_SUFFIXES
        or any(term in Path(path).name.lower() for term in SCHEMA_NAMES)
    )

    raw_files: dict[str, bytes] = {}
    parsed: dict[str, object] = {}
    for path in (*DOC_FILES, *DATA_FILES):
        content = fetch(f"{RAW}/{path}")
        raw_files[path] = content
        if path.endswith(".json"):
            parsed[path] = json.loads(content)

    docs = {}
    for path in DOC_FILES:
        content = raw_files[path]
        decoded = content.decode("utf-8", "replace")
        docs[path] = {
            "bytes": len(content),
            "sha256": sha256(content),
            "levelIndexTermHits": {
                term: term in decoded for term in INDEX_FIELDS
            },
        }

    all_json = [parsed[path] for path in DATA_FILES]
    field_counts = {
        field: sum(count_keys(document, field) for document in all_json)
        for field in INDEX_FIELDS
    }

    rarity = rarity_indexes(parsed["docs/json/rarities.json"])
    troop = by_name(parsed["docs/json/cards_stats_troop.json"], "SkeletonArmy")
    characters = parsed["docs/json/cards_stats_characters.json"]
    skeleton = by_name(characters, "Skeleton")
    witch = by_name(characters, "Witch")
    witch_projectile = by_name(parsed["docs/json/cards_stats_projectile.json"], "WitchProjectile")
    tombstone = by_name(parsed["docs/json/cards_stats_building.json"], "Tombstone")
    graveyard = by_name(parsed["docs/json/cards_stats_spell.json"], "SkeletonKingGraveyard")

    def child_lookup(row: dict, index: int) -> dict:
        return {
            "index": index,
            "hitpoints": row["hitpoints_per_level"][index],
            "damage": row["damage_per_level"][index],
        }

    offset_cases = []
    for label, row, child_name in (
        ("Witch", witch, "Skeleton"),
        ("Tombstone", tombstone, "Skeleton"),
        ("SkeletonKingGraveyard", graveyard, "SkeletonKingSkeleton"),
    ):
        child = by_name(characters, child_name)
        parent_index = rarity[row["rarity"]]
        offset = row["spawn_character_level_index"]
        candidate_index = parent_index + offset
        offset_cases.append(
            {
                "source": label,
                "rarity": row["rarity"],
                "parentTournamentLevelIndex": parent_index,
                "spawn_character": row.get("spawn_character"),
                "spawn_character_level_index": offset,
                "candidateIndexByAddition": candidate_index,
                "child": child_name,
                "childRarity": child["rarity"],
                "childValueAtCandidate": child_lookup(child, candidate_index),
            }
        )

    candidate_skeleton_index = rarity[troop["rarity"]] + troop["summon_character_level_index"]
    result = {
        "source": {
            "repository": REPO,
            "commit": COMMIT,
            "committerDate": commit_record["committer"]["date"],
            "treeSha": tree_sha,
            "recursiveTreeTruncated": tree_record.get("truncated", False),
            "pathCount": len(paths),
            "nonJsonPaths": [path for path in paths if not path.endswith(".json")],
            "codeOrSchemaPathCandidates": code_or_schema_candidates,
        },
        "checkedFiles": {
            path: {"bytes": len(content), "sha256": sha256(content)}
            for path, content in sorted(raw_files.items())
        },
        "documentation": docs,
        "levelIndexFieldKeyCountsAcrossPinnedStatsJson": field_counts,
        "skeletonArmy": {
            "card": select(
                troop,
                "name",
                "rarity",
                "summon_character",
                "summon_number",
                "summon_character_level_index",
            ),
            "parentTournamentLevelIndexFromRarityRow": rarity[troop["rarity"]],
            "candidateChildIndexByAddition": candidate_skeleton_index,
            "child": select(skeleton, "name", "rarity"),
            "childArrayValues": [
                child_lookup(skeleton, 5),
                child_lookup(skeleton, 10),
            ],
            "interpretation": "data arithmetic only; not proof of field semantics",
        },
        "sameTreeArithmeticConsistencyCases": offset_cases,
        "linkedProjectileExample": {
            "character": select(witch, "name", "rarity", "projectile"),
            "projectile": {
                **select(witch_projectile, "name", "rarity"),
                "damageArrayLength": len(witch_projectile["damage_per_level"]),
                "separateProjectileLevelIndexFieldPresent": "projectile_level_index" in witch_projectile,
            },
            "interpretation": "raw linkage and row rarity only; no consumer rule established",
        },
        "primaryOfficialNotes": [
            {
                "url": "https://supercell.com/en/games/clashroyale/blog/release-notes/champions-update-article/",
                "published": "2021-10-25",
                "excerpt": "We've now moved the cap to level 11.",
                "relevance": "Confirms the tournament cap; does not define spawn-index arithmetic.",
            },
            {
                "url": "https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-coming-1/",
                "published": "2017-02-13",
                "excerpt": "one-shot equally leveled Skeletons.",
                "relevance": "Describes an equally leveled Skeleton interaction; does not define exported index fields.",
            },
        ],
    }
    OUT.write_text(json.dumps(result, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"wrote {OUT}")
    print(f"tree entries: {len(paths)} (truncated={tree_record.get('truncated', False)})")
    print(f"code/schema path candidates: {code_or_schema_candidates}")
    print(f"field keys: {field_counts}")
    print(f"Skeleton child lookups: {result['skeletonArmy']['childArrayValues']}")


if __name__ == "__main__":
    main()
