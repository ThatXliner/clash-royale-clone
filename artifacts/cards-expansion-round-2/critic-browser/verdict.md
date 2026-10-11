# CARDS-013 actual-browser critic verdict

**Candidate:** frozen Git archive of `bccd0a979aad430b44905a2aec002fc7a4369930`.

**Verdict: FAIL.** The actual Chrome flow works: Cinder Host and Ironroot details, original portraits, lore, and stats render at desktop and phone sizes; both are selectable in the eight-card editable deck and appear in the launched hand. Trusted point input deploys Cinder Host as 15 members for 3 elixir and Ironroot as one member for 7 elixir. Serializing, restoring, and serializing again returns an exact match; the journey reports no browser console errors. Raw evidence is in [cards-browser-evidence.json](cards-browser-evidence.json), the run output is in [browser-cards-check-output.json](browser-cards-check-output.json), and the actual detail/deck/battle screens are captured in the adjacent PNGs.

The card details contradict their own confidence note. For both cards, the visible summary says **“Ground unit · melee attacks · targets ground.”** The statistics section beneath it says **“Targets ground. Attack type and whether it flies are not listed.”** The roster records the layer and delivery policies as QUESTION, so the first sentence presents those uncertain classifications as facts. The desktop/phone detail captures show the contradiction; the evidence JSON records the summary and the source runtime stats. This fails the review bar for honest confidence even though selection, deployment, and restore succeed.

**Biggest actionable gap:** make the visible card summary respect the QUESTION policies, so it does not state “Ground unit” or “melee attacks” while the same panel says those fields are unknown.
