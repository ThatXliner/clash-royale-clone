# Test-only completion inventory artifacts

These are offline comparison reports for implementation planning and
acceptance. They may contain benchmark identities. Never import them from
`src/`, copy them into `dist/` or `site-dist/`, or publish them with the game.
The release and Pages builders should continue to ship only their explicit
allowlisted outputs.

`reference/card-coverage-109.json` records the historical card inventory,
per-field confidence flags, the 11 mapping declarations already present in
tests, and separate session-catalog admission counts. A declared match is not
a parity claim for fields flagged unverified, and an admitted identity is not
proof of full card execution.
