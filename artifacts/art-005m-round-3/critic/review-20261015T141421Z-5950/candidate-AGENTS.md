# Clash Royale Clone — Pre-Evolutions

## What this is
An open-source real-time card battler that should be mechanically
indistinguishable from Clash Royale as it existed before the March 2023
Evolution update.

## Hard rules
- Original art, original card names, original audio. Never copy assets,
  names, or text from the real game into the shipped product.
- Nothing in ./reference is ever imported, copied, or bundled. It is a
  comparison target only.
- Simulation must be deterministic: same inputs and seed produce the
  same outcome, every time. No wall-clock timing in game logic, no
  unseeded randomness. The whole verification approach depends on this.

## The bar
./reference holds the comparison target.
- reference/stats/cards.json, towers.json, arena.json — the numbers.
- reference/stats/SOURCES.md — provenance and confidence. Read it. Any
  value flagged low-confidence is not authoritative; treat a mismatch
  against it as a question, not a failure.
- reference/footage/ — real gameplay stills and clips for visual
  comparison.

## Verification
- `npm test` runs the interaction suite: known matchup in, documented
  outcome out. Every card interaction we claim to support needs a test
  derived from the stat tables.
- Visual work is verified by rendering our equivalent of a reference
  still and comparing them side by side.
- Source review alone never verifies anything. Run it or render it.

## How work proceeds
Work on this repo proceeds in build-and-critique rounds, delegated to
subagents. See .agents/skills/gauntlet-round/. PLAN.md holds the piece
list and their states; progress.html is the live view for the human.
Do not do the building and the judging in the same context.
