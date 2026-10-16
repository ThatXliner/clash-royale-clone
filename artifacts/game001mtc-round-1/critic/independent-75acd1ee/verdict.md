PIECE: GAME-001MTC
VERDICT: PASS

EVIDENCE:

- Product/source diff outside `artifacts/` is only `tests/game-roster-troops-movement.test.js`; the changed test assertions update the tick-120 length/hash and tick-200 SHA. The post-run test, runner, and package copies match the pre/post source fences and Git blob IDs.
- Candidate full finite suite completed on the exact candidate snapshot:

  ```text
  # tests 16
  # pass 16
  # fail 0
  # duration_ms 213925.880959
  ```

  Its ordinary Cinderlings continuation test passed in 87.7 seconds and the serialization-purity test passed in 105.9 seconds.
- The parent negative control completed all 16 tests with 14 pass and 2 expected stale-pin failures. Its actual values were `423499 !== 417386` at tick 120 and actual SHA `63c23019fc6aadaedb47a72a79a24dae266970a281eb8aca8978d008b6f80996` versus expected `07525d6e712c40fe9c9bb473f173ae7604f224a04f67eef12c0a0d3fc319d02d` at tick 200.
- Independent probe reproduced the historical source's tick-120 length/hash (`417386`, `0263778593d12c500721bb3914123269940e3e702ae5fc841f93613d2c2d0cb5`) and tick-200 hash (`07525d6e712c40fe9c9bb473f173ae7604f224a04f67eef12c0a0d3fc319d02d`). It reproduced the candidate pins (`423499`, `538f8a87fe8478881ffd035bf6ddf30972c9a5daa4f5420f46bfea20d002cf5b`; tick-200 SHA `63c23019fc6aadaedb47a72a79a24dae266970a281eb8aca8978d008b6f80996`).
- The generated Mossguard witness grows from 15,562 to 21,675 bytes: +2,410 roster bytes, +3,703 question bytes, and 20 added QUESTION records. The only roster field additions are two Briar Band `sourceConfidencePolicy` fields. Each new QUESTION is marked `authoritative: false`, `confidence: unverified`, and `disposition: question`; these are serialization inputs, not claims that the values are authoritative.
- At ticks 120, 200, and 320, for both ordinary and profiled battles, full state, all public `battle.events`, replay, and snapshot fields after deleting only top-level `setup` compare equal (zero field differences). Full event arrays retain both scheduled deployment receipts at ticks 0 and 96; event counts match at 880, 1,383, and 1,430. Snapshot size is +6,113 bytes solely in the setup witness.
- Source archive audit found zero missing or extra tracked non-artifact paths across historical, parent, and candidate snapshots. Both suite source fences and successful probe source fences are unchanged. All launched PIDs have exited.

BIGGEST GAP: Full serialized snapshots are 6,113 bytes larger because their setup witness now contains the two Briar Band policies and 20 non-authoritative QUESTION records; gameplay state and event logs remain identical.

EVIDENCE NOTE: The first probe attempt failed before importing project code. Its source/hash and PID/exit remain, but its original redirected streams and source fences were overwritten when the attempt directory was reused; they are explicitly marked unavailable and were not reconstructed. The successful probe run is fully captured.
