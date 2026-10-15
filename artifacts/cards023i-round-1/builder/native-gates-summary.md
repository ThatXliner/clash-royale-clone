# CARDS-023I native gate receipt

Candidate: `722a50f2042ab22d1a8563c8231bcb824b4c2e14` (parent `9935d9740d56c7f857ee12de83aefca10a6c84df`). Native gates ran only in the detached private checkout `/tmp/cards023i-builder-4f19`.

Runtime paths were pinned to `/Users/me/.hermes/node/bin/node`, `/Users/me/.local/bin/npm`, Chrome `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` (observed version `155.0.8059.40`), and private Playwright `/tmp/cards023i-builder-4f19/node_modules/playwright/index.mjs` (1.58.2).

| Gate | TAP tests | Passed | Optional skip | Exit |
| --- | ---: | ---: | ---: | ---: |
| app-shell | 1 | 1 | 0 | 0 |
| CARDS-023I browser | 1 | 1 | 0 | 0 |
| UI combat state | 19 | 18 | 1 | 0 |
| game UI projection | 38 | 37 | 1 | 0 |
| nondeterminism guard | 10 | 10 | 0 | 0 |
| visual asset manifest | 6 | 6 | 0 | 0 |
| shipping isolation guard | 13 | 13 | 0 | 0 |
| release build | 22 | 22 | 0 | 0 |
| shipping isolation release | 4 | 4 | 0 | 0 |
| shipping isolation host | 1 | 1 | 0 | 0 |
| **Total** | **115** | **113** | **2** | **all zero** |

The only skips were the existing `ART004_PARENT_ROOT` comparison checks in UI combat state and UI projection; both require the accepted 5ed parent checkout. No tests failed. The CARDS-023I browser integration passed against a seed-2 editable session and the selected eight-card deck. Its evidence records trusted player deployment, unforced natural AI, resource receipts and HUD state, four phone/desktop normal/reduced-motion modes, 13/26-pixel art geometry, exact session/state/input/audio restoration, byte-identical before/after viewport PNGs, natural terminal, and same-deck/same-seed restart. Browser evidence and rendered PNGs are in `native-runs/attempt-tB0RXu/cards023-browser/`.

Every gate receipt under `native-runs/attempt-tB0RXu/` contains command, working directory, PID, direct stdout, direct stderr, direct exit code, and SHA-256 checksums. The protected source fence enumerated 660 entries under `src/`, `scripts/`, `tests/`, `public/`, `demo/assets/`, `docs/art/`, `reference/stats/`, `package.json`, and `package-lock.json`. Before/after inventories match byte-for-byte. SHA-256 of the path inventory (`source-before.sha256.files`) is `bc69f4609e61a6700130723db9724d2b24f2ab7927110d72c723da1ef8f8b057`; SHA-256 of the before/after content fence (`source-before.sha256` and `source-after.sha256`) is `117844d0e1b507b956d77c9a52fdb583078b009db11bc9b8dccb0e0a06042575`.

The four preexisting release-001b reports were restored byte-for-byte after the release build. The four newly generated reports and their checksum manifest are preserved in `native-runs/attempt-tB0RXu/release-001b-generated/`. No full endurance run was performed.
