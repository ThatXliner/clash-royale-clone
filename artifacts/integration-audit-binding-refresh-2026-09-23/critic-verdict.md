PIECE: Integration occurrence binding refresh
VERDICT: PASS
EVIDENCE:

`npm test -- game-roster-admission` completed with the actual TAP summary:

```text
# tests 7
# suites 0
# pass 7
# fail 0
# duration_ms 2960.112208
```

`npm test -- integration-audit` completed with the actual TAP summary and manifest result:

```text
# {"manifestSha256":"022ee978fedade9bdab3a1a0efb9c05bbd7acea64da57ce4e9b64da3428d8f5d","supported":58,"uniqueSupportedIds":53}
# Subtest: canonical integration audit executes every supported card and reproduces artifacts
ok 6 - canonical integration audit executes every supported card and reproduces artifacts
# tests 6
# suites 0
# pass 6
# fail 0
# duration_ms 375784.140292
```

The direct adapter probe read each source record from its named catalog export and matched it to its defining event. Periodic records/events were Blight Ring damage 91 at ticks 2, 62, 122, 182, 242, 302, 362, 422; Fault Pulse damage 81 at 2, 62, 122; Gravity Well damage 84 at 2, 32. Defensive building record damage and first attack were Bulwark Needle 212 at tick 60, Buried Coil 230 at 102, Ember Basin 222 at 126, Horizon Caster 266 at 450, and Prism Furnace 42 at 132; each event targeted entity 2. These match the records in `spells-periodic.js` and `buildings-defensive.js`, including their deploy and first-hit timing.

The static pin rejected a deliberately changed Blight Ring source damage value after recalculating the artifact’s self-hash:

```text
STATIC SOURCE MUTATION: REJECTED (createPeriodicSpellCatalog/blight-ring mechanic binding mismatch)
```

The fixture refresh changes exactly 8 occurrence pins, leaves 50 unchanged, and the updated aggregate manifest hash reproduces identically across the audit’s two runs.

BIGGEST GAP: The refresh proves byte binding to the repository’s current definitions and events; periodic mapped damage, radius, target class, and cadence remain QUESTION data, so these pins do not establish historical gameplay accuracy.
