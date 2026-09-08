# PASS — source evidence only

Reviewed 2026-09-07 by an independent critic context. This verdict does not pass GAME-001HSS runtime composition or admit either card to the playable roster.

## Evidence actually checked

- Ran `python3 reference/research/extract-status-cutoff.py`, then repeated regeneration with a byte-for-byte comparison against the existing JSON: identical output.
- Independently fetched the JSON's pinned upstream URL with urllib, parsed it without importing the extractor, required one matching row for each of Zap, Rage and RageDamage, and compared all 61 selected area/buff fields. Every value matched; RageDamage has no buff_data. Full-source SHA-256 matched `2bc968eeb9e36e9ddb281bf291f7265d0e7bfefa99bc0589eeba5195c229a690`.
- Confirmed raw lifetimes 1/6000/1, radii 2500/3000/3000, buff times 500/2000/0, Zap multipliers -100 and Rage multipliers 135, friendly Rage filter versus enemy RageDamage filter, child-area link, cap flags, hidden-target flags, and preserved damage arrays. Zap index 10 and RageDamage index 5 are both 192.
- Read `src/content/cards/special-combat-rage.js`: its SOURCE explicitly says unsourced, movement/attack ratios are 7/4 and duration is 90 ticks. The supplement correctly treats this as conflicting fixture policy, not source evidence.
- Read `src/content/cards/special-combat-reset.js`: its SOURCE is unsourced; delivery is explicit-command-only and stunCoupling is deferred. It cannot prove a damage-plus-timed-stun spell composition.
- Opened the [publisher announcement](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-2/). The page is dated December 7, 2022, places Rage under a coming-soon heading, and describes added spell damage and fixed duration. The supplement correctly avoids treating the announcement date as activation proof.
- Ran `npm run test:shipping-isolation-guard`: 13 tests passed, including this repository's shipped entry graph and embedded-reference detection. Targeted search found no references to these research files in src or package.json.

## Judgment

The extractor and checked-in evidence faithfully preserve the pinned raw facts. The markdown and SOURCES supplement explicitly leave activation delay, refresh/reentry, ordering, reset classes, building spawn behavior and rounding unresolved. No complete executable profile or runtime parity claim is made. Reference evidence remains outside shipping code. No production files were changed by this review.
