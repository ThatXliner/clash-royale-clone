# CARDS-022I critic packet

- Candidate: `bcba6c76ec31215b6dac8208529a6c97b7274ca0`; parent: `226c55248d5c3a6f77e87ef40bb9eb0f32cd5ebf`.
- Verdict: **FAIL**, for the visible unverified-stat labeling gap in `verdict.md`.
- `candidate-allowlist-checksums.json` records the exact changed candidate files: 10 UI/test paths and 247 builder-evidence paths. All sim, content, RL/kernel, package, asset, dist, and reference fences match the parent; there are no changed paths outside the allowlist.
- `candidate-source-tests.diff` is the bounded diff for the 10 source/test paths only.
- `cards022-browser-run-01/` contains actual Chrome 155 screenshots, integration evidence, raw TAP, and exact restore-image byte comparisons; all four phone/desktop × normal/reduced before/after pairs are byte-equal.
- `node-tests/` contains actual Node-gate output (45 pass, one optional parent-root skip). `cards022-browser-run-01/` was 1/1 pass. `release-build-run-02-qualified-native-chrome155/` is the corrected native Chrome run (22/22, exit 0); its actual four generated tracked reports were copied externally, then only those four test side effects were restored to candidate HEAD. `shipping-isolation-release-run-01/` is 4/4 pass.
- `release-build-run-01/` and `release-build-run-01-unqualified-default-chromium/` preserve the first 22/22 capture and its reports, explicitly unqualified for native Chrome.
- Chrome executable proof is in `chrome-executable-proof-02/`. The earlier unquoted-path failure is described in `release-build-run-02-qualified-native-chrome155/failed-observations.md`.
- Packet files are external under `/private/tmp/cards022i-critic-review-bcba6c76`; no checkout, node_modules, or full-repository archive is included. `packet-sha256.txt` hashes every packet file except itself.
