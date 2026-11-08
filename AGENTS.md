# Moss & Ember

## What this is
An original, open-source real-time lane card battler. Its core rules sit
in the same genre as the classic mobile lane battlers: elixir that
refills on a timer, a hand of four from an eight-card deck, two lanes
and a river, crown towers, three-minute matches with overtime. Its
cards, balance, arena, art and audio are our own.

Direction changed on 2026-11-07. The earlier goal of being
indistinguishable from one specific commercial game is retired. Do not
add card-for-card stat copies of that game's roster, match its arena
layout or art, or compare our frames against its footage. PLAN.md pieces
whose only bar was historical parity are retired, not failing.

## Hard rules
- Original art, original card names, original audio, original card
  designs. Never copy assets, names, text or per-card stats from another
  game into the shipped product.
- Nothing in ./reference is ever imported, copied, or bundled. It may
  calibrate genre-level rules (elixir rate, match timing, arena scale),
  never individual cards.
- Simulation must be deterministic: same inputs and seed produce the
  same outcome, every time. No wall-clock timing in game logic, no
  unseeded randomness. Rendering may interpolate on wall-clock time, but
  must never feed back into the simulation.

## The bar
- Mechanics: rules feel familiar to a genre player, and every card has a
  clear role and counters. Balance is judged by AI self-play through the
  RL API (docs/rl-api.md), not by matching outside stat tables.
- Art: a cohesive, readable, attractive original look on phone and
  desktop. The current priority is a real-time three.js battlefield
  (lit, stylized low-poly) replacing the flat DOM/sprite arena. Judged by
  blind A/B against our own previous render, plus a readability check at
  phone size: can you tell every unit, side and tower state apart?
- Product: the shipped browser game is playable start to finish against
  the AI with no errors in the console.

## Verification
- `npm test` must stay green. Mechanics changes need deterministic tests.
- Visual work is verified by rendering it in a real browser (Playwright)
  and looking at the screenshots. Source review alone never verifies
  anything. Run it or render it.
- Critics are harsh but judge what a player would notice. A
  1-channel pixel delta is not a gap; an unreadable unit is.

## How work proceeds
Work proceeds in build-and-critique rounds delegated to subagents. See
.agents/skills/gauntlet-round/. PLAN.md holds the piece list and states;
progress.html is the live view for the human. Do not do the building and
the judging in the same context. Keep rounds small and shipped: commit
each accepted round to main. Commit only a handful of key screenshots
and the verdict per round (a few MB at most); leave bulk captures and
logs out of git.
