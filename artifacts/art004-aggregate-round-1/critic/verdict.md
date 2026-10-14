PIECE: ART-004 aggregate sprite prototype evidence
VERDICT: FAIL

EVIDENCE:

Fresh clean candidate: `55b598172d279d7671268c649d79e77babed332e` on accepted base `e6fe04bdfdc963540ec439cf53fa813d62018d63`. The 31 candidate changes are builder evidence under `artifacts/art004-aggregate-round-1/builder/`; source, art, demo, and test files match base hashes in `source-integrity.txt`.

The focused unit test passed 10/10. The visual asset manifest passed 6/6, including byte-for-byte disk registry, zero byte overlap with `reference`, and provenance source checks. Raw TAP is in `combat-sprite-prototype.tap` and `visual-asset-manifest.tap`.

Fresh browser TAP failed at the live 390×844 app-shell check:

```text
not ok 1 - painted sprite atlas renders at real playfield scale in both teams, viewports, and restore
error: 'north team color survives the actual 390px scaled marker: 6 pixels in the most visible 14×14 marker; expected at least 8'
1..1
# tests 1
# pass 0
# fail 1
```

The app's canonical arena is 540×960. At 390×844 DPR 1 it is displayed at 278.016×494.25 and each Briar marker is 13.3377×13.3377 pixels. The fresh failed run counted North color samples `5, 4, 6` and South `14, 16, 14` in 14×14 crops, so North reaches 6 against the unchanged threshold 8. See `browser-suite-live-phone-marker-sample.png` and `browser-suite-live-phone-team-pixels.json`. The desktop 1440×900 DPR 1 capture displays the same 540×960 arena at 307.178×546.094 with 14.7367px markers; North samples were `15, 10, 17`, South `17, 24, 13`. See `desktop-1440x900-walk-normal.png` and `critic-desktop-shell-evidence.json`.

Attack art is demonstrated on the standalone `demo/sprite-prototype.html` control page at tick 3, where the browser test selects attack and checks both teams and all four facings; see `prototype-page-390-attack.png`. In the actual app, a fresh tick-by-tick search after legal Briar deployment observed only walk poses and no attack pose through 600 further ticks (session tick 725, then no Briar markers). The browser integration assertion accepts either `walk` or `attack`, so it does not require an actual live attack. Fresh actual-app evidence is in `critic-phone-shell-evidence.json` and `critic-desktop-shell-evidence.json`; the modified critic capture runner awaits an animation frame after each tick.

Normal walk restore was DOM and pixel identical on phone and desktop. Desktop reduced-motion restore was also identical. On the phone, reduced-motion restore kept combat DOM and tick 125 identical but the whole-page screenshot differed by five pixels at x=105–106, y=700–705; hashes were `8cc072e6…` before and `f179b222…` after. This difference lies outside the combat layer. The phone browser suite fails at team-color visibility before it reaches its own phone restore assertion.

The art remains original and unchanged: painted atlas SHA-256 is `a1aa43df00dacc212beedb4905dddd7a57db412981ea29662bc1d868a97794f4`, matching provenance and manifest; the fresh manifest test reports zero byte overlap with `reference`.

BIGGEST GAP: Trigger and capture a genuine live-app attack tick for the playable Briar Runner; every observed live marker remained in walk state, while attack is currently evidenced only by the standalone prototype controls.
