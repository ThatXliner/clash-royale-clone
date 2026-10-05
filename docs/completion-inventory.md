# Completion inventory

First-release scope: a complete pre-Evolutions 1v1 battle roster against the
existing deterministic computer opponent, a public GitHub Pages browser game,
and a JavaScript/RL interface. Accounts, matchmaking, ranked modes, clans, and
other online services are future work.

The exact historical comparison rows and the 11 explicit runtime mappings are
in the test-only artifact [card-coverage-109.json](../artifacts/completion-inventory/reference/card-coverage-109.json).
That artifact contains benchmark names and keys. It must stay out of runtime
imports, release builds, and the Pages site. `reference/stats/SOURCES.md` is the
confidence ledger; its per-field `unverified_fields` remain questions, not
authoritative mismatches.

## Current coverage

| Measure | Current state | What it proves |
| --- | --- | --- |
| Historical roster | 109 identities: 78 troops, 13 buildings, 18 spells | Comparison target size, not implemented coverage |
| Editable/playable collection | 11 identities: 8-card standard deck plus 3 replacements | Cards reachable from the product collection and deck editor; exact test mappings cover these 11 |
| Session catalog | 49 admitted identities: 33 units, 8 structures, 8 effects; 54 admitted source occurrences | Identity admission and typed routing only. It does not prove a complete card profile or gameplay for each identity |
| Troop projection manifest | 33 admitted unit identities; 31 ordinary-unit session witnesses are exercised by `GAME-001HTO` | Ordinary projections and QUESTION closure, not special abilities or full historical behavior |
| Remaining comparison rows | 98 are outside the editable collection | Some have isolated mechanics or session claims; none counts as a complete selectable card from that fact alone |

The current code and `tests/game-roster-admission.test.js` report 49 session
identities and 49 deck witnesses. The `GAME-001HA` row in `PLAN.md` still says
47 witnesses; reconcile that stale count before using it as a release metric.
Some catalog identities have several source occurrences, so the occurrence
count is not a card count. The catalog also has six excluded QUESTION identity
claims and five question-only mechanics exports.

## Executable product and isolated mechanics

The shipped interface has Home, Deck, Cards, and Battle views. A player can
edit an eight-card deck from the 11-card pool, start a deterministic match
against the computer, deploy a troop, spend and refill elixir, cycle the hand,
and complete or restart a match. The existing match, AI, replay, and browser
journey evidence applies to those supported journeys and profiles.

The session core has typed unit, structure, and effect routes. A test-only
mixed `GameSession` witness composes a structure, ordinary troops, and a narrow
instant-effect profile. The existing effect receipt allows 689 damage to a
caller-selected shared unit only; area targeting, crown damage, and the other
spell phases remain excluded. The Bulwark Needle browser witness exercises a
real structure route, but its current profile executes first-hit and Cannon-like
estimates that `GAME-001HUIB` marks QUESTION. Neither witness establishes a
parity-ready spell or building for general deck play.

Mechanics suites cover many special movement, projectile, shield, status, death,
building, and spell rules in isolated encounters. The full champion ability,
duplicated charge/reflection compositions, periodic/status spell composition,
travelling/wave/return spell composition, and spawner-building route remain
blocked or QUESTION in `PLAN.md`. A passing isolated suite proves that fixture's
mechanic; it does not put that card into the browser deck or prove its full
match interaction.

The RL wrapper uses the real match session, seeded opponent, and an allowlisted
observation. Its action space currently covers wait plus tile-center deployment
for four hand slots; it does not expose a general spell target action. The
documented environment uses the same eight-card roster constraints as the
current setup. Deck editing and action support must grow with the card runtime.

There is no account, matchmaking, ranking, clan, collection progression,
upgrade economy, chest/reward, shop, or server-backed persistence flow in the
current source. Those are excluded from this first release; they should not be
implied by the README or Pages landing page.

## Next implementation batch

The highest-value ordinary-runtime batch is to connect the existing 31
`GAME-001HTO` troop projections to the editable deck and collection surfaces,
then exercise selection, AI play, restore, and RL setup through that same
source-owned deck compiler. Keep ordinary projections and their explicit
QUESTION estimates visible as incomplete mechanics; do not claim a card's
special ability until its shared-session composition is source-backed and
executed. The two additional editable squads are already included in the
current 11-card pool.

For non-units, extend the source contract before widening the editor. The
current instant-effect receipt is a one-unit damage seam, and the current
defensive-building witness has unverified combat policy. The repository needs
an exact profile receipt, complete GameSession action, typed browser input,
deck admission, and end-to-end match evidence before either family is counted
as playable. The radius-cast v2 foundation currently underway preserves the
v1 estimates; by itself it makes no travel or knockback parity claim.

## First-release gates

| Gate | Required evidence |
| --- | --- |
| Roster and source | A test-only 109-row mapping; every shipped identity has original product names/art/audio; authoritative fields and open QUESTIONS are explicit; no comparison names or `reference/` bytes enter runtime, release, or website |
| Card execution | For every selectable card: exact source-backed cost, deployment/target policy, all claimed abilities, opponent execution, hand cycle, spend, terminal effects, and deterministic restore in shared `GameSession`; no silent placeholder troop or caller-authored policy |
| Deck and UI | Eight unique choices from the full supported collection; all kinds render and have accessible select/target/deploy interactions; real Chrome proof covers desktop and phone, complete match, restart, and mixed-card deck changes |
| AI and RL | Opponent can select and execute all supported card kinds; RL deck options, legal-action mask, spell/building targets, observations, and snapshots represent those same rules |
| Release | `npm test`, `npm run build:pages`, `npm run test:publication-pages`, release-isolation checks, and actual Chrome at the project subpath pass on the exact staged artifact |
| Public hosting | Enable Pages with GitHub Actions, run the manual Pages workflow, and verify the live landing page and game URL after deployment |

Useful independent acceptance commands for the current seams include
`npm test -- game-roster-admission`, `npm test -- game-shared-runtime-integration`,
`npm test -- editable-deck`, `npm test -- game-browser-journey`,
`npm run test:rl-environment`, and `npm run test:publication-pages`. They are
scoped checks; they do not replace the complete first-release gates above.

## Repository and Pages readiness

Read-only GitHub inspection found the repository is **public**, `main` is its
default branch, and it has no homepage URL. The Pages API returned 404 and no
Pages workflow runs are listed. `.github/workflows/pages.yml` is manual-only
(`workflow_dispatch`); `docs/publishing.md` correctly says a maintainer must
enable Pages and run it. Local build or preview evidence is not a live
publication. No publication was performed during this audit.
