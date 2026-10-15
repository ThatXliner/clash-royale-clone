PIECE: CARDS-023K — Aether Well mixed-deck and RL admission
VERDICT: PASS

EVIDENCE:
Fresh Node v22.22.3 execution on assembly HEAD 392dc987ef15603b11cffc9a68d33f7557a51216: editable-deck 12/12, full RL environment 16/16, Aether Well lifecycle 1/1, nondeterminism guard 10/10, shipping-isolation guard 13/13, roster admission 7/7, integration audit 6/6. All seven direct exits were 0; 65/65 tests passed. The integration audit reported manifest SHA-256 259d5fcfbc33e9bcb983676891f8b5d723255e25ca82af53348eaa0363e520b1 across 68 supported occurrences and 63 unique IDs.

Independent seed-2 actual-GameSession trace with the unforced controller: both sides deployed Aether Well at cost 6 (elixir 4 afterward); south combat death at tick 474; north cadence ticks 540, 1080, 1620, 2160, 2700, 3240, 3780; expiry at tick 3900; final tick 3901; restored fork equality true. The new lifecycle test checks a single combat destruction but does not pin tick 474. In this run the maximum observed post-grant elixir was 7; the separately frozen HBR cap test is outside this CARDS023K fresh-run set.

Source fence: d87319857f48534a1d207fc3610c1f4ecdb3de99 changes exactly five src/tests paths from 22fc972fcba5357957ffacfe43c59662f95344b2. The independent frozen-blob ledger says all 12 source blobs (seven HBR and five CARDS023K) matched their pinned candidate commits; scripts, dist, package manifests, and the private checkout stayed unchanged/clean. Source/test diff check exited 0. Raw stdout/stderr, direct exit files, command records, trace, and hash-size ledger are in this directory.

BIGGEST GAP: Resource amount, deploy/HP, recipient, cap, placement, and ordering remain QUESTION, so this proves local admission and the three source-aligned values rather than historical Aether Well parity.
