# Source-vintage restore fixtures

These seven files are exact public-restore inputs copied from
`artifacts/gtc-diagnostic-packet-20261016/attempt4-public-restore-control/run/exact-captured-snapshots/`.
The c9 input is a LiveBattle version-2 snapshot from source pin
`c9c818f7ac281b0e71890a2be17ce757f688b4c5`. The six 2a inputs are GameSession
version-2 snapshots from source pin `2a5bd7a44ad3773de59e8e6dd8baaebf0ec09764`.

The packet's public-restore control recorded that current restore rejects the
c9 snapshot at `roster[6]` and each 2a snapshot at `roster[7]`, because the
Briar Band setup lacks the current source-confidence policy. The Rime Adept
snapshot rejects in the status runtime at
`rime-adept.entities[0]` because the archived entity lacks the current
source-confidence/projectile claim. The focused regression in
`tests/game-troop-runtime.test.js` pins each input hash and requires the exact
applicable policy error. The fixture records prove rejection of these inputs
only. They do not establish migration behavior for every old checkpoint.

| File | Bytes | SHA-256 |
|---|---:|---|
| `c9-empty-live-battle-v2.snapshot` | 11618 | `874c2b8e8642447e627e850e8511b58009e57c22e3d9d2cc42ab447b4af8429a` |
| `2a-game-session-bloom-wisp-v2.snapshot` | 200458 | `552625d664701401763e78aeb1b3b8ce79b2abaa41142b71eb45c98046d4dfd9` |
| `2a-game-session-dawnmender-v2.snapshot` | 200434 | `c7ee4536c9ca885fde04ef99b149fca31e8c138cc9cf9fc96c5ec03b4ff75a2e` |
| `2a-game-session-pulse-sentry-v2.snapshot` | 200506 | `711028fb73a858df0546bb847b038b40238823fa71d2bf3ad9b1f4bad279b3e0` |
| `2a-game-session-rime-adept-v2.snapshot` | 200458 | `96ea0ac365b8fb70a65c19eaeb940812a385fc05a580a2aa5621bda2e9502d92` |
| `2a-game-session-tether-rider-v2.snapshot` | 200495 | `67221b82e6885ae4417dd7019d41c5e778c34038dac4cccd010eed166224c0b5` |
| `2a-game-session-veil-prowler-v2.snapshot` | 200501 | `e184782f3d14d389ef97dea893f9db469095e7f4e0326024b238233419c312e3` |
