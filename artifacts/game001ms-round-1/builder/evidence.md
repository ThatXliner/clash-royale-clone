# GAME-001MS round 1 builder evidence

## Finding

The pre-change `npm run test:game-session` run exits 1 with 8/9 passing. The
only failure is the legacy assertion in `tests/game-session.test.js:73`:
`actual 1 !== expected 6`. The test submits Briar Band and calls `session.step()`
once, then expects every member to be live. That step processes only the opening
spawn boundary. CARDS-017T already accepts the sourced 100 ms interval, which is
six 60 Hz simulation ticks: Briar Band has one global sequence at relative ticks
`0, 6, 12, 18, 24, 30`. A focused probe on the shared session confirms its later
members appear at those ticks. This is a stale integration expectation, not a
new runtime regression.

## Gate change

The shared-session test now uses a literal, test-only expected-offset table for
all eight default cards. It advances through each staged boundary and checks
the state just before and after it. This keeps expected member counts and timing
independent of the runtime roster's count or interval fields. The only staged
default card is Briar Band; Cinderlings retains the Skeleton instant-expansion
exception, and six singleton cards remain one member at the opening boundary.

For every card, the test drives a real south player command and a real north AI
proposal at tick 0. A 1,000-tick AI think interval retains that initial proposal
while bounding the observation window before any second AI play can obscure the
deployment counts. It checks one commit, spend, and deck cycle per side; unique
deployment sequence and member IDs; and that every visible member ID and birth
tick belongs to exactly one committed deployment. It compares only birth tick
multiplicity, leaving historical component order and first-onset calibration
open. The existing 400-tick shared match still requires damage, a death, and
tower damage as evidence of actual later combat.

## Source boundary

The test delta was run against a clean archive of accepted source commit
`151f54b7a40a266100522c7bdb3e3fca39b9918f`, with the updated test file copied
into that archive. The candidate parent at freeze is
`ff7be6069e0c1edd068c5a3e01501b5167f12950`; comparison with `151f54b7` shows
only `PLAN.md`, `progress.html`, and the roster-scope artifact changed, with no
changes under `src`, `package.json`, or `tests/game-session.test.js`. CARDS-017T
records the generic 100 ms rule and six-tick conversion. Its accepted scope
leaves formation geometry, member order, collision adjustment, and first-member
onset as questions; this gate adds no claim about them. The Cinderlings count is
a functional roster fixture, not a confidence upgrade for the source corpus.

## Commands and receipts

- Pre-change full runner: `baseline-failure.tap` and `baseline-exit.txt`.
- Exact-boundary regression on the clean accepted source archive:
  `focused-boundary.tap` and `focused-boundary-exit.txt`.
- Full updated game-session runner on that same archive:
  `full-game-session.tap` and `full-game-session-exit.txt`.
- `test-delta.patch` is the owned source diff; this round changes no runtime
  source or unrelated tests.

The focused exact-boundary case passes 1/1. The full runner passes 9/9 in
79.5 seconds, retaining all eight other integration gates, including regulation,
terminal freeze, and restore continuation.
