PIECE: CARDS019D Kilnkeeper collection portrait + lore
VERDICT: FAIL
EVIDENCE:

The focused browser test passed in real Chrome 155.0.8059.40:

```text
# Subtest: Cards019D Kilnkeeper collection portrait and lore render in real Chrome
ok 1
# tests 1
# pass 1
# fail 0
```

It covered four DPR 1 contexts: phone 390×844 and desktop 1440×933, each with normal and reduced motion. All showed 20 collection choices; all portraits decoded. Kilnkeeper's source image decoded at 512×512 and rendered at 64×64 on phone and 78×78 on desktop. The approved lore appeared verbatim. Phone back navigation restored focus to Kilnkeeper, the default deck stayed at eight cards, and the custom deck contained eight unique IDs after selecting Kilnkeeper. Browser errors: `[]`.

![Fresh Chrome phone detail, 390×844](/private/tmp/cards019d-builder-2a29833/artifacts/cards019d-round-1/critic/focused/phone-normal-details.png)

![Fresh Chrome desktop detail, 1440×933](/private/tmp/cards019d-builder-2a29833/artifacts/cards019d-round-1/critic/focused/desktop-normal-details.png)

Independent comparison with parent `2a29833c5793a36cec5b665e82de4e10576ac270` found all 19 previous portrait IDs and mappings equal, with mapping SHA-256 `81c05bdd4e1f3cab949409ebccee575f29d4f3e1116fa3cbd5d9dddabc245dd3`; all previous lore strings match with SHA-256 `575ffb9a932b2e5d33c610539615e8bf94e925bbf1f82dee06384aa3f4407c05`. The accepted portrait asset stayed byte-identical at 65,626 bytes and SHA-256 `38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240`.

Other required checks passed:

- `npm run test:visual-asset-manifest`: 6/6.
- `npm run build:pages -- --out /private/tmp/cards019d-pages-critic-a66a852`: 51 release files; no `reference`, `tests`, `artifacts`, `dist`, or `node_modules` paths; emitted portrait hash matches the source.
- `npm run test:app-shell`: 1/1.
- `node --test tests/cards018-browser-integration.test.js`: 1/1; the Ember Basin editable-deck and battle journey passed.
- `git diff --check` passed; no `src/sim` or accepted portrait asset changes from the parent.

The remaining gap is visible in the same screenshot and source-confidence evidence: the detail view shows Health 720, Damage 281, Hit speed 1.4 s, Range 5.5 tiles, and ground-and-air targets as plain values. The actual runtime question records mark 20 Kilnkeeper fields `authoritative: false`, `confidence: unverified`, and `disposition: question`; the displayed caveat only says that the ground layer is provisional. `reference/stats/SOURCES.md` has no Kilnkeeper entry.

`npm run test:app-polish` fails at `tests/app-polish.test.js:234` on both the candidate and exact parent snapshot. Both runs produce the same strict-mode violation for `[data-replacement-card-id]` resolving to 12 elements, and the test file SHA-256 matches between them (`16b187b217b80b45ec26c8df68fa0c10d2d90e7f98fed5b8d59fdb18083db9bf`), so that separate failure is pre-existing.

BIGGEST GAP: The detail view presents unverified Kilnkeeper combat values without a provisional or QUESTION label, even though only the ground-layer classification is marked provisional.
