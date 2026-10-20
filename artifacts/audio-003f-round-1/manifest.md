# Bounded AUDIO-003F adoption packet manifest

## Provenance and scope

- Tracking-file base is exact accepted main `59d9fda9093b058cd3025a804835629b0552eeef` from `/Users/me/.codex/worktrees/9456/clash-royale-clone`.
- Engine candidate evidence is exact `57baa0e6df0ea646abae3c155c05002e97336072`; corrected accepted-main evidence is exact `59d9fda9093b058cd3025a804835629b0552eeef`.
- This is an external review packet only. No repository file, HEAD, index, or source checkout was changed. Packet assembly performed static file/hash checks only; the listed focused Node runs were performed earlier by the builder and independent critic.
- Piece added: `AUDIO-003F`, `PASS`, `1/1`, round 1. New totals: 312 tracked pieces, 252 PASS, 542 rounds, 31 QUESTION. Prior PLAN states are unchanged; `rounds.md` is the exact original main byte stream plus the Round 542 append; the progress file reverses exactly to exact main if its one added row, one added trajectory item, and three displayed totals are removed/reverted.
- The change is strictly in `tests/game-audio-runtime.test.js`. The authority/admission implementation, runtime, factory, chain, full-engine state, and all unrelated piece states are outside this packet and unchanged.

## Execution ledger

All focused commands were `node tests/game-audio-runtime-runner.js game-audio-runtime` on Node v22.22.3. Each run executed the full 11-case module.

| Source and fixture | Result | Process closure |
| --- | --- | --- |
| Candidate `57baa0e…`, original fixture | 6/11 pass, 5 setup/admission failures, exit 1; builder | PID 1301 absent after wait |
| Accepted main `59d9fda…`, original fixture | same 5 setup/admission failures, exit 1; builder | PID 1570 absent after wait |
| Candidate `57baa0e…`, corrected fixture | 11/11 pass, exit 0; builder | PID 1482 absent after wait |
| Candidate `57baa0e…`, corrected fixture | 11/11 pass, exit 0; independent critic | PID 2162 waited/reaped; `kill -0` false |
| Accepted main `59d9fda…`, corrected fixture | 11/11 pass, exit 0; independent critic | PID 2729 waited/reaped; `kill -0` false |

The builder’s corrected-main run was **not** performed: its main run was unmodified and failed as above. The corrected-main PASS is only the critic’s separately reconstructed run. No full `npm test` result is claimed.

## Hash and count pins

- Original test source on both candidate and main: SHA-256 `f61ca9c9047130469b9e85f8c50be591c4ae54ba9555aa70a81f258828c3123a`.
- Corrected test source: SHA-256 `83f5f8f6e056f1b36252f6b608b3cfb99696095c09e8da1e148fde5397cefbde`.
- Exact patch: SHA-256 `011fbd9c9ac3fe5ea50417cfa7accec55893592cc90ce257452d57986d92e999`.
- Builder raw logs: original candidate `17dd686a6f2eb7c50e27f27e10eac1a3bfe455936613c3e6a33469df069fa120`; original main `28b8f34a56d4b5c93371d184a0d7cdfacea97abafc2d536b0764a65c9e1d3fa4`; corrected candidate `1cb79103e614ae6f3b098dbe79c3080fe258c7e0b3449a9265f5522eef35f9d0`.
- Independent critic raw logs: corrected candidate `dc203c4428fd15da70c77990aa1995d844dd8cc98ee6694d3c54e7dd360b762b`; corrected main `012f19cb38ac8783d8d119a361d427ba7a159895ae3d3b8b22d7eaa65d0ef59f`.
- Independent main assertion-diff records that every prior assertion remains and only the stationary-card existence assertion was added; retained at `evidence/critic-main/assertion-diff.txt`.
- Candidate full-tree SHA manifests are intentionally omitted from this packet: 16,872 entries each. Before SHA-256 `e3b6c5c46879fc5aa2dacf7825ea52fbfcecc1c42a724d4146d5794ac2571d54`, after `2919fb4931af586bc87afba4ceae440bbf31c6a88b165dcde25dfc5107467957`, changed-manifest diff `d165cfd0db0b3ce243529eab1bc00b5d31bb936e103953b35e0b5b8441c590bb`. Original manifests remain at `/Users/me/.codex/clash-qualification/20261020-game-audio-fixture-repair/audio-fixture-critic-independent/{before.sha256,after-patch.sha256,changed-tree.diff}`. Their comparison changes exactly the test file.
- Accepted-main full-tree SHA manifests are intentionally omitted from this packet: 17,377 entries each. Before SHA-256 `7fd34edc51622cafa18b725a8b67cbf7813a68cde80d81b5e0d4226a068d4ebf`, after `33ccea5e82ec43e9fea3bd013663301d4f8d60bc097db36360b44f2597bc3c7f`, changed-manifest diff `ccbaa75cd8c964696b4551054231441bd538e69eec90885eaab64a7e7f655706`. Original manifests remain at `/Users/me/.codex/clash-qualification/20261020-game-audio-fixture-repair/audio-fixture-critic-main-independent/{before.sha256,after-patch.sha256,changed-tree.diff}`. Their comparison changes exactly the test file.
- Critic source archives were not copied; they remain in sibling `source/` directories at those two external locations. Builder archives were not copied; the builder’s recorded `diff -qr` likewise reports only `tests/game-audio-runtime.test.js` changed between its candidate copies.

## Included files

- Candidate tracking changes: `PLAN.md`, `rounds.md`, `progress.html`; unified diff in `tracking-changes.diff`.
- Corrected test source: `tests/game-audio-runtime.test.js`; exact one-file patch: `proposed.patch`.
- Bounded source diagnosis and pins: `diagnosis.md`, `run-pins-builder.txt`.
- Builder original candidate/main failure logs, corrected-candidate pass log, exits, PIDs and closure records: `evidence/builder-*`.
- Independent corrected-candidate and corrected-main raw TAP, run records, checksums and process closure receipts: `evidence/critic-candidate/` and `evidence/critic-main/`.
- Critic summary: `evidence/critic-report.md`; retained exact main assertion diff: `evidence/critic-main/assertion-diff.txt`.
- Per-file packet hashes: `files.sha256` (generated after packet contents are finalized).
