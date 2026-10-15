# Electro Dragon chain: bounded primary-source audit

**Scope:** read-only audit at repository HEAD `ac224e9d8fa3e2797ea04c3e27b941abf18239c3`. Search limited to Supercell publisher material for Clash Royale dated before 2023-03-01. Web pages were retrieved 2026-10-15. This packet records evidence only; it does not change the stat corpus, flags, questions, or plan.

## Result

No pre-cutoff official Supercell Clash Royale source found in the bounded search independently specifies a chain characteristic for the base Electro Dragon. The only directly relevant pre-cutoff Clash Royale page opened was the December 2018 balance update. It gives a base-card HP change and first-attack change, but no chain description or chain parameters.

The page’s complete Electro Dragon receipt is **“Hitpoints -5%, first attack slower”** (5 quoted words total for this source). Publisher date: **2018-12-03**. Retrieved: **2026-10-15**. [Supercell, “Balance Update Live! (12/3)”](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-update-coming-12-3-2/), opened page lines 31–45. “First attack slower” is not evidence of inter-hop delay.

Accordingly, this search corroborates **none** of the requested base-card chain facts: whether/how the base card chains, maximum targets, per-hop damage behavior, hop range or delay, stun magnitude/duration, target selection/eligibility, or death/cancel/event ordering. This is a bounded search result, not a claim that no such official material can exist.

## Facts still unresolved

`reference/stats/SOURCES.md` says the February 2023 pinned datamine is the base for common card stats, per-card `unverified_fields` identify mechanics lacking a second historical source, and `damage` means damage per attack/projectile/tick. For Electro Dragon, the pinned card row flags its mechanic values including damage, first-hit time, range, target mode, and count as unverified. The common row does not encode the chain policy. Its `damage: 192` does not establish per-hop damage or a damage-decay formula; `targets: air_and_ground` does not establish chain eligibility; `count: 1` is troop count, not a target cap. The `first_hit_seconds` normalization is the datamine `load_time`; it does not establish inter-hop delay.

`tests/special-projectiles-chain.test.js` names eleven chain questions. The test explicitly marks every fixture record `authoritative: false`, `confidence: "unverified"`, `disposition: "question"`, and `source: "unsourced-chained-target-attack-fixture"`. They remain unresolved:

- `attackerCancellationRule`
- `candidateDeathRule`
- `damagePerHop`
- `eventOrderRule`
- `hopDelayTicks`
- `hopRangeMillitiles`
- `lethalHopRule`
- `rangeRule`
- `selectionRule`
- `targetCap`
- `targetEligibilityRule`

The requested stun magnitude/duration and qualitative chain behavior also remain unresolved by this official-source search; neither is established by the baseline card row or the question fixture.

## Scope controls

The opened 2018 balance page is relevant only for its literal HP/first-attack change; it does not resolve a chain question. A later Supercell Clash Royale page dated **2024-10-02** is explicitly about **Electro Dragon Evolution**, and is after the cutoff; it was excluded from the base-card evidence. [Supercell, “October Update!”](https://supercell.com/en/games/clashroyale/blog/release-notes/october-update/), retrieved **2026-10-15**. No claim from that page is used here.

The bounded searches targeted official Supercell Clash Royale release-note/support material with the card name and terms for chain, targets, stun, and target count. Same-name Clash of Clans material was outside the requested product scope and was not treated as Clash Royale evidence.
