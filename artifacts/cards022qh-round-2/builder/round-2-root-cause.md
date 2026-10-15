# CARDS-022QH Round 2 builder record

Source baseline: `ac224e9d8fa3e2797ea04c3e27b941abf18239c3`.

## Observed failure

The separate Brackenwheel full-duration qualification reached tick 7,200 without a terminal state, but its last paid south deployment was at tick 6,000. The unchanged cadence gate therefore failed after a 1,200-tick gap. This is not the prior long-task failure: the default full run passed, and this failure is the workload driver's missing action.

The private Node reproduction used the accepted seed-two eight-card setup (`2207fce9a5a9c64ebca77acd12bae175bfcc0e05ddb94886b7354ccc50f1a15b`), actual `GameSession` state, canonical E2 commands, selected-source workload policy, and the 600→300→600 serialized restore branch. It stopped at the same tick-7,200 cadence gate. Captured output is in `reproduce-v2.stdout.raw`, `reproduce-v2.stderr.raw`, and `reproduce-v2.exit.txt`.

At tick 6,900 the session was still in regulation and nonterminal. The south side had 6 elixir, no planner-visible north unit, and had last deployed at tick 6,000. Its hand candidates were durability-ranked as Ironroot (cost 7), Coilblade (cost 4), Briar-band (cost 3), and Copperskiff (cost 4). The old idle-refresh branch picked Ironroot first and returned no plan because its later cost check rejected Ironroot; it never considered the three affordable and placement-legal cards. At tick 6,600, Coilblade, Briar-band, and Copperskiff were already affordable and legal at the unchanged refresh point.

## Focused change

For an idle lane refresh only, keep the existing durability ordering and select its first affordable card. The threat-response ranking, lane choice, deployment point, costs, 900-tick cadence, and all qualification caps remain unchanged. The regression exercises the real selected setup to tick 6,900, verifies the durable-but-unaffordable first candidate and 900-tick refresh condition, checks the canonical 600→300→600 replay, and submits the chosen card through the real session command path.

The completed pre-fix default-eight and Kilnkeeper trajectory comparison reported no first plan difference through their full runs. The exact observed values and trace hashes are recorded in `compatibility-comparison-observation.json`. Its raw stdout/stderr were not archived; that limitation is stated in the JSON. This is guidance for the independent critic, not a persisted raw proof packet.

## Scope and validation boundary

Only `tests/helpers/endurance-workload.js`, `tests/endurance-workload.test.js`, and this round's builder evidence are owned here. No product source, runtime mechanics, browser UI, setup bytes, or qualification caps were changed. The fresh browser qualification remains for a separate critic after the focused Node regression is checked.

## Node validation

The source/test snapshot is frozen at `0cf6e9d33b1247bc9fd0679b31082f30cc7239a4`. The focused regression passed 1/1 with direct exit 0 (`node-regression-corrected.*`, 27.1 seconds). The first focused attempt exited 1 because the test checked for the deployment event before advancing the session tick that materializes the accepted E2 command; that immutable output is in `node-regression-initial-failure.*`. The assertion now advances one tick and checks the event at its original 6,900 command tick.

The complete `tests/endurance-workload.test.js` run passed 9/9 with direct exit 0 (`node-contracts-remaining.*`, 35.7 seconds). The test-name exclusion pattern was not honored by Node's runner, so this command reran the focused regression along with the other eight contracts. Across the two successful commands, there were 10 test executions and 9 unique tests. No browser, build, or endurance qualification was run in this builder context.
