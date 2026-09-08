"""Extract reference-only status spell facts from the pinned cutoff."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

COMMIT = "54fdef52c5086393b085f57faeeab8ef86b28160"
URL = f"https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json/cards_stats_spell.json"
AREA_FIELDS = ["life_duration", "radius", "hit_speed", "hit_speed_offset",
    "damage", "damage_per_level", "crown_tower_damage_percent", "buff",
    "buff_time", "cap_buff_time_to_area_effect_time", "only_enemies",
    "only_own_troops", "ignore_buildings", "hits_ground", "hits_air",
    "affects_hidden", "spawn_area_effect_object"]
BUFF_FIELDS = ["hit_speed_multiplier", "speed_multiplier",
    "spawn_speed_multiplier", "enable_stacking", "controlled_by_parent"]
with urlopen(URL, timeout=30) as response:
    source = response.read()
rows = json.loads(source)
records = []
for name, original_id in [("Zap", "static-burst"), ("Rage", "tempo-field"),
                          ("RageDamage", "tempo-field")]:
    matches = [row for row in rows if row["name"] == name]
    assert len(matches) == 1, (name, len(matches))
    row = matches[0]
    records.append({"reference_name": name, "original_id": original_id,
        "area_fields": {key: row[key] for key in AREA_FIELDS},
        "buff_fields": {key: row["buff_data"][key] for key in BUFF_FIELDS}
            if "buff_data" in row else None})
result = {"version": 1, "source_url": URL, "source_commit": COMMIT,
    "source_sha256": hashlib.sha256(source).hexdigest(),
    "source_date": "2023-02-18", "accessed": "2026-09-07",
    "interpretation": "raw fields only; not an executable composition receipt",
    "records": records}
Path(__file__).with_name("status-spells-cutoff.json").write_text(
    json.dumps(result, indent=2) + "\n")
print(f"{len(records)} records; sha256={result['source_sha256']}")
