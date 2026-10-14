# Candidate source fence

Candidate: `43292aae51a80966d2e02bd7dd38d5e9342b8ec2` (`Fix app-shell routing for admitted defensive structure`).
Parent: `049cd15c2bd51d4a6272550b36b740e2e6ee53fb`.

All examination ran in the detached private worktree `/private/tmp/release-arena-failure-critic`. The root checkout and its index were not edited. Candidate-owned source hashes before and after the review match exactly; see `source-pre.sha256` and `source-post.sha256`. `git diff --check` is clean. The candidate-to-parent file fence is recorded in `candidate-parent-changed-files.txt`: three code paths (`src/ui/app-shell.js`, `tests/app-shell.test.js`, `scripts/release-browser-qualification.js`) plus the nine builder receipt files under `artifacts/release-arena-failure-round1/builder/`.

The release and Pages tests rewrote tracked evidence files from earlier rounds in this private worktree. Their generated versions were copied under `generated-check-output/`, then the tracked paths were restored. The private candidate worktree now has no tracked changes; its only untracked path is this critic evidence folder.

The negative control used a second detached worktree at the candidate commit. Only `src/ui/app-shell.js` was replaced with the parent version; candidate tests and browser qualification code remained. The restored parent source hash was `52583b25caeb58b0e9217d87702748cb6cf29e983d370b065a7159a1d0dbe330`. `negative-control.txt` records the expected startup failure: the app-shell import throws `RangeError: session troop battle card ID is unknown or not admitted`, the shell remains on Home, and the battle iframe never appears. The negative control did not modify the candidate worktree.

The isolation guard and isolation-release suites were started in parallel. The negative-control process overlapped the isolation-release process; the isolation-release suite performs Chromium qualifications during its production-build case. At a process snapshot during the overlap, no Chrome process was visible, so simultaneous browser execution is unconfirmed. The focused prefixed Pages probe ran only after both suites completed. No timing or endurance conclusion is drawn from these runs.
