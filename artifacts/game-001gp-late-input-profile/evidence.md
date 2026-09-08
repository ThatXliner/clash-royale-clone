# Late-match presentation profile

The full round5 endurance attempt failed at tick16200 after802.667s, with55ms and51ms browser tasks. Both task start times precede the final segment's startedAt, so they do not identify its single-tick simulation slices as the cause. Terminal and restart were not reached.

fixture.mjs replays the exact GH setup and accepted command IDs from continuation-final-result.json to tick15900. fixture.json completed before the interruption. profile.mjs restores that snapshot through GameSession in Chrome and measures30 real UI frame creation/commit transactions. This isolates presentation cost; it does not reproduce the physical input transaction or prove the cause of both long tasks.

Before the snapshot allocation change: cold frame total46.7ms, warm31.0–37.7ms. CPU cumulative samples across30 frames: createGameUiFrame936ms, projectionSnapshot460ms, snapshotFromState237ms, of which clone203ms. All30 isolated frames stayed below50ms, but history copying leaves little room for the surrounding input transaction.

The scoped change freezes each detached normalized record at admission, then copies and freezes only the snapshot array. The existing private snapshot brand and external validation remain unchanged. No records are modified after append; forks own separate arrays of immutable records. Protocol tests must prove retained-snapshot and branch independence plus exact canonical bytes.

result-before.json and cpu-before.json preserve the baseline. The original profiler completed measurements but hung during browser.close; its owned process tree was stopped after evidence was written. The diagnostic cleanup now closes the page explicitly before the browser.

After record sharing, the same30-frame Chrome probe exits0: cold47.4ms,
warm28.7–36.0ms. snapshotFromState is no longer a significant sampled cost;
projectionSnapshot falls from460ms to258ms across30frames. Total sampled
frame creation falls936→881ms. Other work varies and dominates the remaining
cost: serializeCombatEffectsViewModel241ms, including210ms canonicalJson.
These results support eliminating repeated canonical serialization of the same
immutable event records before the next full endurance attempt. The new scope
is a private per-record byte cache in the canonical effects serializer, keeping
identical output and byte limits. result-shared-records.json and
cpu-shared-records.json preserve this intermediate measurement.

Final production probe on0269fed exits0:30/30 presentations below50ms.
Cold35.6ms, warm17.8–23.1ms, compared with baseline46.7ms cold and31.0–37.7ms
warm. The final result.json/cpu.json capture both changes. Builder tests pass
combat-effect-protocol11/11 and ui-combat-effects10/10. Fresh independent
round6 endurance is required before claiming the full performance gate.
