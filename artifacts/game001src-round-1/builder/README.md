# GAME-001SRC builder packet

This packet belongs to a private candidate based on accepted parent
`f0742221f2f20733be27529fcd2423e0ee55d7ee` (parent of that commit:
`54cc2a017a939ce40b40c1d25544839983fadf8c`). It contains only the focused
shared-runtime integration test edit and bounded builder evidence.

The accepted baseline is retained at
`artifacts/game001src-round-1/root/accepted-baseline/`. Its focused command
failed in `GameSession` setup because `roster[6].entities[0]` referenced a
source-confidence QUESTION receipt absent from the fixture. The validator in
`src/shared/session-troop-source-confidence-authority.js` requires every field
listed by the roster entity's `sourceConfidencePolicy.fields`; the fixture had
only collected body-radius and projectile-speed policy keys.

The fixture now selects those exact source-confidence field keys in addition
to its existing policy references. It checks that the selected QUESTION keys
equal the full set of references, and a negative control removes one required
source-confidence receipt while keeping the roster witness consistent; the
strict validator must still reject it. No production source, stats, policy,
cap, dependency, or asset files are changed.

The focused candidate run used Node v22.22.3 through
`npm run test:game-shared-runtime-integration`. Direct npm PID 10849 exited 0:
2 tests passed, none failed or skipped. The negative control produced the
expected exact `roster[6].entities[0] source confidence field lacks a QUESTION
record` rejection, and the full staged shared-runtime integration continued
to pass. Separate raw streams, process metadata, and exact executed-source
copies are stored in `candidate-attempt-01/`.

`source-fences.txt` records the protected-tree identities and confirms the
production/source/package/assets/stats/dist fences match the parent.
`SHA256SUMS` covers the bounded packet contents except itself.
