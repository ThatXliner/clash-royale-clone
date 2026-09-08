"""Reproduce raw numeric evidence; this file is never part of the game build."""
import hashlib
import json
from pathlib import Path
from urllib.request import urlopen

COMMIT = '54fdef52c5086393b085f57faeeab8ef86b28160'
URL = f'https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/{COMMIT}/docs/json/cards_stats_spell.json'
FIELDS = ['life_duration', 'radius', 'hit_speed', 'hit_speed_offset',
          'first_hit_to_target', 'buff_time', 'cap_buff_time_to_area_effect_time',
          'buff_number', 'only_enemies', 'only_own_troops', 'ignore_buildings',
          'hits_ground', 'hits_air', 'stay_after_parent_dies']
BUFF_FIELDS = ['building_damage_percent', 'crown_tower_damage_percent',
               'damage_per_second', 'hit_frequency', 'hit_speed_multiplier',
               'speed_multiplier', 'enable_stacking', 'attract_percentage',
               'push_mass_factor', 'push_speed_factor', 'controlled_by_parent',
               'ignore_buildings']
with urlopen(URL, timeout=30) as response:
    source = response.read()
rows = json.loads(source)
records = []
for name, original_id in [('Poison', 'blight-ring'), ('Earthquake', 'fault-pulse'),
                          ('Tornado', 'gravity-well')]:
    matches = [row for row in rows if row['name'] == name]
    assert len(matches) == 1, (name, len(matches))
    row = matches[0]
    records.append({'reference_name': name, 'original_id': original_id,
                    'area_fields': {key: row[key] for key in FIELDS},
                    'buff_fields': {key: row['buff_data'][key] for key in BUFF_FIELDS}})
result = {'version': 1, 'source_url': URL, 'source_commit': COMMIT,
          'source_sha256': hashlib.sha256(source).hexdigest(),
          'source_date': '2023-02-18', 'accessed': '2026-09-07',
          'interpretation': 'raw fields only; not an executable composition receipt',
          'records': records}
output = Path(__file__).with_name('periodic-spells-cutoff.json')
output.write_text(json.dumps(result, indent=2) + '\n')
print(f'{len(records)} records, {sum(len(r["area_fields"])+len(r["buff_fields"]) for r in records)} raw fields, sha256={result["source_sha256"]}')
