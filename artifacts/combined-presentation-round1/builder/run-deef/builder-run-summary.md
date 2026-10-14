# Combined presentation source qualification receipts

Accepted source: `deef7537e9a5b5caa2112da0a59c710595d072b5` (detached private checkout `/private/tmp/combined-presentation-run-deef-20261014`). No source files were edited. The exact clean parent used for the ART comparison guard is `5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146` at `/private/tmp/combined-presentation-parent-5ed-20261014`.

The pinned install completed with npm exit 0 (`npm-ci.log`, `npm-ci.exit`). The sequential combined Node gates passed 98/98, exit 0 (`combined-node-gates.tap`, `combined-node-gates.exit`).

The native ART browser gate passed 1/1, Node exit 0, duration 45.7 seconds (`art-native.tap`, `art-native.exit`). It produced 33 files in `art-native-live-browser/`. The previous 33-file tracked ART artifact tree was preserved under `preexisting-art004-live-browser/`, then restored byte-for-byte; compare `preexisting-art004-live-browser.sha256` with `restored-art004-live-browser.sha256`.

The current Cards021 browser gate passed 1/1, Node exit 0, duration 321.2 seconds (`cards021-browser.tap`, `cards021-browser.exit`). It produced 68 files under `cards021/`; the browser evidence records 65 screenshots, zero console/page/request errors, zero screenshot mismatches, seven checkpoints across four contexts each (28 restore contexts), and trusted player input. Ground contact applied 230 damage and emitted a contact/damage audio cue; air contact applied 230 lethal damage and recorded the death phase. Both structures expired at ticks 1800 and 1803; the real match reached its natural terminal at tick 6645, then restarted with the same seed-zero deck and accepted a post-restart deployment. See `cards021/browser-evidence.json`, `cards021/terminal-browser-snapshot.json`, and `cards021-artifacts.sha256`.

Pre/post source, public-asset, test, package, and lock manifests match for both browser runs (`source-before-art-native.sha256`, `source-after-art-native.sha256`, `source-before-cards021.sha256`, `source-after-cards021.sha256`). All seven ART blobs match `b460d2e319ca67ff82503ffca31506e941c39d85`; all eight VIS blobs match `c4bf8ccefbd0dcb0a6c554a247d2199e13fcd7b0` (`protected-component-blob-identity.tsv`). The continuation kernel is 523,788 bytes against the 524,288-byte cap; the lock SHA-256 is `d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4` (`source-fences.txt`).

These are combined functional/browser results only. They do not establish the separate full 18,000-tick GPR7A endurance qualification or a fresh combined critic verdict.
