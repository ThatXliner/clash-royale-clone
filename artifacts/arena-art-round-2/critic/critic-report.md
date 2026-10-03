PIECE: ART-005A R2 — painted arena terrain subset, frozen commit `42da2ef3974b654bbfbfdf5b2abe31bd0cdc653b`
VERDICT: PASS

EVIDENCE:

- All focused suites pass: `ui-arena-shell` 7/7, `visual-arena-art` 6/6, and `visual-asset-manifest` 6/6 (19/19 total). The visual suite's real 720×1280 Chrome render passed. Full output is in [focused-tests.txt](focused-tests.txt).
- Frozen production files match the previously rendered R1 candidate byte-for-byte: arena CSS SHA-256 `22c9b78515801b1c6319e25e10dddde22f3b1a5de337f114b1629f0fb347bb84`; terrain WebP SHA-256 `22713e1725c21a8f853df5e2af3278689e7e844783606d93c7a12a365d8e930e`, 390,962 bytes. See [hash-comparison.txt](hash-comparison.txt).
- The fresh desktop render shows all six tower bodies, both bridges, the river, battlefield, HUD, and deployed combat units: [opening](desktop-720x1280-opening.png), [mid-combat](desktop-720x1280-mid-combat.png), and [render probe](desktop-720x1280-render-probe.json). The probe records bridge boxes at `(165,558,60,60)` and `(495,558,60,60)` in shell coordinates, equivalent to playfield content `(75,450)` and `(405,450)`; river is `(90,558,540,60)`, equivalent to content `(0,450,540,60)`. The inner playfield remains 540×960 at `(90,108)`.
- The original 390×844 app-route capture is reused from R1: [phone opening](prior-r1-phone-opening-390x844.png), [phone after trusted deployment](prior-r1-phone-deployed-390x844.png), and [phone evidence](prior-r1-phone-evidence.json). The terrain CSS and WebP hashes match R1 exactly. The intervening app-shell CSS change only adjusts card portrait cropping; battle frame sizing rules are unchanged. The capture records an accepted trusted south Mossguard deployment and no viewport overflow.
- The new provenance check permits exactly one CSS `url()`: `../../public/assets/moss-ember-arena-painted.webp`. It resolves to the canonical manifest path, requires a local `file:` URL without query or fragment, and verifies the referenced bytes against the manifest length and SHA-256. Any additional or different CSS URL fails the exact-list assertion; HTTP, data, blob, and reference-corpus strings remain rejected. The manifest suite also passes disk-to-manifest byte matching and reference-byte disjointness.

BIGGEST GAP: Historical visual parity remains unverified because there is no licensed reference footage; this verdict makes no historical parity claim.
