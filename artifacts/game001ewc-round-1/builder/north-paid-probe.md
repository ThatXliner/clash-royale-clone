# North paid-deployment probe

The real-session probe output is retained in `north-paid-probe.stdout.raw`. The exact Node argv, environment, direct PID, Node identity, pre/post tracked-source manifests, raw stream hashes, and Git/source fences are in `/Users/me/.codex/clash-qualification/20261020-node-workload/attempts/20261020T151521Z-north-paid-probe/`.

Node v22.22.3, PID 28570, exited 0 after initializing the exact seed-zero endurance setup and advancing one 300-tick segment. The replay contained a North `session-deployed` receipt for `reedsting` at tick 0 with integer spend cost 3. The source fence passed. This verifies the additive North paid-receipt assertion on a short real-session prefix; the full test's additional South paid-gap assertion remains for the fresh full critic run.
