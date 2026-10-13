# CARDS-016I builder round 2

## Browser run

Command:

```sh
APP_SHELL_ARTIFACTS=/Users/me/.codex/worktrees/9456/clash-royale-clone/artifacts/cards016-integration-round-2/builder/app-shell npm run test:app-shell -- app-shell
```

Result: PASS, 1/1 app-shell tests, 62.013 seconds. The browser evidence records the exact 390x844 and 1440x933 viewports. At 390x844 the arena iframe fit the available area at 370.6875x659. The previously reported viewport assertion failure did not reproduce in this run.

The custom deck receipt records three replacements (Stonehauler, Gloamwing Cluster, and Coppershade Flock), trusted live deployment of both air swarms, Gloamwing's five bodies and 2-elixir spend, Coppershade's six bodies and 5-elixir spend, deck cycling, and Coppershade's projectile against an airborne opponent. The in-flight snapshot restores byte-for-byte and its 120-tick continuation replays exactly.

Evidence and captures are under `app-shell/`, including `browser-evidence.json`, the replacement/deployment screens, and the in-flight projectile screen. This round changes only the browser test and its evidence; no game runtime or default deck code changed.
