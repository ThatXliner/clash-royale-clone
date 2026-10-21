PIECE: ART-3D-SKY-002 round 1
VERDICT: FAIL

FRESH RUN: Blender 5.1.2 exited 0 after rendering 384 images, 336 semantic masks and the portrait. Fresh render receipt confirms the saved Blend byte record is unchanged. The metric run exited 0 and measured 286 nondiagnostic gate instances: 164 pass, 122 fail. Every-frame projection: 848 rows, 0 failures, minimum geometric crop margin 4.1662750244140625 px. Native raster crop minimum: 4 px. Contact geometry/facing gates pass 16/16; team grayscale separation passes 12/12. Candidate build receipt reports 1,424 total evaluated scene triangles, 1,136 actor triangles, 26 editable meshes and 8 materials; GLB has 1,136 triangles and no external buffers or images.

BIGGEST GAP: Lower stones touch or overlap the presentation ring in all 24 team/heading/pose cells (Chebyshev separation 1, no alpha-clear witness; north idle has 10 overlapping support pixels), so the required floating clearance is absent throughout the native sheet.

OTHER MATERIAL FAILURES: Core bright-2x2 fails 18/18 side-view cells; core median fails all 18, with median luminance 0.713–0.848 against >=0.85 and often only one bright pixel. Copper median fails 16 cells. Actor height fails 6 cells, N/S width fails 8, fists fail 12, head/chest gaps fail 12, and isolated hammer block fails 2 (west walk has 5 outside pixels against >=6). Numeric contact gates pass, but walk remains visually subtle in the native sheet. Core appears ivory rather than warm amber against the original painted portrait.

PRESERVATION: Numeric exact equality passes at post-export, post-save, fresh-load, mask-restoration and final-render stages; serialized byte equality fails at each stage with 428 equal-number token differences, consistent with signed-zero representation changes. No rounding or epsilon comparison was used. Candidate Blend bytes before and after the fresh render match.

## Preservation comparison clarification (appended)

The phrase “byte equality fails at each stage” in the verdict above means each operation-specific after-state compared with the candidate's original canonical state. It does not mean that every operation changed the state relative to the immediately preceding operation.

I independently compared the full JSON state pairs and SHA-256 digests. The candidate canonical state is 1,164,818 bytes with SHA-256 `efb18214cf9a728e5c08e172bd28bf75d0eb8346b679d554474fe143de5141f9`. Every proof's before-state has that exact size and digest. Every operation-specific after-state is 1,165,246 bytes with SHA-256 `cd4a14aa55420cfbbe0df6406eb16bd82be74303c945cc3faef76640e32ee7ec`; the five after-state files are byte-for-byte identical to each other.

Each saved proof (`post-export`, `post-save`, `fresh-load`, `mask-restoration`, `final-render`) compares its before-state copy of canonical against its after-state. Each reports `numeric_exact_equal: true`, `numeric_difference_count: 0`, `byte_identical: false`, and `equal_numeric_token_difference_count: 428`. Inspecting those 428 entries shows exact zero-token changes from `0.0` to `-0.0`; no nonzero state value differs. Thus canonical→post-export has the signed-zero serialization difference, while each adjacent transition after export—export→save→fresh load→mask restoration→final render—retains byte-identical full-state JSON. Separately, the fresh render receipt reports the saved `.blend` byte record unchanged before versus after rendering.

The corresponding complete before/after states and proofs remain preserved at [candidate model preservation](/Users/me/.codex/clash-qualification/20261020-skymaul-redesign-round-1/candidate/attempts/attempt-05/model/preservation) and [fresh render preservation](/Users/me/.codex/clash-qualification/20261020-skymaul-redesign-round-1/critic-r1/renders/preservation). This clarification does not change the FAIL verdict or the recorded gate counts.

## Lower-ring clearance clarification (appended)

The 24/24 lower-ring clearance failures remain correct, but the earlier wording overstates what the evidence measures when it says there is a one-pixel separation or literal contact in every cell, and calls the north-idle projection count “overlapping support pixels.” The saved depth-tested metric rows and `source-only-next-correction-audit.json` distinguish visible support from isolated projection:

- In 14/24 cells (North and South, all three poses, plus West contact, for both teams), visible lower and ring support exists at Chebyshev distance 1 with no alpha-clear witness. `visible_overlap_pixels` is 0 in these rows, so this is adjacent projected support without the required empty step, not literal visible overlap. North idle's count of 10 is `isolated_projection_overlap_at_128`, not overlap between visible supports.
- In 10/24 cells (East idle/walk/contact and West idle/walk, for both teams), no lower group support is visible, so `support_missing` is true and `separation_chebyshev` is null. These cells fail because clearance cannot be demonstrated, not because a one-pixel contact was measured.

The accurate biggest-gap wording is: **Required floating lower-stone/ring clearance is not demonstrated: 14 cells have visible supports only one pixel apart with no clear-background witness, while 10 cells have no visible lower support to measure.** The FAIL verdict and 164/286 gate count do not change.
