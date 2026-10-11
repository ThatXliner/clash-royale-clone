# CARDS-015 / ART-015 independent critic verdict

## Frozen input and method

- Reviewed source commit `9b5afa15f26a32f7c67cf5c9c66185c3e4971d72`, extracted with `git archive` to `/tmp/cards015-critic-9b5afa15`; the only dependency link points to the checkout's `node_modules`. No implementation files were changed.
- Built the production release from that archive at `/tmp/cards015-critic-release-9b5afa15`. The generated package contains 53 files totaling 8,134,132 bytes. Its qualification reports 53/53 local requests HTTP 200, no runtime errors, and successful RL reset/step/restore and arena attachment.
- Reviewed the actual release in Playwright 1.58.2 / headless Chrome at 1440×933 and 390×844. Browser and server were closed after capture; evidence log records browser completion with no failures or bad responses.

## Catalog and behavioral coverage

- The visible editable collection has 16 entries: 15 troops plus the Squall Orb spell. The editable troop catalog is 15; the shipped default playable deck/roster remains 8. Sunthread Pair and Duskwing Trio are selectable collection cards and are absent from the unchanged default eight.
- Core/API command: `node --test tests/game-roster-troop-profiles.test.js tests/game-roster-troops-ordinary.test.js tests/game-roster-troops-projectile-profiles.test.js tests/editable-deck.test.js` — 63/63 passed, 0 failed, duration 83.815 s. It covers exact profiles, editable eight-card setup, unchanged standard setup, both new squads trading sourced air/ground projectiles through an in-flight restore, forged restore rejection, deterministic restore continuation, and the seeded opponent choosing both new squads through typed receipts.
- Focused RL command: `node --test --test-name-pattern='RL reset and legal mask deploy both sourced projectile squads with exact deck restore' tests/rl-environment.test.js` — 1/1 passed. Both cards deploy through legal masks and restore with the exact deck and typed receipt.
- The core coverage is strong for the requested collection/deck/player/opponent/RL paths. `tests/app-shell.test.js` in frozen commit still pins the earlier collection IDs and portrait set and omits these two cards. That is a stale test fixture; it was not used as runtime evidence. A separate candidate fixture passed elsewhere, but that result is not attributed to frozen commit `9b5afa15`.

## Provenance and historical-confidence treatment

- `reference/stats/SOURCES.md` says the pinned February 2023 corpus is a historical reconstruction and that per-card `unverified_fields` are non-authoritative. Builder source evidence maps Sunthread Pair to the Archers rows and Duskwing Trio to the Minions rows; most runtime mechanic fields remain listed in `unverified_fields`.
- The implementation uses numeric values as current playable estimates, while projectile speed and layer remain explicit QUESTION records. The actual card panels label their figures `Current game` and explicitly call each layer provisional for historical comparison. I found no presentation that asserts those displayed runtime numbers are historically verified facts. This satisfies the provenance bar; no historical mechanics parity is claimed by this verdict.

## Actual browser evidence

- The production collection rendered 16 cards. Both new portrait assets decoded at 512×512 and were visible in the phone collection; all requested assets returned successfully. Browser review recorded 0 page/console/request failures and 0 bad responses.
- At desktop 1440×933, both information panels rendered the correct title, two-sentence lore, current-game classification, count, health, damage, hit speed, range, targets, and movement values. The selected card portrait remained visible in the adjacent collection grid. Panel bounds fit within the viewport; page content has no horizontal overflow.
- At phone 390×844, both panels rendered the same complete lore and stat information, with no horizontal overflow or clipping. Sunthread's panel bounds are x=12, y=83, width=366, bottom=633; Duskwing's are x=12, y=83, width=366, bottom=602. However, selecting a card switches to a detail-only view and removes the collection grid; the info panel itself has no portrait. `portraitInDetailPanel=false` and `selectedCollectionPortraitVisible=false` for both phone captures. The phone collection screenshot shows both portraits decoded and visible before selection, but the actual phone info panel does not.
- The gap is directly located in frozen source: `src/ui/app-shell.js` `renderCardDetails()` (lines 218–231) builds the detail heading, description, lore and stats without `artMarkup(card.id)`, while the mobile rule in `src/ui/app-shell.css` (lines 363–368) hides `.card-grid` after `data-detail-open=true`. The collection card template uses `artMarkup()` at `app-shell.js` lines 165–168.
- Screenshots: `collection-390x844.png`, `sunthread-pair-desktop-1440x933.png`, `duskwing-trio-desktop-1440x933.png`, `sunthread-pair-phone-390x844.png`, and `duskwing-trio-phone-390x844.png`. Structured browser values and bounds are in `browser-review.json`.

## Verdict

- **CARDS-015: PASS, scoped to implemented/tested behavior.** Editable 15-troop/16-mixed collection behavior, preserved default eight, typed deployments, source-linked projectile handling, deterministic in-flight restore, opponent selection, RL legal-mask deploy and restore, and release qualification all passed. Values flagged unverified remain explicitly non-authoritative; this is not historical parity certification.
- **ART-015: FAIL / revision needed.** Original portraits and lore have provenance and production mappings, and the real desktop selection view shows the selected portrait beside the panel. At phone size, the actual info panel has no portrait, so the requested portrait/lore review does not pass in that viewport. The stale `app-shell` fixture also needs updating before the frozen source's standard app-shell test can serve as regression coverage.
- Biggest gap: show the selected card's portrait in the 390×844 detail panel, then rerun the actual phone view and update the app-shell fixture. No source edits were made during this critic pass.
