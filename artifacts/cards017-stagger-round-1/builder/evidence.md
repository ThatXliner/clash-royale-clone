# CARDS017 stagger builder evidence

The official Supercell [Season 12 balance changes](https://supercell.com/en/games/clashroyale/it/blog/release-notes/modifiche-di-bilanciamento-della-stagione-12/) says cards consisting of two or more troops deploy their members 0.1 seconds apart, with Skeletons and Skeleton Army called out as exceptions. At this simulation's 60 ticks per second, the sourced relative interval is six ticks.

The playable mappings covered here are Archers → Sunthread Pair (2), Goblins → Thornscouts (4), Barbarians → Forgeguard (5), Minions → Duskwing Trio (3), and Goblin Gang → Briar Band (3 runners followed by 3 darters). The names are research-only mappings; the implementation and product keep original names. Briar Band receives one global ordinal sequence across its two components, so its scheduled birth ticks are 0, 6, 12, 18, 24, and 30 relative to the existing first-member deployment boundary. That component ordering is preserved as current behavior, not asserted as historical evidence.

The per-card counts and numeric troop fields remain estimates where `reference/stats/SOURCES.md` marks them unverified. The raw source audit directly pins a 100 ms delay for Bats and Minion Horde; it does not provide those raw fields for these newly covered cards. Their interval receipt is based on Supercell's generic 2020 rule, not a claim of direct per-card raw corroboration. First-member onset, formation geometry, and historical internal member order remain open questions. The first-member boundary convention was left unchanged.

The correction preserves one elixir spend and one deck cycle per card. Future members stay in the serialized scheduled-spawn queue until birth, do not appear in battle units, and cannot be targeted or deal damage early. Default Briar Band composition and member order remain unchanged; its scheduled births and source-confidence question records intentionally change.

## Captured test runs

Each `.tap` file is stdout from the command named below, captured from an actual run.

| Log | Command | Result |
| --- | --- | --- |
| `cards017-stagger.tap` | `node --test tests/cards017-stagger.test.js` | 12 passed |
| `ordinary-roster.tap` | `node --test tests/game-roster-troops-ordinary.test.js` | 16 passed |
| `playable-roster.tap` | `node --test tests/playable-roster.test.js` | 9 passed |
| `player-deploy.tap` | `node --test tests/game-player-deploy.test.js` | 15 passed |
| `air-and-cards016.tap` | `node --test tests/game-roster-troops-air-swarms.test.js tests/cards016-integration.test.js` | 13 passed |
| `rl-projectile.tap` | `node --test --test-name-pattern='RL reset and legal mask deploy both sourced projectile squads' tests/rl-environment.test.js` | 1 passed |
| `natural-terminal.tap` | `node --test --test-name-pattern='wait-only seed 2 reaches its pinned natural engine terminal' tests/rl-environment.test.js` | captured separately |

The focused stagger suite checks source-derived birth ticks on both sides, mixed-card global ordering, unborn-member combat isolation, serialization and restore at each elapsed tick, tick-boundary chunk equivalence, forged or duplicated schedule rejection, immediate Skeleton exceptions, natural AI deployment, editable RL deployment, and atomic overflow rejection.
