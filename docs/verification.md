# Verification evidence

This remains an active prototype, not a parity release. An independent critic
passed candidate `948eb63` on the original 140-tick Bulwark building-choice
restore: the 720×1280 full-viewport PNGs were byte-identical after restore. The
seeded 18,000-tick browser journey also passed through terminal and restart in
816,382 ms across 61 segments. It recorded a 172 ms maximum initialization
task (below the 300 ms cap), no non-initialization collection over 50 ms, and
completed below the 1,200,000 ms duration cap. The journey verified the exact
319,566-byte terminal session, all 3,513 audio records, and exact restore,
input, and restart state. See the [VIS-003HR paint-probe evidence](../artifacts/vis-003hr-round-2/debug/paint-probes.md).
These results cover only the tested restore and seeded endurance journeys;
they do not establish general game parity or independently verify other
balance candidates. Some card and arena mechanics remain estimates or explicit
`QUESTION`s in their source and provenance records.
