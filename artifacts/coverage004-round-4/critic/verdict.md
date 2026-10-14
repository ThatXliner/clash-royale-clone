PIECE: COVERAGE-004 — current release completion guide, round 4
VERDICT: FAIL

EVIDENCE:

The fresh no-hardlinks clone was at candidate `8a320759e5fd096d8fb6d77ae92c3e117f8a17ae`; it was clean before the checker replay. `node artifacts/coverage004-round-4/builder/check-guide-release.mjs` exited 0. Its complete stdout and stderr are saved in `checker-replay.stdout.txt` and `checker-replay.stderr.txt`; both byte-match the committed builder outputs. The actual receipt reports 23 local links checked and 0 missing, 109 historical rows split 78/13/18, 18 frozen editable IDs, 0 full historical executions, 0 parity claims, 20 current choices, and an 8-card default deck. The catalog functions reproduce 56/61 admitted and 62/67 claimed card totals, plus 40/42 admitted and 42/44 claimed troop-profile totals.

Independent checks matched the frozen `bf1e6120196db8a2927ce6ae893812e4c9b1115d` tree (`a306815db49583c41059dc19b37628aa5cb8c7a7`), all 11 changed paths to the declared owned-file list, and all 43 prior COVERAGE-004 file hashes to their bytes in the frozen source commit. The collection audit records 20 browser entries; the frozen reviews show H1 PASS 439, D PASS 443, APP-004G PASS 444, H2 QUESTION, and CARDS-019I candidate `32c31da5269391cc0f6766cfacc0c78f0982fa5d` unaccepted. `SOURCES.md` and its low-confidence caveat are linked. The pinned current-release workflow and HTTP checks agree with the `bf1e612` capture, and a new live check is stored separately in `live-release-recheck.json`.

One claim does not match its evidence. [The guide, line 42](../../../docs/completion-inventory.md#L42) says the captured receipt records “response times.” In `live-release-evidence.json`, endpoint objects have `url`, `status`, `finalUrl`, `headers`, `bytes`, and `sha256`; the capture script records HTTP `Date` and `Last-Modified` headers but measures no response duration. The checker does not detect this wording mismatch.

BIGGEST GAP: The guide says the live receipt contains response times, but neither the receipt nor its capture script measures or stores response duration.
