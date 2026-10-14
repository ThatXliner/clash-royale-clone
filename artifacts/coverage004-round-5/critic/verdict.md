PIECE: COVERAGE-004 — release guide wording reconciliation, round 5
CANDIDATE: `124c0b322efd6252a9d2bf6e5f891e4e3e7ff661`
VERDICT: PASS

EVIDENCE:

The guide correction changes only line 42 from original round-4 candidate `8a320759e5fd096d8fb6d77ae92c3e117f8a17ae`. The old wording said the receipt recorded “response times.” The new wording names the fields present in `live-release-evidence.json`: requested/final URLs, HTTP status, selected response headers, byte length, SHA-256, capture timestamp, and the landing-page full-commit check. The capture code and receipt contain no elapsed-duration measurement or field.

I extracted candidate `124c0b322efd6252a9d2bf6e5f891e4e3e7ff661` with `git archive` and ran `node artifacts/coverage004-round-4/builder/check-guide-release.mjs` from that clean archive. It exited 0. The output was 2,301 bytes with SHA-256 `740f64bd8e14c2e944cf3b10d30fa77c6af05df485ef618398843aaca42d6b71`; stderr was empty with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. Both outputs byte-match the committed round-5 builder logs. All 23 local Markdown links resolve.

Independent source and receipt checks reproduce the 109-row target (78 troops, 13 buildings, 18 spells), frozen 18-ID map, zero full historical executions, zero historical parity claims, current 20-choice collection, and default deck of 8. The catalogs reproduce 56/61 admitted/claimed card counts and 40/42 admitted/claimed troop-profile counts as listed in the guide. The source and release claims remain pinned to `bf1e6120196db8a2927ce6ae893812e4c9b1115d` and tree `a306815db49583c41059dc19b37628aa5cb8c7a7`; source, release, public asset, and reference-stat paths have no changes from that commit in the candidate.

The cited status evidence is consistent: H1 PASS / H2 QUESTION, CARDS-019D PASS round 443, APP-004G PASS round 444, and CARDS-019I unaccepted (its round-445 review is FAIL). The default-eight receipt records six exact snapshots at seeds 0 and 23, ticks 0, 120, and 900. The older endurance receipt belongs to `9f64011378d3ce1c6281d9292950a7b52f11fd2c`, with an 8-card deck, 18,000 terminal ticks, and 67 segments; the guide explicitly says it does not establish endurance for `bf1e612`.

The Pages workflow receipt is successful for run `38510398827` at `bf1e612`; the landing page, game page, and portrait returned HTTP 200 in the captured evidence. The served portrait is 65,626 bytes and its SHA-256 matches the source asset. The 10 round-4 builder files match both their preservation manifest and original candidate `8a320759`; all 43 older COVERAGE-004 evidence files match the round-4 manifest and original candidate bytes. No product source changes are included.

BIGGEST GAP: None within the wording repair and the versioned claims reviewed here.

DISPOSITION: The prior line-42 failure is corrected; no broader suite was needed for this documentation-only reconciliation.
