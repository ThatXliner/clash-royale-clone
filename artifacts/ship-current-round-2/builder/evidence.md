# Published-state verification

Checks were made on 2026-10-13 UTC against GitHub and the live Pages deployment.

`git ls-remote origin refs/heads/main` returned `ae4a63e4bc544a8c195fc24abd5f6d17801cd1d4`. GitHub's Pages API identifies `http://bryanhu.com/clash-royale-clone/` as the public workflow-built site. Workflow run [38431846142](https://github.com/ThatXliner/clash-royale-clone/actions/runs/38431846142) completed successfully on `main` at the same SHA.

Live GETs for the home page, game index, and referenced roster bundle returned HTTP 200. The home page's source links name the published SHA, and all three assets report `Last-Modified: Tue, 13 Oct 2026 16:39:44 GMT`. Their SHA-256 hashes are in `live-pages.sha256`; the selected source links and compiled roster excerpt are in `live-extract.txt`; response headers are preserved alongside them.

The served roster bundle defines eight base troop choices, nine additional editable troop choices, and one non-troop choice (`squall-orb`), for 18 total. The two air swarms `gloamwing-cluster` and `coppershade-flock` are present. Its source-confidence receipt encodes a 100 ms, six-tick relative interval under `supercell-2020-06-02-multi-unit-deployment` for those two cards. This evidence covers the interval between members, not first-member onset, geometry, or historical order.

GitHub's compare from `796708ef622a0292cdd71fa4cf0a81c9af48b3b1` to published `ae4a63e4bc544a8c195fc24abd5f6d17801cd1d4` reports ten later commits, with no changed `src/`, `public/`, or `demo/` paths. The 18,000-tick endurance receipt is for the exact `796708ef` candidate: its seed-zero default-eight Chrome workload reached tick 18,000 and restarted, with the main workload taking 811,580 ms. See [the independent endurance verdict](../../game001gpr4-round-1/critic/verdict.md) and [the CARDS016 stagger verdict](../../cards016-stagger-round-2/critic/verdict.md).

Local candidate `c981ec2444b9d2f08dacdb5c6f04ce6b5b786dfb` is not published and is not covered by that endurance run. It adds relative stagger timing for five more squad cards, including default Briar Band. The exact remote, Pages API, workflow, comparison, asset hashes, and parsed live choices are recorded in the adjacent JSON and text files.
