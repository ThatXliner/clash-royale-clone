# Prior comparison method retained as failed attempt

The exact `normalized-comparison.tsv` from artifact commit `da67b536e6a89b5fbd283a4ae68bf03aa19ad96a` is retained here unchanged. SHA-256: `7eb36ff4e4a9141f185df0c056943390fcf9be4b3b3daff964471f91ae33c8a0`.

The prior output mixed two independent blocks: normalized Firecracker reference rows first (whose fixture-value cell was null and comparator label said `not a Cinderback fixture field`), followed by separate Cinderback catalog rows. Those later rows did include values such as cost `3`, hitpoints `304`, and first-hit ticks `144`, but were generated from the extractor's static snapshot, not the exact one-row return receipt of `createRecoilSpecialCatalog()`. They also used a generic disposition instead of the test comparator's `match` / `question-backed-match` / mismatch outcome. That layout did not provide one direct row per comparator mapping.

The current `normalized-comparison.tsv` is regenerated from `test_only_binding.comparator_fields` and the actual catalog return receipt. It has one row for each of the 14 test mappings, with actual fixture value, normalized reference value, transformed expected value, equality result, Q status, and derived parity disposition. The complete normalized-reference projection remains separately available in `firecracker-normalized-context.tsv`. No test evaluator was executed.
