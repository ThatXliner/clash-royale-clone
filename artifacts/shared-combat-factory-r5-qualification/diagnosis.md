# R5 building-choice first failure

This packet records the first blocking result from the unadopted R5 factory candidate and a minimal source-only repair proposal. The qualification checkout and raw evidence are preserved separately under /Users/me/.codex/clash-qualification/20261020-factory-r5/attempt-20261020T155551Z. This bounded packet omits Git databases, installed dependencies, caches, and unrelated artifacts.

## Pinned run

- Candidate: e35dda4c0225b88ddac91a56f15e81fee32c3c68, parent a754b30a18f4bc99af4617c0265b2a9055df74bc.
- Differential baseline: 7f41167c2429eec637dbb7c5f838fa3b404ab4d2.
- Command: unfiltered npm test; direct npm PID 39268. The exact working directory and allowlisted environment are in evidence/default-npm/01-repository-default-npm-test.argv.txt, .cwd.txt, and .env.tsv.
- Runtime: Node 22.22.3, npm 10.9.8, Playwright 1.58.2, Chrome 155.0.8059.85. The captured environment has no endurance tick override or scenario override.
- The first TAP failure stopped the owned process tree. npm exited 130 after the failure monitor requested stop; process-closure.tsv records the direct process and descendants absent. The retained release build was not reached and is unrun.

## First failure and cause

Immediately before the failure, the default browser endurance, roster witness, deck choice, and deck keyboard test files completed successfully. The first failing test was:

    game browser building choice: Bulwark Needle deploys and defends through the shared session
    TypeError: roster[7].entities[0] source confidence field lacks a QUESTION record

The verbatim TAP record and stack are in evidence/default-npm/01-repository-default-npm-test.stdout around lines 3698–3717.

At src/ui/game-browser-entry.js, createBulwarkNeedleSessionWitness() builds an eight-card roster by placing Bulwark Needle before the default playable roster without Cinderlings. Roster entry 7 is Briar Band; its entity 0 is Briar Runner. The witness's local key collector includes the generic body-radius, projectile-speed, delivery, layer, and damage policies, but omits entity.sourceConfidencePolicy.fields. The first required missing key is briar-runner.count; the policy also requires the remaining Briar Runner confidence keys and the Briar Darter keys. The error comes from strict setup admission in assertSessionTroopSourceConfidenceQuestions(), which correctly requires a QUESTION record for every confidence field.

The central policyQuestionKeys() collector in src/content/session-troop-roster.js already includes source-confidence fields, and the editable-deck collector does the same. createPlayableRosterQuestionRecords() supplies fresh, unverified QUESTION records for these fields. The custom Bulwark witness is the only collector in the audited paths that omits them. The failure is an incomplete witness question inventory. The confidence policy, values, provenance, and strict validation remain intact.

The failing UI entry, test, playable roster, session troop roster, source-confidence authority, and editable-deck blobs are byte-identical between the accepted parent and failed candidate. The extracted continuation kernel differs as expected; the source-confidence admission call remains in its setup path. This supports a pre-existing witness fixture defect rather than attributing it to factory extraction. No control run was performed, so this is a source-identity-supported diagnosis, not a claim that the accepted parent passed the same browser test.

## Proposed minimal repair

In the Bulwark witness's existing generic policy-key collector, append every source-confidence field questionKey:

    .concat((entity.sourceConfidencePolicy?.fields ?? [])
      .map(({ questionKey }) => questionKey))

This mirrors the established collectors, preserves all policy records and values, and leaves authority and validation unchanged. The applicable standard unified diff is repair/proposed-repair.patch, SHA-256 e5e7af7bcd13aa8edbe0349dfdba946cab03c11c9e8a3638725064339a54eeec. The earlier side-by-side diagnostic rendering is preserved as repair/proposed-repair.previous-rendered.txt, SHA-256 e77d2c67a0ba724454469c5ee3d082a4c0ace5f3f25d6e9324e41a52e03f9d0b.

The isolated source copy is repair/game-browser-entry.proposed.js, proposed Git blob 42cdefd5e5fc192d555d6748f421df72b95ec778; its base e35 blob is 62ab029a51445cd06767656454f28338d2f88698. The isolated checkout is detached at e35 and has only this one source file modified. git diff --check passed. I applied the exact standard patch to a fresh copy of the e35 source; the result's SHA-256 is 3d66373279344dd0fc26e8cc0ca6414122e81a2c37d042a8d968dd7fa09f0aa3 and its Git blob is 42cdefd5e5fc192d555d6748f421df72b95ec778. The proposed source has not been executed or tested.

Suggested focused checks after a runtime slot is released:

1. node --test tests/game-browser-building-choice.test.js to exercise the failing witness.
2. node --test tests/game-browser-roster-witness.test.js tests/game-browser-deck-choice.test.js tests/playable-roster.test.js tests/editable-deck.test.js tests/game-roster-admission.test.js to cover neighboring witness and admission/question-record paths.
3. After those pass and a separate critique, rerun the complete unfiltered default npm test and retained release build on the repaired source. The e35 full-run artifacts below do not qualify the repaired source.

## Preserved full browser evidence from e35

The browser gate completed before the first failure and wrote a later-snapshotted full-run result. The bounded smoke artifact that subsequently replaced the candidate checkout's live result file is not used here. This packet preserves the earlier default-eight-full-18k result and active screenshot:

- Result JSON SHA-256: 26c9d394e010f2270cb18c68c3a493ed1fcf7f6e745c9569ebf73a0f975d2b69.
- Active screenshot SHA-256: e91b3fff3ebc2a7e794e4b5f98f4d6e177584f05c24790988b5207d851f13814.
- Result states 67 segments, terminal tick 18,000, natural South 2–1 win, restore cut at tick 300 with a 54,012-byte snapshot, restart count 1, setup SHA-256 306bb30da40ce7c43d6cccce8728449da90fc0e9ca7d13c81f0116ba710aec8c, clean server exit, no errors or audits, and recorded max long task 206 ms. The per-segment cap was 50 ms and initialization cap 300 ms.
- The Node session endurance gate also reached 18,000 ticks in 204 recorded 300-tick workload segments, with configured restore cuts and the 900-tick paid-deployment guard intact. This evidence is part of the preserved default-npm raw output and was run on exact e35 source pins.

These results prove only the gates and source identity recorded for e35. The default npm test did not complete, the retained release build did not run, CARDS022Q was not qualified, and the factory candidate remains unadopted.
