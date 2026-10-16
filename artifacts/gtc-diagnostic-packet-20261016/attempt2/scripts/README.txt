GTC golden-pin diagnostic preparation (file-only; not run)

Purpose
  Compare the actual source vintage behind the empty LiveBattle v2 pin and the
  status-hash pin against accepted source 5cc4d3e. Preserve original assertions;
  do not refresh any literal. The external scripts capture complete setup and
  snapshot structures, then report exact field and byte deltas. They remove
  only the identified source-confidence policies for briar-runner/briar-darter
  and the 20 QUESTION records named by those policies when performing a
  diagnostic equality comparison. All unfiltered and residual paths remain in
  the report. Historical/current status scenarios are copied from their exact
  test revisions into external capture-only test files; the six expected hash
  assertions remain intact. No project source or test was edited, and no
  Node/npm/browser/build/test process was launched during this preparation.

Historical provenance
  * GTC expected empty-v2 length/hash literals (11,618 / 874c2b8e...) are
    attributed by `git blame` to a8f432985a758144af6c29ff7e29174b05f8e6ee,
    where the assertion was introduced. The assertion itself says the literal
    was “captured from c9c818f”; use exact source vintage
    c9c818f7ac281b0e71890a2be17ce757f688b4c5 for the historical serializer
    probe. The first assertion commit is retained separately as a8f43298.
  * The status selector and all six replay/snapshot hash pairs were introduced
    together at 2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764. Its witness setup
    obtains `createSessionTroopWitness(id)`; its fixture roster is the eight
    playable cards, including Briar as a filler.
  * Static change locator: c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb adds the
    `briar-band` claims for `briar-runner` and `briar-darter` to
    `session-troop-source-confidence-authority.js`, projects those policies
    into playable-roster entities, then appends their 20 field QUESTION records.
    That is a plausible setup-byte cause in both target families, but the status
    hash relationship is not asserted as the same cause until a controlled run.
  * Parent-supplied MTC differential: old6a2→current69da added exactly 2,410
    Briar policy bytes plus 3,703 bytes across 20 QUESTION records (6,113 total);
    old/current public event logs, state, and snapshots with setup removed were
    byte-equal at ticks 120/200/320. This is recorded as external builder
    evidence, not independently reproduced here.

Current source identity
  Execution source pin: 5cc4d3e424661cf638c5dbea288836ef4419fcf0.
  Coordination checkout HEAD: 090d685a4fa07aa07c17618b1e18d00ecb63ff51.
  Before running, both recorders verify that src, scripts, package.json,
  package-lock.json, demo/assets, public/assets, and reference trees have equal
  Git objects at those two commits. They also verify the exact blobs for both
  targeted test/runner pairs. The only path under tests/ changed between these
  commits is tests/game-roster-troops-movement.test.js (the adopted MTC test);
  this packet makes no whole-tests-tree identity claim. See source-manifest.json
  for the original execution pin's source copies. The recorders create isolated
  sparse Git worktrees at the execution pins and never run from the dirty
  physical coordination checkout.

Deferred probe
  `probe-empty-live-battle.mjs` recreates the exact empty setup used by
  `tests/game-troop-runtime.test.js` (the literal battleSetup fields and the two
  playable-roster factories). Besides length/SHA it writes exact setup, roster,
  question records, pretty JSON snapshot and raw canonical snapshot bytes.
  `compare_fixture_views.py` produces unfiltered structural diff paths, exact
  added Briar policy/question records and byte counts, and normalized results
  after removing only those known fields. It compares the normalized current
  canonical snapshot to the old raw snapshot bytes.

  `instrument_status_test.py` makes an external copy of the exact historical or
  current `game-roster-troops-status.test.js`; it adds only output capture around
  the six-scenario loop and preserves its original hash assertions. The copy
  imports the pinned worktree's source via a `src` symlink. It records the setup,
  parsed setup witness strings, complete GameSession state, full replay property
  and replay bytes, and full snapshot bytes/object for each card. The comparator
  reports all replay/state/event/snapshot diffs, the snapshot with only its
  outer `setup` field omitted, and the separate setup contents. It parses only
  the known `setup.battleSetup` and `setup.rosterWitness` canonical strings and
  strips only the two identified Briar policies and their 20 QUESTION records;
  any residual structural difference remains visible.

After fresh-critic release and explicit root runtime grant, invoke the pin suite:
  python3 /Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/record_pins.py

Then use the `summary.json` run directory printed by that command for the
focused six-scenario capture and field comparison:
  python3 /Users/me/.codex/worktrees/gtc-golden-pin-diagnostic-5cc4d3/record_status_views.py <record_pins-run-directory>

The recorder will create four sparse, detached worktrees for c9c818f, a8f43298,
2a5bd7a4, and current 5cc4d3e (only root files plus src/ and tests/ are
materialized), record source copies/hashes and clean fences, then run serially:
  1. at a8f43298: npm run test:game-troop-runtime (original historical assertion)
  2. at c9c818f: the empty LiveBattle setup/snapshot capture
  3. at current 5cc4d3e: npm run test:game-troop-runtime
  4. at current 5cc4d3e: the same empty setup/snapshot capture
  5. at 2a5bd7a4: npm run test:game-roster-troops-status (all six original asserts)
  6. at current 5cc4d3e: npm run test:game-roster-troops-status

The second command then runs only the pinned six-hash test selector once at 2a
and once at current 5cc4d3e, in serial, against external capture-only copies,
and compares those results with the two empty-setup captures. Expected total
time is roughly 75-100 seconds including sparse worktree setup, the two full
status npm gates, and two filtered status probes; this is a bounded estimate,
not a measured result. No execution has happened yet.

Runtime will explicitly use Node 22 from /Users/me/.hermes/node/bin. Every
process will have separate complete raw stdout/stderr, direct PID and exit,
argv/cwd/env metadata, exact package/runner/test/source copies, and before/after
source fences. Status instrumentation captures its own exact source-copy and
capture-only diff; it does not change the pinned test file. The scripts do not
install dependencies, edit tests/source, refresh hashes, or filter fixture
names. All runs are serialized and capture continues through historical hash
assertion failures unless a source fence changes.
