# CARDS022I Round 2 builder packet

Base: accepted main `f9fdd229c2e7c560069344f82034a68afc2d3eaa` in a detached
private checkout. The ten R1 source/test files were imported from
`bcba6c76ec31215b6dac8208529a6c97b7274ca0`; the eight paths outside
`src/ui/app-shell.js` and `tests/app-shell.test.js` remain byte-identical to
that R1 source fence (`source-identity-r2-prebrowser-04.json`).

R2 changes only those two R1 paths. The UI builds a per-card cache from
`createSessionTroopWitnessQuestions`, follows each visible stat's declared
source field (or damage policy) to its receipt, and appends ` (QUESTION)` only
when that receipt is non-authoritative, unverified, and has question
disposition. The elixir cost is not part of the stat-field map. The focused
app-shell assertion derives expected labels from the same field-to-receipt
mapping and compares Brackenwheel's receipts against the exact receipt records
in an editable eight-card setup containing that card.

`canonical-question-probe-attempt03.stdout` records the successful Node-only
receipt/setup comparison. Syntax checks for both changed JavaScript files pass
under Node `v22.22.3` (`syntax-attempt07.json`). Attempts 01 and 02 are retained
with separate output and exit metadata; they failed because the probe initially
treated the setup's canonical JSON string as a parsed object. They are probe
failures, not product-test results.

`visible-stat-receipt-scope-attempt01.stdout` records the policy-key scan for
all 19 troop cards in the admitted collection. It finds canonical question
receipts for the added provisional troop fields and no visible-stat receipts
for the source-projected default units, so the disclosure is driven by each
field's policy key rather than a blanket label.

This packet records the pre-browser checkpoint. The assembled source was later
tested on accepted base `52718dd61252ee2b41cdaf73d9b9be3b18f5f80d`; actual
attempts, browser captures, guard/release results, and source fences are in
`final-gates-52718/summary.md` and its adjacent raw evidence files.
