# Combat round 3 builder evidence

Standard seed2 Brassbolt1 is alive at frame413, dies from canonical death event58 tick413, and has a fallen original north-faction silhouette at frames414 and419. It clears at age18 (frame431; screenshot432). The remnant has no combatId, targetId, health bar, or pointer hit region. Fallen body tilt, crest-fragment drift and opacity depend only on death age. Reduced-motion retains a static informative body and fragments.

The already validated effects view supplies death/contact records. Snapshot membership is checked before any snapshot read, the effect view capability before record access, and each recent event is checked against the authenticated snapshot event. No raw replay is used. Retained dead canonical units supply kind, faction and position. Remnants deduplicate by unit ID and sort numerically. Residual projectile contact/impact art uses exact rational feed coordinates for ages1 through7; existing effects retain age0. Root+point keys deduplicate contact/impact phases. This does not modify projectile flight authority.

Browser evidence captures death413/414/419/432, asserts a canonical tick413 projectile impact at414, checks exact combat/effects DOM restoration at414, and verifies original body kind/faction, absence of live identity/health and pointer-events:none. Node tests compare one-shot/chunk/restored death views and exact expiry. Prior attack435 and delayed-spawn cases remain covered.

Commands: npm test -- visual-combat-assets ui-combat-state ui-combat-effects. Focused projection rollback/hostile tests: node --test --test-name-pattern='rollback|rolls back|hostile|staging|host failure' tests/game-ui-projection.test.js (13 tests).

Scope remains the default nine unit archetypes. Arbitrary status-modified witness animation and full HUD motion are not claimed. Reference footage remains unavailable. This document records builder evidence, not an independent verdict.
