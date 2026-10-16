Prepared serial baseline packet for two known static golden-pin risks.

Execution source
  Existing private accepted checkout (no new clone):
  /Users/me/.codex/worktrees/stagger-movement-accepted-aea303
  Exact source commit: aea303091a18baeacd1b7805c415732d7a1c1417
  Tree: 87bef202af90a608eb0a16ed1f042b77c5b8c0ce

Current accepted comparison
  Current accepted commit: 69daeff24563aff5df5379f36ef9c27f5582307c
  These Git tree/blob objects are identical at aea303 and 69da:
    src:           01d869b32c563dac270acd4fddc7fa4d0ec207de
    scripts:       29dacc49987adddd1dce36ab07995b11154cbbdb
    tests:         6016d595d9e461c82975d208c2432d57733b5c54
    package.json:  7a637dd1af982c8fb44c5640d82e1f44fbcafcd6
    package-lock:  57d4f206ec6d041922c394cd67db615333eb8af5
    public:        7295164e421573d7da604fbddd46afb8599d3662
    reference:     84735c4eebf8e59e97ecc510a682718495c6125e
  `public/assets` is included in the identical public tree. No standalone root
  `assets` directory exists. A path-scoped Git diff over these source, script,
  test, package, public, and reference paths is empty. Other commit changes are
  planning/progress and recorded evidence/metadata.

Static risks only; these are not test failures until run:
  1. `npm run test:game-troop-runtime`
     Test `game troop runtime: current v5 hostile witnesses, chunks, forks, and
     empty v2 bytes remain causal` pins empty LiveBattle v2 length 11,618 and
     SHA-256 874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a.
     The setup derives its roster and questions from current playable-roster
     factories.
  2. `npm run test:game-roster-troops-status`
     Test `game roster troop status: deterministic session continuation hashes
     stay stable` has six GameSession replay/snapshot hash pairs beginning near
     line 874. Current witness-based setup includes Briar Band. Treat the pins
     as possible fixture drift, not proven failures.

Deferred recorder:
  python3 /Users/me/.codex/worktrees/stagger-movement-golden-gates/record_two_gate_baseline.py

The active recorder runs the two npm scripts sequentially, pinning Node 22 from
/Users/me/.hermes/node/bin. For each gate it stores the exact package/test/
runner source copies and SHA-256 before launch, command/script/environment/cwd,
actual direct npm PID immediately after Popen, complete raw stdout and stderr,
actual exit, and before/after source fences. It continues to gate 2 if gate 1
fails, provided the accepted checkout is still clean at the exact commit. All
run artifacts stay outside the execution checkout.

No Node/npm/test was run during recorder preparation. No project source was
changed. Runtime is deferred until the coordinating agent's explicit release.
