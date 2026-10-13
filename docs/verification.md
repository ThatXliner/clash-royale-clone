# Verification evidence

The published browser build has sixteen cards. The repository has eighteen
reviewed editable choices, including two additional air swarms. Neither
result establishes historical Clash Royale parity or completes the planned roster.

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
seeds at three checkpoints. The published build does not include the latest two air-swarm choices.

A separate critic accepted editable integration at `a8c39bc`: 58/58 tests,
including real phone/desktop controls, trusted deployments for both swarms,
Coppershade's airborne projectile, and exact restore/replay. See the
[integration receipt](../artifacts/cards016-integration-round-2/critic/verdict.md).
A subsequent deployment-interval candidate is under review. The older
18,000-tick receipt above must not be treated as a fresh endurance result for
that changed runtime.

Some card statistics, formations and arena mechanics remain estimates or
explicit `QUESTION`s. The [completion inventory](completion-inventory.md)
tracks their scope. Earlier [restore paint-probe evidence](../artifacts/vis-003hr-round-2/debug/paint-probes.md)
is retained as a separate result.
