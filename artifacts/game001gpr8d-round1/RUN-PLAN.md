# RUN-PLAN — one clean full-default endurance run

Wait for the root's exclusive runtime grant. Then run only the committed three-case browser endurance test in the isolated candidate. The intended environment is Node `/Users/me/.hermes/node/bin/node` v22.23.4, native Chrome 155 at the path below, and the explicitly pinned Playwright 1.58.2 module from the existing e35 dependency tree. The binaries have not been invoked during preparation.

Run from the candidate directory:

```sh
cd /Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/candidate
/usr/bin/env -i \
  HOME=/Users/me \
  TMPDIR=/tmp \
  PATH=/Users/me/.hermes/node/bin:/usr/bin:/bin \
  LANG=en_US.UTF-8 \
  GAME_BROWSER_PLAYWRIGHT=/Users/me/.codex/clash-qualification/20261020-factory-r5/attempt-20261020T155551Z/candidate-e35dda4c0225b88ddac91a56f15e81fee32c3c68/node_modules/playwright/index.mjs \
  GAME_BROWSER_CHROME='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
  GAME_BROWSER_ENDURANCE_SCENARIO=default-eight \
  GAME_BROWSER_ENDURANCE_ARTIFACTS=/Users/me/.codex/clash-qualification/20261022-current-main-endurance-round1/runtime-evidence/ \
  /Users/me/.hermes/node/bin/node --test tests/game-browser-endurance.test.js
```

`env -i` removes inherited overrides. In particular, no tick bound is set; the test takes its full 18,000-tick default. The artifact directory is outside the candidate and has the trailing slash required by the test's filename concatenation. Preserve the unfiltered test output, exit status, `endurance-result.json`, and screenshots under `runtime-evidence/`. Do not run npm install, a separate smoke, a diagnostic/profiler command, a modified-threshold run, or a second attempt. Keep the candidate source manifest and root Git index unchanged across the run.
