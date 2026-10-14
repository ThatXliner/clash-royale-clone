# Next playable-roster batch scope

This is a test-only planning artifact. The comparison names and values below must stay out of shipped content. The shortlist has two roles; I am not adding weaker candidates to reach a quota.

## Evidence boundary

`PLAN.md` defines the first release as the complete 109-card pre-Evolutions roster against AI and says isolated catalog or encounter tests do not establish a playable card. `docs/completion-inventory.md` likewise distinguishes comparator declarations and admissions from full historical execution. The frozen 109-row map has 11 `currentEditableMatch` entries and records no completed historical-card execution; the later `completion-inventory-current-16` snapshot is pinned to `6dcf64b`, so it is not evidence for the live `6cc8656` core or the current tested-roster count.

For the active work baseline I use the parent task's report: 19 tested shared roles, with Kilnkeeper as provisional role 20 under review, followed by H1 homing work. The checked-in inventories remain useful for identities and comparator joins, not as a current completion count. `reference/stats/SOURCES.md` rates the pinned 2023-02-18 roster/cost/rarity/type fields high confidence and character combat constants medium-high as datamine values; each card's `unverified_fields` remains a QUESTION. Its “Known limitations” also says abilities such as shields, charge/dash, death effects, lifetimes, and buffs are outside the common stat schema. No blank field or catalog omission below is treated as proof that an ability does not exist.

The real admission route is `src/content/session-troop-profile-catalog.js` → `src/content/session-troop-roster.js` → `createEditableGameSessionSetup()` in `src/content/editable-deck.js` → `GameSession` from `src/sim/game-session.js`. That setup gives both sides the selected deck and supplies every selected card as a legal north-AI deployment candidate. `src/rl/environment.js` calls the same setup builder and constructs the same `GameSession`. A catalog or private encounter export is therefore only supporting evidence, never acceptance.

## Recommended candidates

### 1. Elite Barbarians — smallest safe next implementation

Historical source identity: `id=26000043`, key `elite-barbarians`; common troop, cost 6. The frozen 109-row map has `currentEditableMatch: null`; the current-16 comparator list also has no comparator for this row. There is no existing admitted historical join to count twice.

The full normalized source signature is two identical ground melee units: 1,341 HP, 384 damage, 1.4 s hit cycle (84 ticks), 0.9 s first hit (54 ticks), 1.0 s deploy time (60 ticks), 1.2-tile reach (1,200 millitiles), 6.0-tile sight (6,000), 1.5 tiles/s movement (1,500), ground targets, count 2, and no area radius. Every non-null combat field is in this row's `unverified_fields`; preserve those values as explicit QUESTION policies, not authoritative parity. Identity, cost, rarity, and troop type are high-confidence.

The shared-host gap is admission and a source profile, not a new attack system: the real `GameSession` already materializes multi-member profiles, applies the deterministic six-tick member interval from `session-troop-source-confidence-authority.js`, and runs individual melee contacts in `battle-continuation-kernel.js`. A 2020 Supercell deployment standardization supports a 100 ms gap between members of multi-unit cards, with Skeletons and Skeleton Army called out as exceptions; that gives this two-member card six ticks between appearances. First-member onset and exact formation positions remain QUESTION. The existing formation engine can provide deterministic separation; keep its geometry labeled QUESTION unless a cutoff-matched capture supplies it.

Builder scope and owners:

- Add one new original runtime identity with two homogeneous melee members in `src/content/cards/swarms.js`; wire the source through `src/content/session-troop-profile-catalog.js`, `src/content/session-troop-roster.js`, and `src/content/session-card-catalog.js`. Add the ID to the editable roster so the same real setup serves player, opponent, and RL decks. Extend `src/shared/session-troop-source-confidence-authority.js` with this identity's field questions and the cited deployment-interval receipt.
- Do not create an encounter-only implementation. Avoid `src/sim/battle-continuation-kernel.js` changes unless a failing shared-session test proves that the existing count-two, stagger, collision, melee, or restore path cannot handle this profile.
- Source test: compare all level-11 values and unit conversions to `reference/stats/cards.json`, and assert that every listed unverified field is represented as QUESTION. Assert the 100 ms/6-tick source receipt separately from the unresolved first-member/formation choices.
- Shared-runtime test in `tests/game-roster-troops-ordinary.test.js`: deploy through `GameSession`, verify one member then the second at the admitted interval, both units move and make separate melee contacts, and replay plus serialize/restore at the partial-squad boundary are byte-identical.
- AI test in `tests/editable-deck.test.js`: keep the candidate in a seeded north hand, leave every naturally legal card available, set a short deterministic think interval, and prove the real opponent controller commits this card, spends 6, advances its deck once, and materializes both members. Do not force a card choice or stub the controller.
- RL test in `tests/rl-environment.test.js`: use an eight-card deck containing the new ID; prove the action mask exposes its legal deployment, step the actual environment, then restore at a staged-spawn checkpoint and compare session/environment bytes.
- Browser acceptance belongs to the later UI/release pass: the player can select the new original identity from the editable collection, see QUESTION fields clearly, deploy it, and fight the real AI. Tests of `createSwarmCatalog()` alone do not pass this scope.

The ordinary-profile scope is complete only after a local source review confirms no extra card-specific movement, status, or attack mechanic outside the common row. If such a mechanic is found, stop treating this as profile-only work and re-scope it onto a shared host capability; do not omit it.

### 2. Valkyrie — first worthwhile shared melee-area mechanic

Historical source identity: `id=26000011`, key `valkyrie`; rare troop, cost 4. `currentEditableMatch` is null in the frozen 109-row map, and there is no current-16 comparator join.

The normalized row is one ground melee unit: 1,908 HP, 267 damage, 1.5 s cycle (90 ticks), 1.4 s first hit (84), 1.0 s deploy (60), 1.2-tile reach (1,200), 5.5-tile sight (5,500), 1.0 tile/s movement (1,000), ground target mode, count 1, and a 2.0-tile radius (2,000). All non-null combat fields, including target mode and radius, are QUESTION. The local `reference/research/melee-splash-source-audit.md` finds qualitative support for area damage around the attacker, but not exact geometry. It documents a real disagreement: the pinned February 2023 row encodes 2.0 tiles while Supercell's July 2019 note gives 2.4 tiles, with no later checked note resolving the difference. Do not promote either radius to authoritative status.

The missing behavior is in the shared host itself. `battle-continuation-kernel.js` resolves a melee attack as one primary contact; its area-contact path is attached to a projectile impact. `src/sim/ordinary-projectile-splash.js` rejects projectile-speed fields for melee delivery, so attaching a projectile splash profile would be an invalid shortcut. The builder needs a generic, deterministic melee-area contact path in the real battle kernel, then a source profile for this card. Preserve its selected radius, center rule, splash target layers, secondary damage rule, cap/order, and structure/tower interaction as explicit QUESTIONS. The raw `self_as_aoe_center` flag is evidence to record, not a settled runtime interpretation.

Builder scope and owners:

- Add a new shared source module such as `src/content/cards/melee-splash.js`, admit its original runtime ID through the session profile and editable-roster path, and record the per-field QUESTION policies in the existing shared confidence authority.
- Extend `src/sim/battle-continuation-kernel.js` (or a helper it owns) so each melee attack can apply one deterministic area contact to the admitted nearby targets and that the full area event/history restores exactly. Keep projectile splash behavior separate.
- Add `tests/game-roster-troops-melee-splash.test.js` against `GameSession`: use a primary ground target within 0.5 tile of the attacker and a secondary target almost on top of the primary, then assert one direct hit, qualitative secondary damage, and exact replay/restore. This layout works under either plausible attacker-centered or target-centered interpretation. Do not claim a radius boundary, air splash, equal secondary damage, target cap, ordering parity, or tower/building splash from the available source.
- Add the same full-deck seeded north-AI selection and RL custom-deck/mask/deploy/restore bars listed for Elite Barbarians. The role does not count until it is admitted through the shared GameSession and the real opponent path.

This is a larger scope than Elite Barbarians because it changes shared combat semantics. If the release bar requires source-authoritative radius and target geometry rather than explicit QUESTION behavior, defer this role until a cutoff-matched primary capture resolves those fields; a one-target melee stand-in is not a complete implementation.

## Exclusions and joins checked

- `Giant` (`26000003`) already has a frozen exact join to `stonehauler`; do not count it as a new role. `Stonehauler`'s other test comparator declarations are not extra identity joins.
- `P.E.K.K.A` (`26000004`) has no frozen `currentEditableMatch`. The later snapshot records `ironroot` only as a declared comparator, and its admitted single-melee profile exactly repeats the normalized P.E.K.K.A values. Given the no-cosmetic-duplicate requirement, this is not a useful next role unless a full-roster identity decision explicitly asks for a separately selectable implementation.
- `Skeleton Army` (`26000012`) has no exact frozen join; current-16 calls Cinder Host a QUESTION fixture only. Cinder Host already exercises the same 15-body shared skeleton path, so do not present that fixture or another cosmetic wrapper as new mechanics coverage.
- `Minion Horde` (`26000022`) has the same six-air-unit 230 HP / 117 damage / 1.0 s / 1.6 reach / 5.5 sight / 1.5 speed / count-six profile as admitted `coppershade-flock`, which is classified as projectile delivery in the current shared roster. The historical normalized row does not settle delivery/homing; this risks both a cosmetic duplicate and overlap with H1, so defer it until the delivery source question is closed.
- `Hog Rider` (`26000021`) is not safe to route through a generic buildings-only seeker. Its normalized row establishes buildings as the target mode but does not establish whether its bridge jump or collision bypass changes movement. No local source inspected here clears that possibility; defer rather than silently omit it.
- `Fireball` (`28000000`) is not represented by the partial `squall-orb` shared spell profile: `src/content/session-spell-profile-receipts.js` leaves travel and knockback unresolved, so the radius-spell estimate is not the full card. Its crown-tower modifier is also explicitly provisional. `Cannon` (`27000000`) has unresolved first-contact timing and the normalized row does not supply a full building-lifetime signature. Neither is a full-role low-gap candidate from this evidence.

No implementation or test suite was run for this read-only scoping task. The evidence inspected was local: `AGENTS.md`, `PLAN.md`, `docs/completion-inventory.md`, `reference/stats/SOURCES.md`, `reference/stats/cards.json`, both completion inventories, the cited source audits, and the current profile/session/AI/RL paths.
