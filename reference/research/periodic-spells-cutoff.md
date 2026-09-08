# Periodic spell evidence at the February 2023 cutoff

This supplements the common-stat schema; it does not authorize a complete
runtime composition. `periodic-spells-cutoff.json` contains 78 selected raw
fields from the pinned RoyaleAPI spell table. `extract-periodic-cutoff.py`
re-fetches the exact commit and records the full upstream SHA-256. Keep this
entire directory outside the shipped module graph.

## Facts and interpretation boundaries

| Original identity | Raw area lifetime (ms) | Raw area hit speed (ms) | Raw buff hit frequency (ms) | Raw movement modifier | Raw attack modifier | Raw crown modifier | Raw building modifier |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Blight Ring | 8000 | 250 | 1000 | -15 | 0 | -70 | 0 |
| Fault Pulse | 3000 | 100 | 1000 | -50 | 0 | -35 | 350 |
| Gravity Well | 1050 | 50 | 500 | 0 | 0 | -83 | 0 |

Source: [pinned spell and nested buff rows](https://raw.githubusercontent.com/RoyaleAPI/cr-api-data/54fdef52c5086393b085f57faeeab8ef86b28160/docs/json/cards_stats_spell.json).
These are datamine fields, not automatically normalized multipliers. In
particular, the raw building value350 must not be silently interpreted as
3× or3.5×. Area scanning and buff damage frequency are distinct fields.

Two behavior facts have independent publisher corroboration:

- Blight Ring's counterpart gained a15% enemy movement reduction on
  [6 September2021](https://supercell.com/en/games/clashroyale/fr/blog/release-notes/summer-update-balance-changes-1-4/).
- Fault Pulse's counterpart changed to50% movement reduction and lost its
  attack-speed reduction on
  [2 June2020](https://supercell.com/en/games/clashroyale/blog/release-notes/season-12-balance-changes-2/).

The [8 April2022 publisher adjustment](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/)
confirms a23% crown-damage nerf for Fault Pulse's counterpart; it does not by
itself establish the absolute multiplier or rounding rule.

## Consequences for the current QUESTION fixtures

`src/content/cards/spells-periodic.js` delegates both slow variants to the
same generic movement-and-attack slow primitive. That primitive uses13/20
movement/attack work, which is inconsistent with the separately corroborated
15% and50% movement-only behavior. The fixture also assigns a universal3/10
crown ratio and3× structure ratio for Fault Pulse, whereas the pinned raw
modifier fields differ by spell. These fixtures must remain QUESTION and
must not be promoted unchanged into shared-session card behavior.

An area lifetime is not equivalent to the interval from the first to last
scheduled damage hit. The fixture's421/121/31-tick durations cannot be used
as the8s/3s/1050ms area lifetime. The raw table also has per-area buff refresh,
expiry-capping and stacking flags, so a fixed list of cast-relative damage
pulses is not yet a proven complete model for entering/leaving targets.

## Still unresolved before executable admission

- Cast-to-area activation delay and first damage boundary.
- Area scan versus buff application/damage ordering at one boundary.
- Refresh/stack behavior for the same source, overlapping casts and re-entry.
- Last damage after exiting an area or reaching its lifetime boundary.
- Exact modifier interpretation, tournament scaling and integer rounding.
- Pull integration, mass interaction and collision response for Gravity Well.
- Exact shared-session phase ordering against simultaneous movement/death.

Raw records retain medium datamine confidence. Only the two publisher-backed
movement behavior facts above are corroborated here. Existing common-stat
confidence flags and runtime admission remain unchanged. This evidence narrows
GAME-001HSP's missing facts; it does not resolve Squall's separate composition
or certify the full spell roster.
