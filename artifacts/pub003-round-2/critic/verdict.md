PIECE: PUB003 — README collection count
VERDICT: PASS
EVIDENCE:
- Fresh archive of candidate `87f7966fcf1c31399e327fa0a32bb68c3e008926` was audited against base `bfd957c5d044137dca1a17a21b3b79edc5760782`.
- Focused TAP output: `# tests 5`, `# pass 5`, `# fail 0` (`readme-collection-audit.tap`). The test confirms README text still describes the computer opponent, eight-card deck, pre-March-2023 inspiration, original names/art/sound, and active-prototype limits.
- The mixed editable collection resolves to 20 unique IDs (18 admitted troop IDs plus Squall Orb and Ember Basin); the default playable deck has 8 cards. Fresh capture exactly matches the builder's committed count evidence.
- Current guide line reports 20 choices and default deck 8. The versioned live receipt is for `main` commit `bf1e6120196db8a2927ce6ae893812e4c9b1115d`, workflow conclusion `success`, landing and game status 200, and confirms the landing contains the full release commit.
- README link check: 14 local targets checked, 0 missing; 2 external targets skipped.
- The README differs from base by exactly `nineteen-card` → `twenty-card`; raw word diff and patch are saved. `src`, `tests`, `public`, `dist`, and `docs` compare byte-for-byte equal to base. Other candidate changes are confined to `artifacts/pub003-round-2/builder/` evidence.

BIGGEST GAP: Gameplay behavior was not rerun in this README-only round; the mechanics statements were verified as unchanged README text.
