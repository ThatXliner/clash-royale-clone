# CARDS-022K Round 3 builder evidence

Base: `c72cd1695258be2af6d3ab4145218bcd673aa1cf` in an isolated checkout.

The fresh canonical two-run audit completed successfully. It produced 68 supported/covered occurrences, 63 unique supported IDs, 5 QUESTION records, and 47 runner records. Both run hashes equal the manifest SHA-256 `259d5fcfbc33e9bcb983676891f8b5d723255e25ca82af53348eaa0363e520b1`. The full 682,350-byte canonical manifest is preserved in `canonical-audit-manifest.json`.

The stale occurrence and manifest pins in `tests/integration-audit.test.js` were refreshed from that output; the mixed deck size pin in `tests/editable-deck.test.js` was refreshed to the observed 22-card witness. All other assertions remain intact.

Verification: `npm run test:integration-audit` passed 6/6, including the full two-run gate; `npm run test:editable-deck` passed 12/12. Both commands used the default `TMPDIR`. Immutable hashes for 228 protected source and prior-candidate paths matched. Raw command, stdout, stderr, exit, manifest, and checksum evidence are included beside this report.
