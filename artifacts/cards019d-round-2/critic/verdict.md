PIECE: CARDS019D Kilnkeeper collection portrait + lore
VERDICT: PASS

EVIDENCE:

The fresh candidate checkout was `b8c70ba5325d53e2f376ce3108c3a87a6ccb9e92` (source `7f2c978309d792059fdd09586ca8fbefc155a69c`, base `ddaf00e64eab6e1d314163fc5212b19f4398c8fd`). The new details test passed in trusted Chrome 155.0.8059.40 across phone 390×844 and desktop 1440×933, normal and reduced motion, DPR 1. Its raw TAP and browser evidence are retained here.

```text
# Subtest: Cards019D Kilnkeeper collection portrait and lore render in real Chrome
ok 1
# tests 1
# pass 1
# fail 0
```

The shipped portrait decoded at 512×512 in all four contexts. The detail portrait rendered at 64×64 on phone and 78×78 on desktop. The combat caveat was visible inside each viewport: phone bounds x=30–360, y=179–241 in 390×844; desktop bounds x=914.45–1345.98, y=132–200.19 in 1440×933. Both views showed cost 5 and the exact copy: “The 5-elixir cost is source backed; combat values are unverified estimates and remain QUESTION for historical comparison.” The displayed profile remains Count 1, Health 720, Damage 281 per attack, Hit speed 1.4 s, Range 5.5 tiles, targets ground and air, and movement 1 tile/s. Ground remains explicitly provisional.

The approved Kilnkeeper field note appeared verbatim as two sentences. Phone back navigation restored focus to Kilnkeeper; the default deck remained the same eight IDs, and replacing its first slot produced the exact eight-card lineup beginning with Kilnkeeper. Browser console and request errors were empty. The 19 old portrait mappings and lore strings retained their prior SHA-256 values: `81c05bdd4e1f3cab949409ebccee575f29d4f3e1116fa3cbd5d9dddabc245dd3` and `575ffb9a932b2e5d33c610539615e8bf94e925bbf1f82dee06384aa3f4407c05`.

The relevant regression checks passed: app-shell 1/1, Cards018 Ember Basin integration 1/1, Pages publication 5/5, and visual asset manifest 6/6. A fresh Pages build used repository `ThatXliner/clash-royale-clone`, ref `main`, and project subpath `/clash-royale-clone/`. Its release manifest lists 51 files totaling 5,972,230 bytes; an independent audit matched all 51 output sizes and SHA-256 hashes and found no `reference`, `tests`, `artifacts`, or `dist` paths. The emitted Kilnkeeper portrait matched the source hash. The in-repo provenance identifies the portrait as original, AGPL-3.0-only artwork generated without input images; the manifest test found zero byte overlap with `reference/`.

No `src/content/` or `src/sim/` path changed from base to final. The 20 combat QUESTION records retained from the round-1 proof remain exact; all 34 records returned by the current session witness are still marked unverified QUESTION. This UI-only update makes that uncertainty visible and adds no historical parity or homing statement.

Fresh screenshots: [phone detail](phone-normal-details.png), [desktop detail](desktop-normal-details.png), [phone collection return](phone-normal-back.png), [phone custom deck](phone-normal-custom-deck.png). Raw test output, the complete browser metrics, Pages output, hash audit, and provenance snapshot are in this directory.

BIGGEST GAP: Kilnkeeper has no historical combat record to establish parity, so its displayed combat profile remains an estimate explicitly marked QUESTION.
