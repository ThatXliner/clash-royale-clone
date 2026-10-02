# Restart diagnostic evidence

Production candidate: `700feed3ffd12f1f317c6da1922ae721a8f2220c`.

These are diagnostic probes using the actual 319,566-byte terminal session
checkpoint from the previous full endurance run. They are not acceptance
evidence for the full browser/audio lifecycle.

The 8,000 ms budget in `bounded-terminal-restore.mjs` covers the whole worker
operation: module imports and initialization, checkpoint parsing,
`GameSession.restore`, state inspection, reserialization, and audio replay
inspection. A timeout therefore cannot be attributed to restore alone or to
any one of those stages.

The pre-fix instrumented restart measured audio-policy capture at 43.1 ms,
setup extraction at 2.5 ms, cleanup at 0.6 ms, fresh session construction at
5.4 ms, and graph construction at 20.7 ms. Explicit terminal serialization
took 0.2 ms and its setup JSON parse took 0.9 ms.

The candidate reads the runtime snapshot once per controls snapshot and the
controls snapshot once per restart, without a persistent cache. The reduced
post-fix probe remained **FAIL**: a 208 ms task exceeded the unchanged 50 ms
cap. Its remounted audio lifecycle differs from the real journey, and its
post-restart observation saw tick 1 because autoplay was enabled. Do not use
it to claim exact restart or full endurance success.

The separate full 18,000-tick acceptance check later passed in the independent
GAME-001GPVT R3 run on candidate `3bf8ae6`; that result does not change the
scope of these reduced diagnostic probes.
