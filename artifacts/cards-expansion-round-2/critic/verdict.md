PIECE: CARDS-013 core
VERDICT: PASS

EVIDENCE:

- Frozen source: `bccd0a979aad430b44905a2aec002fc7a4369930`. `node --test tests/cards-expansion-round-2.test.js tests/cards-basic-melee.test.js tests/cards-swarms.test.js tests/game-roster-admission.test.js tests/game-roster-troop-profiles.test.js tests/game-roster-troops-ordinary.test.js tests/game-roster-troops-projectile-profiles.test.js` completed with `# tests 85`, `# pass 85`, `# fail 0` in `93336.653875 ms`; full TAP output is in `requested-tests.tap`.
- Cinder Host reference/runtime: cost `3`; summon count `15`; selected per-body HP/damage `81/81`; runtime `15 × 81 HP`, `81 damage`, movement `1500` millitiles/s. The legacy Skeleton Army row remains `51/51` with HP and damage flagged unverified; the normalization selects index `10` from the explicit summon-level offset to get `81/81`.
- Ironroot reference/runtime: cost `7`, count `1`, HP `3760`, damage `816`, movement `750` millitiles/s, hit speed `108` ticks, first hit `78`, deploy `60`, range `1200`, sight `5000`. These mechanic fields are marked unverified in the P.E.K.K.A comparison row, so this is a fixture match rather than an authoritative mismatch gate.
- Direct frozen GameSession run: Cinder Host deployed `15` bodies with IDs `1–15`, Ironroot deployed one body with ID `16`; the swarm moved by tick `100`; 47 melee hits dealt `3807` to Ironroot, and Ironroot's four melee hits dealt `3264` to four swarm bodies. At tick `408` all swarm bodies and Ironroot were dead. Restoring the tick-`150` checkpoint and continuing to `408` reproduced serialization, replay bytes, and state exactly. See `core-trade-restore-probe.json`.
- Adversarial legal eight-card deck contained both `cinderlings` and `cinder-host`. Both deployed in one GameSession as 3 and 15 live members, with disjoint body IDs and shared archetype `cinderling`. Admission produced one consistent set of three shared QUESTION facts. See `coexistence-probe.json`.
- The starter roster remains eight cards. Runtime body radii (`250` for Cinderling and `500` for Ironroot), delivery, and layer remain explicitly non-authoritative QUESTION estimates. The pinned Skeleton source exposes raw `collision_radius=500`; the project does not establish that this field maps directly to the runtime body-radius policy.

BIGGEST GAP: Reconcile the runtime body-radius policy with source collision-radius semantics and gameplay contact evidence; Cinderling currently uses a `250` millitile QUESTION estimate while the pinned Skeleton row records `collision_radius=500`.

Scope is core mechanics and admission only; original portrait/lore and actual desktop/phone review are covered by the separate browser-art critic.
