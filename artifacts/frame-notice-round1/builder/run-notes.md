# Builder run notes

## Browser-window overlap

`npm run test:game-browser-roster-witness` was launched while preparing this
candidate under the mistaken assumption that it was Node-only. It launched a
Chrome browser and overlapped the active browser/CPU workload. The run exited
successfully in approximately 15.8 seconds, but it is not a performance
measurement and must not be used to support a performance claim. Its six
generated game-001huik artifact files were restored to the private checkout's
accepted `095a8c55` baseline afterward. No roster-witness source or test file
was changed for this candidate.

## Accepted-095 loop baseline

The Node-only `npm run test:game-browser-loop` baseline produced 10 passing and
4 failing assertions. Each failure was the existing 2-versus-1 listener count
expectation in the loop tests (test locations 227, 281, 310, and 354). The
parent task classified these as the known GRG450 fixture defect. This candidate
does not edit the loop or projection tests. Keep this baseline separate from
the policy-notice browser receipts; it does not establish a notice regression.

## Policy-notice red baseline

See `notice-red.tap` and `notice-journey-evidence.json`. The authentic browser
journey had three stale-notice failures after restoring Ember Basin (sync and
yielding paths) and the default eight-card roster. Exact session, browser
snapshot, and audio-continuation bytes matched each requested restored source.
Forged policy restore was rejected transactionally, and return to Buried Coil
and same-deck restart retained their notice. These are preserved as the
pre-fix browser baseline.
