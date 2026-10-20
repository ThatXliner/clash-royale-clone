Fresh run excerpts (Node v22.22.3). The original tool output is preserved in the critic transcript; these are the exact result fields used in the verdict.

```text
Hostile-side probe, exec session 5651, exit 0:
classification=HOSTILE_CONTACT
primary.tick=149; primary.target={id:2,type:unit}; primary.targetSide=south
hop.tick=150; hop.target={id:4,type:building}; hop.targetSide=south
hop.hitpointsBefore=824; hop.hitpointsAfter=632; hop.hpDelta=192
nearestEligibleFriendly building #5: 2085 millitiles, HP 400
nearestEligibleFriendly unit #3: 2168 millitiles
nearestEligibleHostile building #4: 2416 millitiles

Focused host tests, exec session 54320, exit 0:
1..11
# tests 11
# suites 0
# pass 11
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 12244.799125

Raw-e35 default-eight comparison, OS PID 36494, exit 0:
result=PASS; baselineCommit=e35dda4c0225b88ddac91a56f15e81fee32c3c68
rawPinnedDefault8.optionalProjectileReceipt=false
rawPinnedDefault8.policyAbsent=true
ordinaryCombat={tick:148,sourceId:1,targetId:2,damageEventAmount:192,
  unitHitpointsBefore:1766,unitHitpointsAfter:1574,actualHpDelta:192}
raw-e35-default8-ordinary-combat-unit-hp-loss:
  bytes=45487
  sha256=c9cf3f9e946e7d2268f3dc045136c775086cca536c5d7a85ca9691d7174444f5
  exactUtf8BytesEqual=true
```
