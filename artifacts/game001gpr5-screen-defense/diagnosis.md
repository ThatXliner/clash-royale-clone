# GAME001GPR5 screen-defense trace diagnosis

## Result

The candidate and same-policy instrumented replay are exact-outcome matches: both terminate at state tick 13583, with North winning 2–1 at sudden-death tick 13582. The required 18000 tick was not reached. The candidate used South command 24 at tick 13200 (Mossguard) and command 25 at tick 13500 (Reedsting); both decisions were on the normal 300-tick command boundaries. This trace does not support calling the intervention earlier than the latest observation window.

## Cause from the instrumented replay

At tick 13200 the South east tower had 289 HP. North Mossguard 146 (1112 HP, at 14101,14500) and Reedsting 159 (260 HP, at 14500,16700) were both alive and tower-targeting. The candidate deployed South Mossguard; the actual spawned body was 160 at 14000,14500. At tick 13201 it routed toward 146, as intended by the one-on-one projection. At that same boundary, North Cinderlings 149–151 and Briar-band bodies 153–155 all routed to 160. By tick 13260 they were engaging it.

Body 160 did kill Mossguard 146: its 202-damage attacks landed at ticks 13302, 13374, and 13446. The last attack killed 146 after South east tower fire had reduced it to 163 HP. The projection accounted for this duel but not the other six North attackers. Cinderlings 149–151 dealt 81 each at ticks 13275, 13335, 13395, and 13455. Briar-band attackers 154, 153, and 155 dealt 120 hits at ticks 13324, 13346, 13360, 13390, 13412, and 13426. The 13455 Cinderling volley left 160 at 74 HP; Briar-band 154 dealt the final 120 damage at tick 13456 and killed it. Thus the screen won its selected duel, then died to the crowd before reaching Reedsting 159.

Reedsting 159 remained alive and tower-targeting. It launched tower shots at ticks 13486, 13528, and 13570; their contacts dealt 131 damage at 13499, 13540, and 13582. At the tick-13500 emergency, South Reedsting spawned as unit 162 at 14250,14500 but acquired North Cinderling 149, not 159. Its attack launched at 13581 and hit/killed 149 at 13582, the same tick 159's final contact destroyed the tower. The terminal result was North 2–1, ended at 13582.

This identifies two concrete failures: the 13200 survival estimate omitted aggregate incoming damage from units that acquired the screen, and the 13500 counter's actual target acquisition favored a nearer nonlethal body while 159 remained on the tower. The trace shows no route-block cause for the first counter; it was killed in combat. The exact attack, damage, death, target, and per-boundary state records are in `counter-trace-filtered.json`.

## Provenance

The candidate used the frozen seed-zero/default-eight setup (`306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c`), with North AI, 18000 tick cap, 50 ms simulation step, and 300-tick normal command interval. No source, tests, engine, or policy files outside this artifact directory were changed.

- Candidate full trial: PID 66784, attached exec session 96029; `screen-defense-result.json`.
- Same-policy instrumented replay: PID 67452, attached exec session 54343; exact uncompressed trace retained as deterministic `screen-defense-trace-result.json.gz`.
- Uncompressed trace SHA-256: `59e5196116c41ffd18d07cd44dc785a9a0701558c0a4de9c4e8c64e34d43e904`.
- Compressed trace SHA-256: `10fb096e4850ca18de5ed22731099dba5fe69f4acc8ff41de3e0240aee39aa9d`.
- Candidate result SHA-256: `cfd53f9d8ce3126eab24a30a22ca5859e5b72300f440f491beee003b0985688a`.
- Filtered evidence SHA-256: `daae6ffd9c8f0581d1c636469ed4ff2a2e4299f8c304d9538091645a3e66fe9c`.

`fullPass` is false. A next candidate needs to evaluate survival against all currently eligible attackers around the placed counter and verify actual target acquisition for competing threats before crediting any duel as a lane clear. An air Copperskiff may avoid Mossguard 146's ground-only attacks while still taking Reedsting 159's ranged attacks; the current trace does not establish that it survives or wins that multi-unit fight.
