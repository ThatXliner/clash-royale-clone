PIECE
APP-REDESIGN-COPPER-001

VERDICT
FAIL. Source freeze and focused source, asset, and shipping-isolation checks pass, but the required 8-case browser matrix does not. The first four phone cases pass exact pixel restore and 120-tick continuation. The fifth case, desktop 1440×933 normal motion horizontal, fails the zero-tolerance viewport comparison with 234 changed pixels. The matrix stopped there; three cases and the same-deck terminal/restart witness were not run.

EVIDENCE
- Source freeze preflight: 186 files checked; 181 unowned files match pinned main. The pinned browser test and freeze-manifest SHA-256 values match the supplied values.
- Browser matrix: actual run `20261020T210045789057Z-2eeefb304f27`, exit 1. In the failing case, browser, session, bridge, and audio continuation bytes match after restore; a 120-tick continuation reaches tick 283 in both branches with matching canonical Copperskiff units. The accepted pointer placement produced one GameInputBridge delivery.
- Independent PNG comparison confirms 234 changed pixels / 459 changed channels in inclusive bounds x=561–710, y=719–896. The captured before/after renders were inspected; the difference is subtle at full-page scale but violates the exact pixel gate.
- Focused tests: 24 passed, 1 skipped, 0 failed. Visual asset manifest: 6 passed. Shipping isolation: 13 passed, including the candidate entry graph.
- The release build gate remains not run. The candidate has no `node_modules`, but the exact supplied R5 `node_modules` path used for Playwright also contains Vite 8.3.2 and Playwright 1.58.2. This run did not configure candidate module resolution to use that external Vite location; no dependency installation or symlink was made. This is a setup limit on this critic run, not Vite absence.
- Runtime cleanup was confirmed: critic manager and test child are closed, and no matching Chrome or Playwright process remains. No runtime or release-gate rerun was made for this correction.
- Evidence is copied byte-for-byte from the fresh run into `evidence/`; the full browser report and raw launcher stdout/stderr are preserved. The original report and qualification JSON are preserved as `report-original.md` and `qualification-original.json`.

BIGGEST GAP
The exact restored viewport is unstable at desktop scale under normal motion. The remaining three matrix cases and the terminal/restart witness are consequently unqualified.
