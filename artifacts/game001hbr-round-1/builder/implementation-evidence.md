# GAME-001HBR builder evidence

## Scope

This builder branch starts at frozen commit `7ef53c7ca1a914d62a60b2ea3b148ca452d575f7`. It adds a version-2 shared-host Aether resource receipt and lifecycle while retaining the exact legacy version-1 fixture. The source-scope record is the root branch's committed `artifacts/aether-well-full-signature-scope/builder/` evidence at `d268715d0822c3d7386be44999daa83a2a440fde`.

The official April 4, 2022 balance notes independently support the 9-second generation interval, 65-second lifetime, and +1 resource on destruction ([publisher notes](https://supercell.com/en/games/clashroyale/blog/release-notes/balance-changes-april-2022/)). At 60 ticks per second the version-2 receipt stores 540, 3,900, and 1 respectively. Only those three values are source-aligned. Periodic amount remains datamine-only QUESTION; recipient, cadence anchor/reset, capacity, placement, simultaneous generation order, and same-tick/expiry ordering are explicit QUESTION fields. The 1,070 HP and 60-tick deploy estimate are also explicitly unverified QUESTION fields. No historical-completeness claim is made.

The gameplay identity remains the synthetic `aether-well` / “Aether Well.” The reference corpus is evidence only; no reference modules, data, names, or assets were added to product code.

## Runtime and compatibility evidence

The v2 reducer uses the existing shared `resource-grant` route and shared Elixir authority. It emits one payout for combat destruction and one for expiry, marks the persisted structure receipt as death-triggered, and leaves the shared host responsible for capacity and application. The ordinary scheduled grant continues at the chosen versioned cadence. It does not add a second deck, elixir, tick, identity, or transcript authority.

The GameSession combat witness uses a legal north Mossguard deployment and actual combat damage; Aether reaches 0 HP at tick 479, then the real ElixirMatch applies one +1 grant to the owning side. Chunked execution and a restored independent branch serialize to the same session and replay bytes. The expiry witness checkpoints at tick 3,898, restores a branch, and processes through tick 3,900; the single expiry grant request is accepted once and applies 0 because the authoritative balance is already capped at 10. Advancing again emits no duplicate payout.

Legacy v1 setup, deployment, tick-511 snapshot, and replay hashes match the frozen parent exactly:

| Witness | SHA-256 |
| --- | --- |
| Initial legacy v1 snapshot | `d239a7932debbf13745f1e18c9292569aa3bdcc91fe5b3dd7ba7e3482b78b904` |
| Legacy v1 after deploy | `5da18620f58401a12e7caa8007dc1914156e613eec9a8e36e1cb6222a340bfc3` |
| Legacy v1 after 511 ticks | `1817cca6a91a698cecf8ffacf63a5aae73c28765b7dc0bf4d6517fd573c858f4` |
| Legacy v1 replay | `45e157fdb6b77ab5659969e2cec92809db2a97bc70deb573d42fc09086c784bb` |
| Shipped default-eight initial snapshot | `ed371dd1d28d6be72a98bda32e434cbbc5431eea4f163e4206a1901cd08dbea1` |

The default-eight digest was reproduced from both the frozen parent tree and this branch; the standard deck and opening 10 Elixir per side remain exact. The custom legacy v1 fixture starts at 8 Elixir as its own explicit setup value, not as the shipped default.

## Validation

Run with Node `v22.22.3` and the lockfile dependencies installed via `npm ci`.

| Command | Result |
| --- | --- |
| `node tests/game-building-policy-runner.js game-building-policy` | 6/6 pass |
| `node tests/game-building-runtime-runner.js game-building-runtime` | 16/16 pass |
| `node tests/buildings-resource-runner.js buildings-resource` | 13/13 pass |
| `node tests/game-roster-buildings-runner.js game-roster-buildings` | 10/11 pass; new cadence and combat-payout tests pass |
| `node --test --test-name-pattern='simultaneous two-owner Aether|actual opposing unit destroys Aether' tests/game-roster-buildings.test.js` | 2/2 resource lifecycle tests pass |

The one roster-suite failure is present on clean frozen parent `7ef53c7` too: the occurrence-union expectation omits actual `brackenwheel` from `tests/fixtures/integration-occurrence-bindings.json`. That test and fixture are outside this builder's ownership and were not changed. The expiry proof is included in the 16 passing game-building-runtime tests.

No browser capture or release/host build was run. The active round critic owns the browser/build window, and this builder's assigned evidence is shared-host simulation and byte/determinism testing.
