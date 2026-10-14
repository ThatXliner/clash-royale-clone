# Adjacent projectile source-cache regression

Candidate: `562c7a1139d5c4bafcb850898385e780c8175a23` (`parent 0cbd7e5c245e58aedc3598f51ad5371d7477ab9e`), tested from clean archive `/tmp/cards019-core-critic.1wo4mQ`.

The new `createOrdinaryProjectileSplashCatalog` / `kilnkeeper` source is included in `AUTHORITATIVE_PROJECTILE_SOURCE_IDS_BY_EXPORT` in `src/content/session-troop-projectile-source-admission.js`, but the existing `SOURCE_BINDINGS` map in `src/content/session-troop-projectile-profiles.js` still has only the previous nine exports. `buildSourceCatalogCache()` iterates that map and, at line 800, compares its size against all authoritative exports; it throws `projectile source catalog cache is incomplete` at line 801. The projectile manifest builds at module import, so this blocks both existing adjacent projectile suites before their cases execute.

Actual commands and evidence:

- `npm run test:game-roster-troops-projectile-profiles` — exit 1, 0 suite cases run; complete raw TAP and import stack: [`projectile-profiles.import-error.tap`](projectile-profiles.import-error.tap). Stack lands at `session-troop-projectile-profiles.js:801`, called by `buildManifest` at line 1300 and module initialization at lines 1386–1391.
- `npm run test:game-roster-troops-projectile` — exit 1, 0 suite cases run; complete raw TAP and same stack: [`projectile-runtime.import-error.tap`](projectile-runtime.import-error.tap).

This is the largest blocker: an ordinary projectile-splash addition prevents unrelated projectile profile and runtime suites from loading. The strongest single repair is to close the source-cache binding for the new export, with the appropriate source evidence and tests, then rerun both suites.
