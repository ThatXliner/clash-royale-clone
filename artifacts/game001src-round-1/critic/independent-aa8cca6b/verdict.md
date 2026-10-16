PIECE: GAME-001SRC
VERDICT: PASS

EVIDENCE:
Candidate source aa8cca6bfe2d2594064651d8a2bcda5243787a82, direct npm PID 12497, exit 0. Actual focused TAP output:
# tests 2
# pass 2
# fail 0
# skipped 0

The accepted parent negative control f0742221f2f20733be27529fcd2423e0ee55d7ee, direct npm PID 12525, exit 1 as expected. Actual TAP failure:
error: 'roster[6].entities[0] source confidence field lacks a QUESTION record'
# tests 1
# pass 0
# fail 1
# skipped 0

The candidate test derives referenced keys from body-radius, projectile-speed, and every source-confidence field; its exact key-list assertion passes, so referenced QUESTION receipts occur once with no unused records in this fixture. The real GameSession graph test also passes, retaining its unit/structure/profiled-effect setup, causal receipts, exact spend and route assertions, canonical state/history equality across one-step, chunked, restore, and fork continuations. The parent failure reaches the production source-confidence validator before graph staging, confirming the prior fixture omission.

The only non-artifacts source diff is tests/game-shared-runtime-integration.test.js. The production validators, policies, stats, and QUESTION labels are unchanged. Candidate and parent source fences stayed unchanged during execution. Exact commit/tree identities, archive hashes, archive command, raw separated outputs, PIDs, exits, and launch environments are recorded in this packet.

A first candidate launch is preserved as an unqualified setup failure: direct npm PID 12472 exited 1 before tests because the capture environment assigned /dev/null to both npm user and global config. It did not run an assertion. The corrected retry above is the candidate result.

BIGGEST GAP: The integration test deletes one representative source-confidence receipt to exercise missing-record rejection; full forged, dangling, and wrong-value QUESTION variants remain covered only by unchanged focused validation tests outside this gate.
