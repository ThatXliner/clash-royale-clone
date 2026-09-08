# Status spell cutoff evidence

The reproducible extractor selects three rows from the pinned 2023-02-18
RoyaleAPI data, before the project's cutoff. Source URL and full-file SHA-256
are recorded in status-spells-cutoff.json. No game module imports these files.

| Original identity / source row | Raw lifetime (ms) | Radius | Buff time (ms) | Movement / attack / spawn multipliers |
| --- | ---: | ---: | ---: | --- |
| Static Burst / Zap | 1 | 2500 | 500 | -100 / -100 / -100 |
| Tempo Field / Rage | 6000 | 3000 | 2000 | 135 / 135 / 135 |
| Tempo Field damage / RageDamage | 1 | 3000 | 0 | No buff |

The Rage row has only_own_troops=true, only_enemies=false and
spawn_area_effect_object=RageDamage. Its damage is zero. The linked damage
row instead has only_enemies=true, only_own_troops=false and crown modifier
-70. This is explicit evidence for separate friendly buff and enemy damage
areas, not a single target filter for both. RageDamage affects_hidden=true;
the buff area and Zap have affects_hidden=false. All three hit ground and air
and have ignore_buildings=false.

Rage has raw area hit_speed=300, buff_time=2000 and
cap_buff_time_to_area_effect_time=true. These are different fields; the
6000-ms area lifetime must not silently become an unconditional six-second
buff for every entrant. enable_stacking=false is recorded, but refresh and
same-tick precedence still need evidence. Zap has buff_time=500 and cap=false.
The raw multiplier conventions differ between positive buffs and negative
slows; do not apply one arithmetic interpretation to every signed field.

Current special-combat-rage.js explicitly labels its policy unsourced and
uses 7/4 movement/attack multipliers and a 90-tick duration. These cannot serve
as sourced Tempo Field behavior: 7/4 represents a 75% increase, inconsistent
with the source's 135 multipliers. The generic reset facade likewise does
not by itself establish Static Burst's damage plus timed stun composition.

Damage arrays are preserved without flattening their rarity-relative indices:
Zap[10]=192 and RageDamage[5]=192. The raw base damages are respectively 75
and 120. No modifier-rounding rule is established by these arrays.

The publisher's December 7, 2022 announcement says Rage will gain cast damage
and remove level-dependent duration increases, but marks that rework coming
soon. It is corroboration of design intent, not proof of its activation date:
https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-2/
The later pinned February data supplies the observed pre-cutoff record.

Remaining GAME-001HSS questions: actual activation delay; same-boundary
area creation, damage, status, death and attack order; aura scan/reentry and
refresh semantics; stun reset/retarget classes; building spawn acceleration;
and damage rounding. custom_deploy_time=0, where present in the full upstream
row, does not establish zero actual activation delay. This supplement narrows
missing facts without promoting either card to a complete executable profile.
