# Completion inventory

The first-release target is a deterministic pre-Evolutions 1v1 card battler
with a browser game and a JavaScript/RL interface. This inventory records
current, scoped evidence and open release gates; it does not certify full
historical parity or a public release.

Future online work is tracked separately: issue #1 covers accounts, #2 ranked
modes, and #3 clans. Matchmaking and other server-backed services are also
outside the current source.

## Current coverage

| Measure | Current state | What it proves |
| --- | --- | --- |
| Historical roster | 109 identities: 78 troops, 13 buildings, 18 spells | Size of the pre-Evolutions comparison target, not implemented coverage |
| Editable collection | 16 admitted identities: 15 troops and Squall Orb; the default deck remains 8 cards; latest two troops pass scoped runtime review; phone detail portrait revision remains open | Deck admission and selection. It does not mean every card has complete historical behavior |
| Session card catalog | 53 admitted identities and 58 admitted source occurrences: 37 troop identities across 39 troop occurrences, 8 structures, and 8 effects | Typed identity admission and source routing, not complete gameplay for every identity |
| Historical comparison mapping | The test-only [card-coverage-109.json](../artifacts/completion-inventory/reference/card-coverage-109.json) remains the 11-mapping `42bcf09` baseline | Historical mapping evidence only; it has not been refreshed for the current 16-card admitted collection |

The comparison artifact contains historical card names and keys. Keep it out of
runtime imports, release builds, and the Pages site. The confidence ledger in
[`reference/stats/SOURCES.md`](../reference/stats/SOURCES.md) identifies
unverified fields; those values are questions, not authoritative mismatch
gates.

## What current evidence covers

The browser interface has Home, Deck, Cards, and Battle views. It supports
editing an eight-card deck from the current collection and playing a
deterministic match against the computer. Actual browser evidence covers
supported selection, deployment, spending, hand cycling, restore, terminal,
and restart journeys. These journeys do not establish full roster parity.

The current editable collection admits 15 troops and one narrow Squall Orb
radius profile. `GAME-SPELL-001` passed its scoped 48/48 review: the shared
session and browser path support a center-targeted radius cast, damage, spend
and cycle, pending impact, and exact restore. The profile uses a 2.5-tile
radius, and its radius and policy facts remain QUESTION values. Flight,
knockback, and a complete historical spell composition remain outside that
result. See the [independent release-guard evidence](../artifacts/release-guard-round-1/critic/round-1-evidence.md)
and its [browser captures and receipts](../artifacts/release-guard-round-1/critic/app-shell/browser-evidence.json).

Cinder Host and Ironroot have a separate core review with 85/85 checks passing
for their ordinary swarm and heavy-melee encounter. Their unverified source
fields remain explicit QUESTIONs. The browser critic then found that the
visible card summary stated ground/melee facts while the same card detail
marked those fields unknown. The scoped round 2 copy review now passes: actual desktop and phone profiles
state the implemented classification consistently while retaining provisional
source wording. This does not establish complete historical behavior. Evidence: [core review](../artifacts/cards-expansion-round-2/critic/verdict.md)
and [browser review](../artifacts/cards-expansion-round-2/critic-browser/verdict.md).

Sunthread Pair and Duskwing Trio are admitted to the editable runtime in
`9b5afa1`, with original painted portraits and provenance. Builder checks
cover squad deployment, projectile contact, natural AI selection, RL actions
and exact custom-deck restore. Independent core/API review passes64/64, and the production package qualifies.
Actual desktop/phone lore, controls and current-game statistics render correctly;
phone details currently omit the selected portrait, so ART-015 remains open. Projectile-speed conversion and the inferred air layer
remain QUESTION policies; admission and prepared art do not establish full
historical behavior.

The RL wrapper uses the real match session and accepts an editable deck. Its
action set is wait plus tile-center choices for four hand slots; effect cards
are routed as spell commands through the shared session. This supports the
current narrow radius profile without establishing support for every card or
spell phase. Isolated mechanics suites cover additional movement, projectile,
shield, status, death, building, and spell rules, but an isolated fixture does
not establish that card's complete interaction in a match.

The [session-card admission test](../tests/game-roster-admission.test.js) and
[troop profile manifest](../src/content/session-troop-profile-catalog.js)
distinguish admitted identities from full card execution. QUESTION-only
claims remain excluded from admission. The broader unified roster mechanics
work is still split into independently scoped pieces; admission counts are not
a substitute for their completion.

## Open release gates

| Gate | Current state |
| --- | --- |
| Full roster and source mapping | Open. The historical target has 109 rows, while the checked-in comparison mapping is still the 11-card `42bcf09` baseline. Every selectable card still needs source-backed behavior and explicit open questions. |
| Complete card execution | Open. Current evidence covers specific profiles and encounters; it does not cover all card abilities and interactions through shared `GameSession` against the opponent. |
| Deck and browser journey | Open. Current browser evidence proves supported routes, but release qualification requires the full supported collection and complete deterministic match, restore, and restart journeys on the exact staged artifact. |
| AI and RL | Open. The wrapper shares the current deck and spell route, but complete action and observation support for every released card is not established. |
| Strict full-match endurance | Failed at frozen source `9e667a1`. The full run reaches tick 18000 and verifies exact restore, terminal and restart under the unchanged caps, but fails its final console assertion on 122 painted-sprite 404 errors. Earlier timing failures and historical passing runs remain evidence for their respective revisions only. See the [strict run record](../artifacts/game-001gpr-round-1/critic/endurance-result.json). |
| Public hosting | Not verified as published. The repository's Pages workflow is manual; a maintainer must enable Pages and run it, then verify the live URLs as described in [publishing.md](publishing.md). |

## Next implementation work

First resolve the current endurance restore overrun, then rerun the unchanged
18,000-tick browser journey through terminal and restart. Preserve the independently verified Cinder Host and Ironroot copy correction
and its visible QUESTION status. Fix the live sprite URL and rerun complete
qualification with no missing resources. Keep the existing 11-mapping artifact
as a historical baseline; any current mapping should be recorded as a new,
versioned artifact with explicit evidence instead of treating that baseline as
the current 16-card admission coverage.

## Release evidence bar

| Area | Required evidence |
| --- | --- |
| Roster and source | A test-only mapping for the 109-row comparison target; original product names, art, and audio; authoritative fields and open QUESTIONS called out; no comparison names or `reference/` bytes in runtime, release, or website |
| Card execution | For every selectable card: source-backed cost and targeting, all claimed abilities, opponent execution, hand cycle, spend, terminal effects, and deterministic restore in shared `GameSession` |
| Deck and UI | Eight unique choices from the fully supported collection; every supported kind has accessible selection and target/deploy controls; desktop and phone browser proof covers complete match, restart, and mixed-card deck changes |
| AI and RL | Opponent execution, deck options, legal-action mask, targets, observations, and snapshots represent the same supported rules |
| Release | `npm test`, `npm run build:pages`, `npm run test:publication-pages`, release-isolation checks, and actual Chrome at the project subpath pass on the exact staged artifact |
| Public hosting | Enable Pages, run the manual Pages workflow, and verify the live landing page and game URL after deployment |
