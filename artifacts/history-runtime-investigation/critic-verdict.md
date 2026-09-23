PIECE: Battle movement canonical history runtime
VERDICT: PASS
EVIDENCE:

`npm test -- battle-movement-history` completed with the history, canonicalization, exact restore, limits, and hostile-input cases green:

```text
1..23
# tests 23
# pass 23
# fail 0
# duration_ms 74761.45
```

The timing and bound case itself passed in 9,781.465625 ms. The command-bound snapshot restores to the identical bytes; rejected over-bound commands leave the live snapshot unchanged. Hostile shape/accessor/callable/revoked-proxy admission and altered, forged, duplicated, and reordered history rejection cases also passed. The timing threshold and its measurement method are unchanged from `HEAD`; this diff adds the direct-air pre-arrival/arrival byte regression case without changing the gate.

The dependent `npm test -- battle-movement-kernel` also passed all 5 tests in 7,987.913292 ms, including every live air cut with stop/retarget continuation.

The exact 1,024-command benchmark was rerun:

```text
{"serializeMs":554.0540000000001,"restoreMs":561.660625,"bytes":97035,"commands":1024,"byteStable":true}
```

The checked-in investigation result records the same workload before and after the change: serialize 2,255.032166 ms to 552.809208 ms and restore 2,275.271375 ms to 566.052166 ms, with `restoredBytesIdentical: true` for both. That is about 4.08x faster serialization and 4.02x faster restore. The rerun remained near those after values and returned byte-stable output.

BIGGEST GAP: The reported before/after speedup uses one timing sample per stage, so it lacks a repeated paired-run variance estimate even though the unchanged in-suite 256-to-1,024 scaling guard passes.
