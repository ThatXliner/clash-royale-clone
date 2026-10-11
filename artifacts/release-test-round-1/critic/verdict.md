PIECE: RELEASE-TEST-001
CANDIDATE: c3601c3a3c61bc15922716f510b2386f7b49676f
VERDICT: FAIL

The requested scoped suites passed 32/32, including the real Chrome CSP and host-isolation checks, and the assembled Pages audit passed with 15/15 canonical assets byte-identical, zero duplicate hashed copies, 42 release files, no runtime dependencies, and successful browser RL and arena-shell qualification. These passes do not close the source-boundary gap.

Independent frozen-fixture probes reproduced seven forbidden accepted imports: unused and used direct relative imports from `reference/stats/cards.json`; unused and used relative imports from `node_modules`; and unused and used absolute imports from `node_modules`. The used reference JSON marker and package marker appeared in emitted chunks. An authored inline `export * from "vite/modulepreload-polyfill"` was also accepted, while bare `reviewer-probe` was rejected and benign comment/string-literal text passed. Exact fixture inputs, manifests, emitted JS, and receipts are under `source-graph-probe-artifacts/`; the aggregate output is `source-graph-probes-final.log`.

BIGGEST GAP: The policy checks bare specifiers and emitted output instead of every resolved authored source edge before tree shaking; the inline HTML AST also omits export-from edges, so protected reference/package imports and an authored Vite internal import can pass.

The Pages manifest is 5,361,828 bytes, 7,068 bytes above the prior 5,354,760-byte manifest; `pages-manifest-delta.json` records the 17 regenerated chunks and six shared paths with changed hashes. The release browser test separately recorded 5,354,760 bytes, so the two output receipts are preserved distinctly rather than treated as identical. The prior 57/57 full endurance result is retained only by runtime/harness source-hash continuity; no fresh 18,000-tick run or full `npm test` was performed for this candidate.
