# CARDS-019D round 2 builder receipt

Status: implementation prepared and verified; independent review pending.

Candidate base: `ddaf00e64eab6e1d314163fc5212b19f4398c8fd`.
Frozen source/test candidate: `7f2c978309d792059fdd09586ca8fbefc155a69c`.

Owned changes are limited to the Kilnkeeper portrait/lore registry, the
collection-count assertions in the app-shell and Cards018 browser tests, the
focused Cards019 browser journey, and the existing app-shell classification
copy needed to expose source confidence. Kilnkeeper combat values remain
unchanged. The description now says that its 5-elixir cost is source backed
while its combat values are unverified estimates that remain QUESTION for
historical comparison. The note is rendered through the existing
`questionClassificationCopy` path beside the existing classification text and
unit stats. The accepted two-sentence lore, portrait bytes, and original
nineteen portrait/lore mappings remain unchanged.

Final real-Chrome run of `tests/cards019-card-details.test.js` passed all four
contexts (390×844 phone and 1440×933 desktop, normal and reduced motion) on
Chrome 155.0.8059.40. The complete caveat was visible inside the native
viewport in all four contexts. The accepted portrait decoded at 512×512 and
remained 64×64 CSS pixels on phone and 78×78 CSS pixels on desktop; response
bytes were 65,626 with SHA-256
`38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240`.
Exact prior portrait and lore mapping hashes remained
`81c05bdd4e1f3cab949409ebccee575f29d4f3e1116fa3cbd5d9dddabc245dd3` and
`575ffb9a932b2e5d33c610539615e8bf94e925bbf1f82dee06384aa3f4407c05`.

Final checks also passed `npm run test:app-shell`,
`node --test tests/cards018-browser-integration.test.js`, and
`npm run test:publication-pages` (5 tests). The Pages test's fixed evidence
destination was temporarily redirected to this round's builder directory; the
preexisting round-1 Pages screenshot and JSON were restored unchanged and their
before/after hashes are recorded in `checks.json`. Raw Chrome evidence,
screenshots, command logs, browser hashes, and native viewport measurements are
in this directory.

The known `test:app-polish` locator ambiguity remains the prior round's
baseline, recorded in `artifacts/cards019d-round-1/critic/`; it is outside this
collection-detail repair and was not rerun.
