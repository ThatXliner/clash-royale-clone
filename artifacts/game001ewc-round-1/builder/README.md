# GAME-001EWC builder evidence

The accepted-source counterfactual is preserved as `accepted-control.test.js` and its exact bounded output as `accepted-control.stdout.raw`. The source and output are the actual accepted-control attempt; the old deployment planner is not run again by the candidate test. The accepted-control receipt is from direct Node PID 21296, Node v22.22.3, exit 1, with no tick override. It ran the frozen accepted fixture from the accepted-source checkout and failed the full-duration assertion when the match ended at tick 13351 with North ahead 2–1 in sudden-death overtime. The original stdout is 5,242 bytes.

`setup-byte-probe.mjs` extracts and executes the original `setup()` from `accepted-control.test.js`, then compares its bytes against the unchanged `exactEnduranceSetupBytes()` helper. Its actual Node receipt is in the unique setup-probe attempt directory; the output confirms byte equality for 39,641 bytes.

`first-focused-run.stdout.raw` and `first-focused-run.md` preserve the first candidate failure. That version retained the browser scheduler's forecast branch; it failed the 30-second cap at tick 11100. Its exact failed-segment elapsed was not recorded, and the note does not infer it.

`full-focused-run.stdout.raw`, `full-focused-run.executed-test.js`, and `full-focused-run.md` preserve the successful full direct-policy run. It passed one focused test through tick 18000, the irregular-chunk replay, and restore cuts 2100, 9000, and 17700. It used no tick override, with Node v22.22.3 and direct PID 25928; the source and Git fences passed. The actual executed source is frozen separately from the current candidate.

The current candidate test adds a positive-paid North `session-deployed` replay assertion and checks every gap between actual positive-paid South deployment receipts, including tick 0 to the first and the last to tick 18000. It logs the maximum South paid gap. `candidate-for-critic.test.js` and its generated source manifest pin this separate source revision. The short actual North probe passed at tick 300: North deployed `reedsting` at tick 0 for 3 elixir; see `north-paid-probe.md` and its raw. The full focused run above did not execute these later assertions; the fresh critic must run the exact current candidate.

`capture-node-attempt.zsh` records unique pre/post Git and source fences, Node identity, exact argv/environment, direct PID, raw streams, and exit code. Never reuse an attempt ID. Keep the full 18,000-tick duration, all restore cuts, and the existing timing and snapshot caps.
