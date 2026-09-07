# Round 2 combat pose evidence

The shipped seed-2 terminal profile now shows anticipation, strike pose and melee contact at the authentic first attack. The browser test captures tick430 before, tick435 during and tick443 after. Tick435 has one contact with strike tick434 and target south:lane:west; tick443 has none. The delayed-spawn regression verifies spawnedAt12 produces strike446 at frame447, and restores identically.

`combat-motion.js` accepts only authenticated GameSession projection snapshots. Ordinary default-deck attack cycle local deadlines become match ticks by adding spawnedAt. Cycling attacks with positive sequences create an eight-tick pose; retained melee targets produce contact stars at canonical target positions. The existing projectile feed remains the sole projectile/contact-travel authority. Winding deadlines produce anticipation; deploy age produces a scale pose; movement segment distance produces gait offsets. No animation clock, wall clock, or random source was added.

The game frame associates the frozen motion view through a private WeakMap. Its existing public schema is unchanged. Motion binds only to detached combat/effect nodes before the existing atomic commit, retaining rollback behavior. Reduced-motion CSS removes transforms while retaining contact information.

Scope remains nine default-deck unit types. Status-modified cycles are excluded. If a lethal/cancelled target has already been removed from the retained cycle, no historical contact is invented; this can suppress a cue. Tower positions resolve even if the tower is destroyed. The full status/death/HUD lifecycle motion umbrella is not claimed complete. Reference footage is still unavailable. This is builder evidence, not an independent verdict.
