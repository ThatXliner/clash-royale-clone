# CARDS-021K core candidate

Base: `76e202ff85d8d5920fc58a248b1324f56da5b3f2`.

This private candidate adds the existing `buried-coil` card to the canonical
mixed editable-deck allowlist and proves that existing GameSession, editable
deck, and RL paths consume its existing defensive-building profile. Its cost
is 4 elixir with high-confidence identity provenance. Its damage (the current
runtime estimate is 230), timing, hitpoints, range, target mode, concealment,
and 1,800-tick lifetime remain unverified QUESTIONS. Tests assert those
existing receipts and runtime behavior; they do not promote confidence or
claim historical execution/parity.

The mixed collection now contains 21 source-admitted choices. That is a core
admission candidate, not a released 21-card collection: original Buried Coil
portrait/lore/presentation and matching browser qualification remain separate
work. Existing app-shell/portrait checks still independently pin 20 and were
not edited here.

No production profile, simulator, UI, art, manifest, occurrence binding, or
reference file changed. Production change is limited to
`src/content/editable-deck.js`; all other source behavior is inherited from
the existing catalog and ordinary GameSession/RL paths.
