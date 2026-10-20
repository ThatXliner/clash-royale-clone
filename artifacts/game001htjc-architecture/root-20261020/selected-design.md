# Selected chain host design

Static design selection only; no mechanic implementation or runtime acceptance.

Use Candidate B's LiveBattle-owned continuation and no-argument factory returning an opaque immutable QUESTION capability. The public caller opts in once; it cannot supply hop values or construct the wire receipt. Ordinary construction stays on the exact existing byte path. Admission privately binds all eleven fixture fields and their provenance to the admitted Stormkite source claim. No roster admission follows from this provisional capability.

Keep the existing single LiveBattle boundary and all three health owners. A private sibling module prepares due-hop intents from the current host view. The host routes them through BattleCombat for units, BattleTowerCombat for crown towers, and LiveBattle's existing building writer. Settlement consumes the prepared plan plus actual outcomes; the plan itself carries originating state and tick, so callers cannot settle it against a different boundary. It does not own another clock or health store.

Use the existing numeric combat proxy ID after distance for target ties. Tower IDs occupy the existing six reserved MAX_SAFE_INTEGER slots, units reserve those slots, and buildings share the host entity counter. Keep typed IDs separately for health routing. Reuse the existing tower projection instead of duplicating its reserved-ID table. This replaces both candidates' proposed new cross-kind order convention.

Graft Candidate A's exact private policy comparison, causal root matching, whole-step rollback test, and explicit aggregate source/graph/snapshot budget checks. Retain B's named prepare/settle signatures rather than a tagged phase/result union. Reject A's exposed wire receipt and raw object/string admission forms. Reject lower projectile-runtime ownership because it still needs the host target projection and all three existing health writers.

The witness must survive clone/adopt, pending restore, arbitrary chunks and independent forks. Absence adds no serialized key or version change. Validate restored causal roots and unique targets before returning a battle; retain exact attackSequence, direction, projectileId and sourceId across hops. Enforce pending/history limits and the existing aggregate snapshot cap. Failed steps must leave the original battle unchanged.

Before implementation, bind primary-impact outcomes and same-tick ingress ordering to the exact provisional policy in one place. The implementation must demonstrate actual unit, building and crown HP changes, unchanged absent-policy bytes, hostile-restore rejection, rollback, chunk/fork equality and all unchanged source/graph limits. Source inspection supports this design choice; only execution can verify it.

Selection evidence: cross-judge.md scores B 23/25 and A 22/25 against five stated criteria. Root read both complete sketches and rationales and verified the existing numeric projection before selection. Factory extraction remains unadopted pending full qualification; no factory or chain source changed in this design step.
