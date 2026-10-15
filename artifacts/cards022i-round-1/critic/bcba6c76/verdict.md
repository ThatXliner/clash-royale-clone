# CARDS-022I critic verdict

- Candidate: `bcba6c76ec31215b6dac8208529a6c97b7274ca0` (parent `226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf`).
- Verdict: **FAIL**.
- Biggest gap: Brackenwheel’s visible detail panel presents unverified Health 1,908, Damage 267 per attack, Hit speed 1.5 s, Range 1.2 tiles, and Moves 1 tiles/s as bare numbers. The entity’s stat source is non-authoritative/question; the visible copy marks the melee-area rule as QUESTION but does not mark these fields, so the required visible uncertainty treatment is incomplete. The captured phone detail PNG and actual UI profile confirm this.

The authenticated gameplay path otherwise passed the requested real browser checks: Chrome 155.0.8059.40; trusted player drop and unforced seed-2 AI Brackenwheel deployment; contact at tick 234 produced 267 primary damage and three 267 secondary hits carrying `melee-area-question-v1`; real nonempty serialized bridge and presentation checkpoint equality across automatic paused resize; all four actual before/after-restore PNG pairs byte-equal at phone 390×844 and desktop 1440×933 in normal and reduced motion; natural terminal/restart preserves the exact custom eight-card deck and seed 2 with tick 0 and restart count 1. The actual CARDS-022 browser run was 1/1 pass; UI/support Node gates were 45 pass and one optional parent-root skip; native Chrome release-build 22/22 and shipping isolation release 4/4. Do not describe this as full historical or 18k-run parity.

The unknown profile semantics remain questions, and low-confidence reference values were not used as failure evidence. CARDS-023D remains a separate piece and is not evaluated here.
