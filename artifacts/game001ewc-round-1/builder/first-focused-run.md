# First full focused run

The complete bounded stdout is retained in `first-focused-run.stdout.raw`. The full execution receipt, including `argv.json`, `env.json`, direct PID, Node binary/version, raw stream hashes, exact pre/post tracked-source manifests, and Git fences, is at:

`/Users/me/.codex/clash-qualification/20261020-node-workload/attempts/20261020T144525Z-focused-suite/`

The focused test ran from the candidate checkout at HEAD `cc690130e4f0edcfec64212b70356929cead0880` under `/Users/me/.hermes/node/bin/node` v22.22.3. It used the focused test-name pattern in the saved argv and no `GAME_SESSION_ENDURANCE_TICKS` override. Direct Node PID was `22788`; it ran from `2026-10-20T14:45:26Z` to `2026-10-20T14:47:48Z` and exited `1`. The source fence passed.

The measured segment ending at tick 10800 was 2695 ms. The next segment, ending at 11100, failed the unchanged 30,000 ms cap. That run constructed its metric only after the cap assertion, so the exact elapsed time for that segment was not recorded. Do not treat subtraction from total test time as a measurement.

The executed driver still contained the helper's `nextPlannedAttempt()` forecast branch and forecast parity assertions. The next candidate removes that browser-oriented look-ahead from this Node proof and calls the same unchanged `workloadPolicy.plan(session)` on each live 15-tick boundary. This is a source-level performance hypothesis; decision parity and the full bound remain unverified until a newly authorized run.
