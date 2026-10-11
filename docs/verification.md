# Verification evidence

This is a playable sixteen-card prototype. It does not establish historical
Clash Royale parity or complete the planned roster.

An independent critic tested clean runtime candidate `7cb3143`. The full
18,000-tick Chrome match passed through terminal and restart in 802,798 ms,
with exact restore, input and audio continuation. The unchanged limits were
50 ms for lifecycle work and 300 ms for initialization; initialization reached
158 ms, and no lifecycle long tasks were recorded. Resource and runtime error
lists were empty. See the [current independent receipt](../artifacts/ship-current-round-1/critic/verdict.md)
and its [endurance evidence](../artifacts/ship-current-round-1/critic/endurance/).

The same review passed the browser journey, deck screens, JS/RL environment,
source-isolation guards, confidence metadata and original portrait checks.
Default-deck snapshots matched the earlier baseline byte-for-byte for two
seeds at three checkpoints. Two additional air-swarm roles are reviewed in
the simulation but are not yet selectable in the public collection.

Some card statistics, formations and arena mechanics remain estimates or
explicit `QUESTION`s. The [completion inventory](completion-inventory.md)
tracks their scope. Earlier [restore paint-probe evidence](../artifacts/vis-003hr-round-2/debug/paint-probes.md)
is retained as a separate result.
