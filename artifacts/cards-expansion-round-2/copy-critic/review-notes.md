PIECE: CARDS-013 card-description consistency, round 2
VERDICT: PASS
EVIDENCE:

The frozen archive is commit `ce3bebaae29fc5bbd2e8dee43ac0da4c9eb41131`. The required app-shell command completed with this actual TAP result:

```text
ok 1 - player shell renders roster-derived cards and launches a paused shared battle frame
# tests 1
# pass 1
# fail 0
# duration_ms 59420.762875
```

The browser-rendered summary and statistics profile for both Cinder Host and Ironroot say exactly: “Current game: Ground unit · melee attacks · targets ground. The ground layer and melee delivery remain provisional for historical comparison.” Desktop and 390×844 phone captures show the same copy in both locations, with the profile statistics and lore visible. The captured portraits both decoded at 512×512. The phone home capture and browser evidence retain the default eight cards; there are no page errors. The full captured values and deck IDs are in `target-profile-capture.json`, and the command output is in `test-output.txt`.

Rendered targets: [Cinder Host desktop](cinder-host-desktop.png), [Cinder Host phone](cinder-host-phone.png), [Ironroot desktop](ironroot-desktop.png), [Ironroot phone](ironroot-phone.png). Collection portraits and the default deck are visible in [desktop collection](desktop-card-portraits-1440x933.png), [phone collection](phone-card-portraits-full-390x844.png), and [phone home](phone-home-720x1280.png).

BIGGEST GAP: The collection notice still says “eleven-card collection” while the rendered collection contains fourteen cards; this is a separate global copy issue outside CARDS-013’s two-card classification scope.
