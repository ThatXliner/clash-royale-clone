# Release isolation round 2 builder receipt

Frozen source candidate: `1872eb965aeb62232994541a517f39c65974241d` (`enforce resolved release source boundaries`). The clean archive was extracted from this commit at `/tmp/release-test-round2-4MhYw6`; its tracked files are from the immutable source commit, with the pinned `node_modules` dependency tree linked for execution. The archive was removed after qualification.

Clean-archive qualification passed all 33 tests:

| Suite | Result | Receipt |
| --- | ---: | --- |
| Shipping isolation release (includes real-browser CSP and hostile-loader checks) | 4/4 | `archive-shipping-isolation-release.log`, `archive-release-evidence.json` |
| Shipping isolation host | 1/1 | `archive-shipping-isolation-host.log` |
| Shipping isolation guard | 13/13 | `archive-shipping-isolation-guard.log` |
| Publication Pages | 5/5 | `archive-publication-pages.log` |
| Nondeterminism guard | 10/10 | `archive-nondeterminism-guard.log` |

The release evidence records 42 artifacts totaling 5,358,095 bytes, identical repeated production builds, and manifest SHA-256 `910e31b28f6b572dfa1aa30635015c13b75dc311b7054040b07d11edc675adad`. The browser evidence records CSP rejection for unmanifested fetches, eval/Function loaders, and an external frame.

The preserved round-1 source graph probe cases were rerun against this code: reference JSON (used and unused), relative and absolute package file imports (used and unused), and inline `export *` of Vite's polyfill were rejected; the bare-package rejection and benign comment/string case remained correct (9/9 expected outcomes). See `source-graph-probes.mjs` and `source-graph-probes.log`. The shipping-isolation regression suite also covers protected-path symlink resolution with a query, outside-root absolute imports, and acceptance of the generated Vite modulepreload edge.

The local shipping-isolation release suite also passed 4/4. Its evidence is separate from the clean-archive receipt because the live checkout contains unrelated concurrent runtime changes. This packaging-only candidate was not claimed to pass the full endurance run.
