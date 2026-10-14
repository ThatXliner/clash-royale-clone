# GAME-001GPR7A strict accepted-source verdict

**Verdict: ACCEPTED for the requested endurance and audio qualification scope**
on exact frozen source `5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146`.

The final four suites passed **22/22 TAP subtests**. The default-eight full
journey, separate full Kilnkeeper custom-eight journey, audio adapter suite,
and native-Chrome audio production suite all ran sequentially with the pinned
toolchain. The initial audio-production attempt is preserved as a setup
failure: its unique output directory did not yet exist, so `writeOfflineRender`
failed with `ENOENT` after four tests passed. After creating that empty
per-run output directory, the unchanged suite passed 5/5. No source, harness,
budget, tolerance, browser flags, or masks were changed.

| Gate | Result | Evidence |
| --- | --- | --- |
| Default-eight, no tick override | PASS, 3/3; 977,482.6 ms | [raw TAP](default-eight/raw.tap), [result JSON](default-eight/browser/endurance-result.json), [summary](default-eight/result-summary.json), [terminal screenshot](default-eight/browser/terminal.png), [restart screenshot](default-eight/browser/restart.png) |
| Kilnkeeper custom eight, no tick override | PASS, 3/3; 450,589.9 ms | [raw TAP](kilnkeeper/raw.tap), [result JSON](kilnkeeper/browser/endurance-result.json), [summary](kilnkeeper/result-summary.json), [terminal screenshot](kilnkeeper/browser/terminal.png), [restart screenshot](kilnkeeper/browser/restart.png) |
| `test:game-browser-audio` | PASS, 11/11; 588.9 ms | [raw TAP](audio-browser/raw.tap) |
| `test:audio-production-assets`, native Chrome | PASS, 5/5; 6,024.8 ms | [attempt 2 TAP](audio-production-assets/attempt-2/raw.tap), [captured evidence](audio-production-assets/generated/audio-production-evidence.json), [offline WAV](audio-production-assets/generated/audio-production-offline.wav), [summary](audio-production-assets/result-summary.json) |

Default-eight reached a natural terminal at tick 18,000: South won 2–1 by
`tiebreak_lowest_hp`. Its final session transcript contains 18,000 steps,
40 submitted card commands, one pause, and one resume at seed zero. The
300→600 branch restored from 600 to 300 and replayed to byte-identical browser
snapshot, E2 session, bridge, projected layers, and audio continuation. The
actual sink had 55 starts both before and after restore; the 29 typed
simulation continuation cues matched on domain, cue ID, family, sequence,
type, and tick. UI sequence stayed 2 through restore and advanced to 4 after
the two replayed UI cues. Sequence-zero simulation and UI domains remained
distinct. The exact seed-zero restart byte assertion passed.

The separate eight-card Kilnkeeper setup
`coilblade,mossguard,copperskiff,kilnkeeper,brassbolt,reedsting,briar-band,cinderlings`
reached a natural terminal at tick 10,800: North won 2–1 by
`regulation_crowns`. The same seed-zero deck restarted at tick 0 and passed its
exact session-byte assertion. Kilnkeeper was delivered for 5 elixir at tick
0; the opposing Kilnkeeper launched at tick 60 and landed three recorded
projectile contacts at ticks 243, 327, and 411. Those contact records matched
exactly after the 600→300→600 restore replay. Its actual sink starts did not
change during restore (54 at both observations), and all 27 typed simulation
continuation cues matched. UI sequence stayed 4 through restore and advanced
to 6 after the replayed card-select/card-play commands.

Both endurance runs stayed within the unchanged limits. Default maximum
one-tick slice was 30.7 ms and maximum 300-tick segment was 10,333 ms;
Kilnkeeper maxima were 23.3 ms and 10,284 ms. Initialization tasks peaked at
162 ms against the 300 ms cap. Neither run recorded a non-initial long task;
both completed below the 1,200-second total cap. Both ended with zero
console, environment, resource, or unhandled errors and no pending resources.

The 11-test audio adapter suite validates lifecycle, unlock, gain/mute,
rejection, replacement, and transaction behavior with its controlled Web
Audio test contexts. Native PCM evidence comes from the separate real-Chrome
gate: 45 captured non-zero PCM buffers at 12 kHz across nine cue families,
with mute observations, effective gain, restart unlock behavior, movement
PCM, and all 17 pinned waveform recipes recorded. The WAV and evidence JSON
are checksum-listed under `audio-production-assets/generated/`.

All four per-gate source fences passed: the detached target remained exact
5ed, and all 535 tracked files under `src`, `public/assets`, and `tests`, plus
both package manifests, were hash-identical before and after each gate. No
source files were added or left untracked. The protected continuation kernel
remained at its pinned SHA-256 and 524,103/524,288 invariant.

This verdict is scoped to these deterministic journeys and audio gates. It
does **not** claim full 109-card historical parity, settle low-confidence
`SOURCES.md` questions, or complete reference-footage visual comparisons.
Those remain explicit project gaps.
