# ART-004 round 2 independent critique

**Verdict: FAIL on the exact reduced-motion restore requirement.** The candidate otherwise passes the focused unit suites and the authentic live attack/contact checks.

The independent real-Chrome run reached the phone in-app reduced-motion restore assertion and failed at `tests/combat-sprite-prototype-browser.test.js:864`. The 390×844 screenshot comparison found 5 differing pixels at `(105,700)` through `(105,704)`, with maximum channel delta 3. Those coordinates map to the Brassbolt card in the outer app iframe, outside the arena. The before/after PNGs have different byte lengths (330,760 vs 330,767) and hashes. Desktop 1440×900 reduced-motion restore was exact, and both phone and desktop normal-mode PNG restores were byte-identical. Because the artifact’s bar requires exact same-mode PNG restore, a phone-only outer-frame paint race still fails the bar even though the arena sprites themselves appear unchanged.

Focused runs: sprite prototype 10/10; UI combat state 13/13; game UI projection 28/28 (including the real Briar melee attack and terminal tick 18,000 functional case); visual asset manifest 6/6. The browser suite failed 1/1 only at the exact phone reduced-motion restore assertion after earlier real battle assertions passed. Actual phone team-color samples were 16 north / 22–25 south pixels per sampled marker; desktop samples were 27 north / 30–40 south. The attack and same-mode normal restore assertions passed in both app viewports before the reduced-motion failure.

The candidate commit modifies only the authorized UI projection/art files and focused tests; the pinned atlas is unchanged. No historical parity claim is made because no matching historical footage is available for this piece.

Raw TAP, command list, counts, current-run PNGs, team-pixel JSON, and the exact pixel diagnostic are alongside this file.
