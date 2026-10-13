import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUTPUT = path.join(HERE, "card-coverage-109-current-18.json");
const SOURCE_COMMIT = "a8c39bcc02329ba22b3fdd50be7d1089bc6010dc";
const RUNTIME_GRAPH_SHA256 = "68c1cdc9a917e579f0d1addaa4620d1a224918d1c86221c1b27faa0ab1049d19";
const RUNTIME_GRAPH_FILES = 70;
const QUESTION_SOURCE = "runtime-playability-estimate-not-comparison-corpus";

const PINNED_INPUTS = Object.freeze({
  "reference/stats/cards.json": "2903e9b3cb759fd6229b0463df4de8b29a5500995a768691fcfc9b5c05ff6b5f",
  "reference/stats/SOURCES.md": "9d2e56266451a02486f6893d35f37989660d6f9d838be2d953b8e242beff78ee",
  "artifacts/completion-inventory/reference/card-coverage-109.json": "e68bf690793d531c863f14117deace21de595c906ecbc8bf39cc98856cd33c07",
  "artifacts/completion-inventory-current-16/card-coverage-109-current-16.json": "674aa6320a79ae452f854e2bcc6e40fe4a504b3963cddb28815e876ef206118b",
  "artifacts/cards-expansion-round-2/reference-normalization.json": "7a9c140f5e0dfbccea101c8579230172b9d3026ea5b058a6645bfac020642228",
  "tests/cards-basic-melee.test.js": "3aa3123b8649cc0a7b5df662ed35e222526f051922ff7822b408cdecb2d90d1a",
  "tests/cards-basic-flying.test.js": "420718e09c171f1764b6f28cfb835c8cc38cdde2ad5fc59a88337277ff2535ee",
  "tests/cards-basic-ranged.test.js": "d25a34a944dd8710d75a4b00d7af9f187c642ebadeeddede9aa93260f179318c",
  "tests/cards-swarms.test.js": "c49735935ed65b4380801b28884529d05810e76aa5fbf7c5657c54dcfa53973d",
  "tests/cards-structure-seeker.test.js": "ca38c6a2b5ff164fa232402cdc7527f7c8135ca9f37c688d5ad6a19d2d463887",
  "tests/cards-expansion-round-2.test.js": "66b0ad1d7292afe22f997b4306e46932baa1ec1a0a727e9820ba5024d35285ee",
  "tests/game-roster-troops-ordinary.test.js": "c465f043c5344141ea2aa45f8eb2384fbb77bd56e3fe5b58a25e4115676ee451",
  "tests/editable-deck.test.js": "216ae59eb059172af211778d265d823364362b8d44fac33343413e2369fc34a5",
  "tests/cards016-integration.test.js": "db0c9dfe95ce0ac71efd81c6cb3eba20a0697a7936dbd2592efa1e738f8ec716",
  "tests/game-roster-troops-air-swarms.test.js": "8b89e4ee56c74a90ce1cf38a031d033aa253f8f58b55a50ded9dbb681225bba3",
});

const EDITABLE_IDS = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting",
  "briar-band", "cinderlings", "stonehauler", "thornscouts", "forgeguard",
  "cinder-host", "ironroot", "sunthread-pair", "duskwing-trio",
  "gloamwing-cluster", "coppershade-flock", "squall-orb",
]);
const TROOP_IDS = Object.freeze(EDITABLE_IDS.filter((id) => id !== "squall-orb"));
const DEFAULT_IDS = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul",
  "brassbolt", "reedsting", "briar-band", "cinderlings",
]);

const CURRENT_MAP = Object.freeze([
  ["coilblade", "mini-pekka", "tests/cards-basic-melee.test.js",
    "basic melee content: field parity is reported with confidence",
    'coilblade: {\n    benchmarkKey: "mini-pekka"'],
  ["mossguard", "knight", "tests/cards-basic-melee.test.js",
    "basic melee content: field parity is reported with confidence",
    'mossguard: {\n    benchmarkKey: "knight"'],
  ["copperskiff", "flying-machine", "tests/cards-basic-flying.test.js",
    "basic flying content: all mechanics use trusted confidence dispositions",
    'copperskiff: "flying-machine"'],
  ["skymaul", "mega-minion", "tests/cards-basic-flying.test.js",
    "basic flying content: all mechanics use trusted confidence dispositions",
    'skymaul: "mega-minion"'],
  ["brassbolt", "musketeer", "tests/cards-basic-ranged.test.js",
    "basic ranged content: every mechanic is compared with trusted confidence",
    'brassbolt: "musketeer"'],
  ["reedsting", "dart-goblin", "tests/cards-basic-ranged.test.js",
    "basic ranged content: every mechanic is compared with trusted confidence",
    'reedsting: "dart-goblin"'],
  ["briar-band", "goblin-gang", "tests/cards-swarms.test.js",
    "squad content: top-level parity reports authority and questions",
    '"briar-band": "goblin-gang"'],
  ["cinderlings", "skeletons", "tests/cards-swarms.test.js",
    "squad content: top-level parity reports authority and questions",
    'cinderlings: "skeletons"'],
  ["stonehauler", "giant", "tests/cards-structure-seeker.test.js",
    "structure seeker content: field parity distinguishes questions",
    'evaluateReferenceParity(card, "giant")'],
  ["thornscouts", "goblins", "tests/cards-swarms.test.js",
    "new squads retain the pinned Goblins and Barbarians mechanics as unverified questions",
    '["thornscouts", "goblins",'],
  ["forgeguard", "barbarians", "tests/cards-swarms.test.js",
    "new squads retain the pinned Goblins and Barbarians mechanics as unverified questions",
    '["forgeguard", "barbarians",'],
  ["ironroot", "pekka", "tests/cards-basic-melee.test.js",
    "basic melee content: field parity is reported with confidence",
    'ironroot: {\n    benchmarkKey: "pekka"'],
]);

const DECLARATIONS = Object.freeze({
  "cinder-host": [{
    file: "tests/cards-expansion-round-2.test.js",
    test: "round 2: Cinder Host and Ironroot enter an editable deck and trade through GameSession",
    scope: "Skeleton Army normalization is a QUESTION fixture, not a one-to-one identity mapping",
  }],
  "sunthread-pair": [{
    file: "tests/game-roster-troops-ordinary.test.js",
    test: "Sunthread Pair and Duskwing Trio trade sourced air/ground projectiles through in-flight restore",
    scope: "current typed source claim and in-flight restore; no historical card key is declared",
  }],
  "duskwing-trio": [{
    file: "tests/game-roster-troops-ordinary.test.js",
    test: "Sunthread Pair and Duskwing Trio trade sourced air/ground projectiles through in-flight restore",
    scope: "current typed source claim and in-flight restore; no historical card key is declared",
  }],
  "squall-orb": [{
    file: "tests/editable-deck.test.js",
    test: "editable mixed witness admits one QUESTION-profile Squall Orb with seven troops",
    scope: "current effect admission; profile fields remain QUESTION and no historical key is declared",
  }, {
    file: "tests/editable-deck.test.js",
    test: "editable mixed GameSession casts from center, spends, cycles, and restores pending impact",
    scope: "current spell estimate executes through restore; no historical key is declared",
  }],
  "gloamwing-cluster": [
    {
      file: "tests/cards016-integration.test.js",
      test: "editable collections admit exactly 17 troops and 18 mixed choices while preserving default eight",
      scope: "editable pool membership and unchanged default deck; no historical card key is declared",
    },
    {
      file: "tests/cards016-integration.test.js",
      test: "editable player air swarms target each other, Coppershade launches a projectile, and restore replays it exactly",
      scope: "editable GameSession continuation; no historical card key is declared",
    },
    {
      file: "tests/game-roster-troops-air-swarms.test.js",
      test: "air swarm witnesses close source QUESTIONS over every unverified runtime field",
      scope: "typed estimate QUESTIONS stay unverified; no historical card key is declared",
    },
    {
      file: "tests/game-roster-troops-air-swarms.test.js",
      test: "Gloamwing and Coppershade deploy through typed shared sessions with exact spend and cycle",
      scope: "typed shared-core deployment; no historical card key is declared",
    },
  ],
  "coppershade-flock": [
    {
      file: "tests/cards016-integration.test.js",
      test: "editable collections admit exactly 17 troops and 18 mixed choices while preserving default eight",
      scope: "editable pool membership and unchanged default deck; no historical card key is declared",
    },
    {
      file: "tests/cards016-integration.test.js",
      test: "editable player air swarms target each other, Coppershade launches a projectile, and restore replays it exactly",
      scope: "editable GameSession continuation; no historical card key is declared",
    },
    {
      file: "tests/game-roster-troops-air-swarms.test.js",
      test: "air swarm witnesses close source QUESTIONS over every unverified runtime field",
      scope: "typed estimate QUESTIONS stay unverified; no historical card key is declared",
    },
    {
      file: "tests/game-roster-troops-air-swarms.test.js",
      test: "Gloamwing and Coppershade deploy through typed shared sessions with exact spend and cycle",
      scope: "typed shared-core deployment; no historical card key is declared",
    },
  ],
});
const AUXILIARY_DECLARATIONS = Object.freeze({
  ironroot: [{
    file: "tests/cards-expansion-round-2.test.js",
    test: "round 2: Cinder Host and Ironroot enter an editable deck and trade through GameSession",
    scope: "Pekka is a field-questioned matchup fixture, not historical identity proof",
  }],
});

function hash(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fileBytes(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

function text(relativePath) {
  return fileBytes(relativePath).toString("utf8");
}

function json(relativePath) {
  return JSON.parse(text(relativePath));
}

function assertDigest(expected, actual, label) {
  if (actual !== expected) throw new Error(label + " source drift: expected " +
    expected + ", got " + actual);
}

function ensurePinned(relativePath, expected) {
  const actual = hash(fileBytes(relativePath));
  assertDigest(expected, actual, "frozen input " + relativePath);
  return actual;
}

function runtimeFileList() {
  const files = [];
  function visit(relativeDirectory) {
    for (const entry of readdirSync(path.join(ROOT, relativeDirectory), { withFileTypes: true })) {
      const relativePath = path.posix.join(relativeDirectory, entry.name);
      if (entry.isDirectory()) visit(relativePath);
      else if (entry.isFile() && relativePath.endsWith(".js")) files.push(relativePath);
    }
  }
  visit("src/content");
  files.push("src/shared/ordinary-projectile-delivery-authority.js",
    "src/sim/session-building-profile-receipts.js");
  return [...new Set(files)].sort();
}

function runtimeFingerprint(files) {
  const digest = createHash("sha256");
  for (const file of files) {
    digest.update(file).update("\0").update(hash(fileBytes(file))).update("\n");
  }
  return digest.digest("hex");
}

function lineOf(source, needle, label) {
  const start = source.indexOf(needle);
  if (start < 0 || source.indexOf(needle, start + needle.length) >= 0) {
    throw new Error("missing or ambiguous pinned evidence for " + label);
  }
  return source.slice(0, start).split("\n").length;
}

function declarationEvidence(file, test, id, scope) {
  const source = text(file);
  return {
    file,
    line: lineOf(source, 'test("' + test + '"', id + " test declaration"),
    test,
    ...(scope ? { scope } : {}),
  };
}

function expectedEvidence(id) {
  const mapping = CURRENT_MAP.find(([currentId]) => currentId === id);
  const declarations = mapping
    ? [{ file: mapping[2], test: mapping[3] }]
    : DECLARATIONS[id];
  if (!declarations) throw new Error("no pinned declaration for current ID " + id);

  const evidence = declarations.map(({ file, test, scope }) =>
    declarationEvidence(file, test, id, scope));
  for (const { file, test, scope } of AUXILIARY_DECLARATIONS[id] ?? []) {
    evidence.push(declarationEvidence(file, test, id, scope));
  }
  return evidence;
}

function expectedComparison(id) {
  const mapping = CURRENT_MAP.find(([currentId]) => currentId === id);
  if (mapping) {
    const [, referenceKey, file, , mappingNeedle] = mapping;
    return {
      status: "declared-test-comparator",
      referenceKey,
      evidenceMappingLine: lineOf(text(file), mappingNeedle,
        id + " declared comparator mapping"),
      fullParityClaimed: false,
      fieldDisposition: "source-unverified fields remain QUESTION",
      ...(id === "ironroot" ? {
        fixtureReferences: [{
          referenceKey: "pekka",
          artifact: "artifacts/cards-expansion-round-2/reference-normalization.json",
          status: "QUESTION field fixture only; not historical identity proof",
          identityJoin: false,
        }],
      } : {}),
    };
  }

  if (id === "cinder-host") {
    return {
      status: "question-fixture-only",
      fixtureReferences: [{
        referenceKey: "skeleton-army",
        artifact: "artifacts/cards-expansion-round-2/reference-normalization.json",
        status: "QUESTION fixture only; not an identity join",
        identityJoin: false,
      }],
    };
  }

  return {
    status: "no-exact-historical-identity-asserted",
    reason: "The cited current tests do not declare a historical card key.",
  };
}

function typedQuestionData(apis, id) {
  const witness = apis.troop.createSessionTroopWitness(id);
  const card = witness.roster.find(({ id: cardId }) => cardId === id);
  if (!card || card.entities.length !== 1) {
    throw new Error("expected one typed air-swarm entity for " + id);
  }
  const entity = card.entities[0];
  const bindings = [];
  for (const policyName of [
    "bodyRadiusPolicy", "projectileSpeedPolicy", "deliveryPolicy", "layerPolicy",
  ]) {
    const policy = entity[policyName];
    if (policy?.kind === "question") {
      bindings.push({
        policy: policyName,
        questionKey: policy.questionKey,
      });
    }
  }
  for (const field of entity.sourceConfidencePolicy?.fields ?? []) {
    bindings.push({
      policy: "sourceConfidencePolicy.fields",
      field: field.field,
      questionKey: field.questionKey,
      valueEncoding: field.valueEncoding,
    });
  }
  const uniqueKeys = [...new Set(bindings.map(({ questionKey }) => questionKey))].sort();
  if (uniqueKeys.length !== bindings.length) {
    throw new Error("duplicate typed QUESTION binding for " + id);
  }
  const questionByKey = new Map(witness.questions.map((question) => [question.key, question]));
  const records = uniqueKeys.map((questionKey) => {
    const question = questionByKey.get(questionKey);
    if (!question) throw new Error("typed question closure lacks " + questionKey);
    if (question.authoritative !== false || question.confidence !== "unverified" ||
        question.disposition !== "question" || question.source !== QUESTION_SOURCE) {
      throw new Error("typed mechanic question was promoted: " + questionKey);
    }
    return question;
  });
  if (bindings.length !== 13 || records.length !== 13 ||
      bindings.filter(({ policy }) => policy === "sourceConfidencePolicy.fields").length !== 10) {
    throw new Error("air-swarm typed QUESTION closure drift for " + id);
  }
  return {
    disposition: "QUESTION",
    source: QUESTION_SOURCE,
    bindings,
    records,
  };
}

function buildCurrentRows(editableCards, admitted, apis) {
  const evidenceById = new Map(CURRENT_MAP.map(([id]) => [id, id]));
  for (const id of Object.keys(DECLARATIONS)) evidenceById.set(id, id);

  return editableCards.map((runtime, index) => {
    const id = runtime.id;
    if (!evidenceById.has(id)) throw new Error("no evidence mapping for current ID " + id);
    const typedQuestions = id === "gloamwing-cluster" || id === "coppershade-flock"
      ? typedQuestionData(apis, id)
      : undefined;
    return {
      id,
      displayName: runtime.displayName,
      kind: runtime.kind,
      editableOrder: index,
      defaultDeckOrder: DEFAULT_IDS.indexOf(id) < 0 ? null : DEFAULT_IDS.indexOf(id),
      admission: {
        status: "admitted",
        occurrenceCount: runtime.occurrenceExports.length,
        occurrenceExports: runtime.occurrenceExports,
      },
      currentProfileSupport: "current playable profile or estimate; not historical card execution",
      comparison: expectedComparison(id),
      ...(typedQuestions ? { typedUnverifiedMechanicsQuestions: typedQuestions } : {}),
      evidence: expectedEvidence(id),
      fullHistoricalCardExecutionClaimed: false,
    };
  });
}

function validateHistoricalRows(rows) {
  assert.equal(rows.length, 109, "expected exactly 109 historical rows");
  assert.equal(new Set(rows.map((row) => row.key)).size, 109,
    "duplicate historical row key");
  assert.equal(new Set(rows.map((row) => row.id)).size, 109,
    "duplicate historical row id");
  assert.deepEqual(Object.fromEntries(["troop", "building", "spell"].map((type) =>
    [type, rows.filter((row) => row.type === type).length])),
  { troop: 78, building: 13, spell: 18 });
}

function validateCurrentRows(rows, actualIds, referenceKeys, expectedRows) {
  assert.deepEqual(actualIds, EDITABLE_IDS, "current editable pool drift");
  assert.equal(rows.length, 18, "missing current editable mapping");
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length,
    "duplicate current editable id");
  assert.deepEqual(rows.map((row) => row.id), EDITABLE_IDS,
    "current editable mapping order drift");

  const joinedKeys = [];
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    const expected = expectedRows[index];
    assert.deepEqual(Object.keys(row).sort(), Object.keys(expected).sort(),
      row.id + " row shape disagrees with its pinned declaration");
    assert.equal(row.displayName, expected.displayName);
    assert.equal(row.kind, expected.kind);
    assert.equal(row.editableOrder, expected.editableOrder);
    assert.equal(row.defaultDeckOrder, expected.defaultDeckOrder);
    if (row.comparison?.status === "declared-test-comparator") {
      assert.ok(referenceKeys.has(row.comparison.referenceKey),
        row.id + " has unsupported reference join " + row.comparison.referenceKey);
      joinedKeys.push(row.comparison.referenceKey);
    }
    assert.deepEqual(row.evidence, expected.evidence,
      row.id + " evidence disagrees with pinned test declarations");
    assert.deepEqual(row.comparison, expected.comparison,
      row.id + " comparison disagrees with pinned declarations and QUESTION fixtures");
    assert.deepEqual(row.admission, expected.admission,
      row.id + " admission disagrees with frozen editable catalog");
    assert.equal(row.currentProfileSupport, expected.currentProfileSupport);
    assert.equal(row.fullHistoricalCardExecutionClaimed, false);
    if (expected.typedUnverifiedMechanicsQuestions) {
      assert.deepEqual(row.typedUnverifiedMechanicsQuestions,
        expected.typedUnverifiedMechanicsQuestions,
        row.id + " typed QUESTION closure disagrees with pinned runtime policy");
    } else {
      assert.equal(Object.hasOwn(row, "typedUnverifiedMechanicsQuestions"), false,
        row.id + " has an unsupported typed QUESTION claim");
    }
  }
  assert.equal(new Set(joinedKeys).size, joinedKeys.length,
    "duplicate historical comparator join");
}

function validateInventory(result, expectedCurrentRows) {
  validateHistoricalRows(result.historicalRows);
  const byKey = new Map(result.historicalRows.map((row) => [row.key, row]));
  validateCurrentRows(result.currentEditableCards,
    result.currentEditableCards.map((row) => row.id), byKey, expectedCurrentRows);
  const linked = result.historicalRows.flatMap((row) => row.declaredCurrentComparatorIds);
  const expectedLinked = expectedCurrentRows
    .filter((row) => row.comparison.status === "declared-test-comparator")
    .map((row) => row.id);
  assert.deepEqual(linked.sort(), expectedLinked.sort(),
    "historical rows do not carry the exact declared-comparator inverse");
  assert.equal(result.counts.historicalRows, 109);
  assert.equal(result.counts.editableCurrentIds, 18);
  assert.equal(result.counts.unchangedDefaultDeckIds, 8);
  assert.equal(result.counts.fullHistoricalCardExecutions, 0);
  assert.equal(result.counts.historicalParityClaims, 0);
  assert.deepEqual(result.counts.sessionCatalog, {
    admittedIds: 55,
    admittedOccurrences: 60,
    units: 39,
    unitOccurrences: 41,
    structures: 8,
    effects: 8,
  });
}

async function runtimeApis() {
  const load = async (file) => import(pathToFileURL(path.join(ROOT, file)));
  return {
    editable: await load("src/content/editable-deck.js"),
    troop: await load("src/content/session-troop-roster.js"),
    playable: await load("src/content/playable-roster.js"),
    catalog: await load("src/content/session-card-catalog.js"),
  };
}

function assertLegacyBaselines(legacy, prior16Bytes) {
  assert.equal(legacy.editablePool.count, 11);
  assert.equal(legacy.editablePool.referenceMappedCount, 11);
  assert.equal(prior16Bytes.length > 0, true);
}

async function makeInventory() {
  for (const [file, expected] of Object.entries(PINNED_INPUTS)) ensurePinned(file, expected);
  const runtimeFiles = runtimeFileList();
  assert.equal(runtimeFiles.length, RUNTIME_GRAPH_FILES, "runtime source file set drift");
  const runtimeHash = runtimeFingerprint(runtimeFiles);
  assert.equal(runtimeHash, RUNTIME_GRAPH_SHA256, "runtime admission source graph drift");

  const sourceLedger = text("reference/stats/SOURCES.md");
  assert.match(sourceLedger, /confidence|unverified|QUESTION/iu);
  const corpus = json("reference/stats/cards.json");
  const legacyBytes = fileBytes("artifacts/completion-inventory/reference/card-coverage-109.json");
  const prior16Bytes = fileBytes(
    "artifacts/completion-inventory-current-16/card-coverage-109-current-16.json");
  const legacy = JSON.parse(legacyBytes.toString("utf8"));
  const prior16 = JSON.parse(prior16Bytes.toString("utf8"));
  assertLegacyBaselines(legacy, prior16Bytes);
  assert.equal(prior16.counts.editableCurrentIds, 16);
  assert.equal(prior16.counts.fullHistoricalCardExecutions, 0);

  const apis = await runtimeApis();
  const editableIds = [...apis.editable.EDITABLE_MIXED_DECK_CARD_IDS];
  const troopIds = [...apis.troop.EDITABLE_DECK_CARD_IDS];
  const defaultIds = [...apis.playable.PLAYABLE_CARD_IDS];
  assert.deepEqual(editableIds, EDITABLE_IDS, "current mixed editable pool drift");
  assert.deepEqual(troopIds, TROOP_IDS, "current editable troop pool drift");
  assert.deepEqual(defaultIds, DEFAULT_IDS, "default eight-card deck drift");

  const catalog = apis.catalog.createSessionCardManifest();
  const admitted = new Map(catalog.cards.map((card) => [card.id, card]));
  assert.equal(admitted.size, catalog.cards.length, "duplicate admitted catalog IDs");
  const historicalRows = corpus.cards.map((card) => ({
    id: card.id,
    key: card.key,
    name: card.name,
    type: card.type,
    elixirCost: card.elixir_cost,
    rarity: card.rarity,
    unverifiedFields: [...card.unverified_fields],
    unverifiedFieldsDisposition: "QUESTION",
    fullHistoricalCardExecutionClaimed: false,
    declaredCurrentComparatorIds: [],
  }));
  validateHistoricalRows(historicalRows);
  const historicalByKey = new Map(historicalRows.map((row) => [row.key, row]));
  const legacyLinks = new Map(legacy.cards.filter((row) => row.currentEditableMatch)
    .map((row) => [row.currentEditableMatch.runtimeId, {
      key: row.key,
      evidenceFile: row.currentEditableMatch.evidence,
    }]));
  assert.equal(legacyLinks.size, 11);

  const currentInput = editableIds.map((id) => {
    const card = admitted.get(id);
    if (!card) throw new Error("editable card " + id + " not admitted by session catalog");
    return card;
  });
  const currentRows = buildCurrentRows(currentInput, admitted, apis);
  for (const row of currentRows) {
    if (row.comparison.status !== "declared-test-comparator") continue;
    const historical = historicalByKey.get(row.comparison.referenceKey);
    if (!historical) throw new Error("unsupported join " + row.id + " -> " +
      row.comparison.referenceKey);
    const legacy = legacyLinks.get(row.id);
    if (legacy && (legacy.key !== row.comparison.referenceKey ||
        !row.evidence.some(({ file }) => file === legacy.evidenceFile))) {
      throw new Error("retained baseline join changed for " + row.id);
    }
    historical.declaredCurrentComparatorIds.push(row.id);
  }
  const joinedKeys = currentRows.filter((row) =>
    row.comparison.status === "declared-test-comparator")
    .map((row) => row.comparison.referenceKey);
  assert.equal(new Set(joinedKeys).size, joinedKeys.length);
  validateCurrentRows(currentRows, editableIds, historicalByKey, currentRows);

  const currentKinds = Object.fromEntries(["unit", "structure", "effect"].map((kind) =>
    [kind, currentRows.filter((row) => row.kind === kind).length]));
  assert.deepEqual(currentKinds, { unit: 17, structure: 0, effect: 1 });
  assert.deepEqual(catalog.counts, {
    admittedIds: 55, admittedOccurrences: 60, claimedIds: 61,
    claimedOccurrences: 66, excludedClaimedIds: 6,
    excludedClaimedOccurrences: 6, questionOnlyExports: 5,
  });
  const unitOccurrences = catalog.occurrences.filter((entry) =>
    entry.status === "admitted" && admitted.get(entry.id)?.kind === "unit").length;
  assert.equal(unitOccurrences, 41);
  const currentOccurrenceCount = currentRows.reduce((sum, row) =>
    sum + row.admission.occurrenceCount, 0);
  assert.equal(currentOccurrenceCount, 21);

  const prior16Ids = prior16.currentEditableCards.map((row) => row.id);
  assert.deepEqual(prior16Ids, [...EDITABLE_IDS.slice(0, 15), "squall-orb"],
    "retained 16-card inventory has unexpected IDs");
  assert.equal(prior16.currentEditableCards.length, 16);

  const typedQuestionCardCount = currentRows.filter((row) =>
    row.typedUnverifiedMechanicsQuestions).length;
  const typedQuestionRecordCount = currentRows.reduce((sum, row) =>
    sum + (row.typedUnverifiedMechanicsQuestions?.records.length ?? 0), 0);
  assert.equal(typedQuestionCardCount, 2);
  assert.equal(typedQuestionRecordCount, 26);

  const counts = {
    historicalRows: 109,
    historicalTypes: { troop: 78, building: 13, spell: 18 },
    editableCurrentIds: 18,
    editableCurrentKinds: currentKinds,
    currentAdmittedOccurrences: currentOccurrenceCount,
    currentProfileOrEstimateRecords: 18,
    unchangedDefaultDeckIds: 8,
    retainedBaselineComparators: 11,
    additionalTestDeclaredComparator: 1,
    totalTestDeclaredComparators: joinedKeys.length,
    questionFixtureMentions: 2,
    IDsWithoutExactHistoricalIdentityClaim: 6,
    typedUnverifiedMechanicsQuestionCards: typedQuestionCardCount,
    typedUnverifiedMechanicsQuestionRecords: typedQuestionRecordCount,
    sessionCatalog: {
      admittedIds: catalog.counts.admittedIds,
      admittedOccurrences: catalog.counts.admittedOccurrences,
      units: catalog.cards.filter((card) => card.kind === "unit").length,
      unitOccurrences,
      structures: catalog.cards.filter((card) => card.kind === "structure").length,
      effects: catalog.cards.filter((card) => card.kind === "effect").length,
    },
    fullHistoricalCardExecutions: 0,
    historicalParityClaims: 0,
  };
  assert.deepEqual(counts.sessionCatalog, {
    admittedIds: 55, admittedOccurrences: 60, units: 39,
    unitOccurrences: 41, structures: 8, effects: 8,
  });

  const evidenceFileSha256 = Object.fromEntries(Object.entries(PINNED_INPUTS)
    .filter(([file]) => file.startsWith("tests/") ||
      file === "artifacts/cards-expansion-round-2/reference-normalization.json")
    .sort(([left], [right]) => left.localeCompare(right)));
  return {
    inventory: {
      schemaVersion: 1,
      purpose: "offline test-only historical comparison inventory; never import, bundle, or publish as a game asset",
      pinnedInputs: {
        sourceCommit: SOURCE_COMMIT,
        cardsCorpusSha256: PINNED_INPUTS["reference/stats/cards.json"],
        sourceLedgerSha256: PINNED_INPUTS["reference/stats/SOURCES.md"],
        runtimeAdmissionSourceGraphSha256: runtimeHash,
        runtimeAdmissionSourceFileCount: runtimeFiles.length,
        retained11CardBaseline: {
          sha256: hash(legacyBytes),
          bytes: statSync(path.join(ROOT,
            "artifacts/completion-inventory/reference/card-coverage-109.json")).size,
          byteIdentical: true,
        },
        retained16CardInventory: {
          sha256: hash(prior16Bytes),
          bytes: prior16Bytes.length,
          byteIdentical: true,
        },
        evidenceFileSha256,
      },
      counts,
      interpretation: [
        "Each historical row is one pinned roster identity. Its unverifiedFields are preserved as QUESTION from the pinned source ledger.",
        "The declared comparator rows are test-declared comparison candidates only; source-unverified fields remain QUESTION, and no historical parity is claimed.",
        "Cinder Host's Skeleton Army normalization and Ironroot's Pekka matchup source are QUESTION fixtures only; neither fixture proves historical identity or upgrades mechanics confidence.",
        "Cinder Host, Sunthread Pair, Duskwing Trio, Gloamwing Cluster, Coppershade Flock, and Squall Orb have no exact historical card key asserted by the cited tests.",
        "Gloamwing and Coppershade retain all 13 typed runtime mechanic QUESTION records each; these are playability estimates, not historical evidence.",
        "Current catalog admission occurrences and typed current estimates are counted separately from historical card execution.",
        "The 11-card baseline and accepted 16-card inventory are read and hash-checked; neither is rewritten.",
        "This offline artifact and generator are outside the runtime and publication source paths.",
      ],
      historicalRows,
      currentEditableCards: currentRows,
    },
    expectedCurrentRows: currentRows,
  };
}

function runSelfTests(result, expectedCurrentRows) {
  const byKey = new Map(result.historicalRows.map((row) => [row.key, row]));
  const cases = [];
  const expectRejected = (name, actualOutput, mutate, validate, pattern) => {
    try {
      validate(mutate());
    } catch (error) {
      assert.match(String(error?.message ?? error), pattern, name + " returned unexpected rejection");
      cases.push({ case: name, mutation: actualOutput, rejected: String(error.message) });
      return;
    }
    throw new Error(name + " mutation was accepted");
  };

  expectRejected("missing historical row", "removed one of 109 historical rows",
    () => result.historicalRows.slice(1), (rows) => validateHistoricalRows(rows),
    /exactly 109/u);
  expectRejected("duplicate historical row", "duplicated a historical key",
    () => {
      const rows = structuredClone(result.historicalRows);
      rows[1].key = rows[0].key;
      return rows;
    }, (rows) => validateHistoricalRows(rows), /duplicate historical row key/u);
  expectRejected("duplicate editable ID", "reused one current editable ID",
    () => {
      const rows = structuredClone(result.currentEditableCards);
      rows[1].id = rows[0].id;
      return rows;
    }, (rows) => validateCurrentRows(rows, EDITABLE_IDS, byKey, expectedCurrentRows),
    /duplicate current editable id/u);
  expectRejected("unsupported comparator join", "mapped Sunthread Pair to known but undeclared mini-pekka",
    () => {
      const rows = structuredClone(result.currentEditableCards);
      rows.find((row) => row.id === "sunthread-pair").comparison = {
        status: "declared-test-comparator",
        referenceKey: "mini-pekka",
        evidenceMappingLine: 22,
        fullParityClaimed: false,
        fieldDisposition: "source-unverified fields remain QUESTION",
      };
      return rows;
    }, (rows) => validateCurrentRows(rows, EDITABLE_IDS, byKey, expectedCurrentRows),
    /comparison disagrees with pinned declarations/u);
  expectRejected("private QUESTION fixture promotion", "promoted Cinder Host's Skeleton Army fixture to a comparator",
    () => {
      const rows = structuredClone(result.currentEditableCards);
      rows.find((row) => row.id === "cinder-host").comparison = {
        status: "declared-test-comparator",
        referenceKey: "skeleton-army",
        evidenceMappingLine: 12,
        fullParityClaimed: false,
        fieldDisposition: "source-unverified fields remain QUESTION",
      };
      return rows;
    }, (rows) => validateCurrentRows(rows, EDITABLE_IDS, byKey, expectedCurrentRows),
    /comparison disagrees with pinned declarations/u);

  const wrongEvidenceLine = structuredClone(result.currentEditableCards);
  wrongEvidenceLine.find((row) => row.id === "coilblade").evidence[0].line = 999999;
  const wrongMappingLine = structuredClone(result.currentEditableCards);
  wrongMappingLine.find((row) => row.id === "coilblade").comparison.evidenceMappingLine = 999999;
  try {
    validateCurrentRows(wrongEvidenceLine, EDITABLE_IDS, byKey, expectedCurrentRows);
    throw new Error("wrong declaration line mutation was accepted");
  } catch (error) {
    assert.match(String(error?.message ?? error), /evidence disagrees with pinned test declarations/u);
    cases.push({
      case: "forged/wrong-line evidence",
      mutation: "set Coilblade declaration line to 999999",
      rejected: String(error.message),
    });
  }
  try {
    validateCurrentRows(wrongMappingLine, EDITABLE_IDS, byKey, expectedCurrentRows);
    throw new Error("wrong mapping line mutation was accepted");
  } catch (error) {
    assert.match(String(error?.message ?? error), /comparison disagrees with pinned declarations/u);
    cases[cases.length - 1].additionalMutation = "set Coilblade mapping line to 999999";
    cases[cases.length - 1].additionalRejection = String(error.message);
  }

  assert.equal(cases.length, 6, "expected six independent semantic adversary outputs");
  return cases;
}

function outputText(result) {
  return JSON.stringify(result, null, 2) + "\n";
}

async function main() {
  const { inventory, expectedCurrentRows } = await makeInventory();
  validateInventory(inventory, expectedCurrentRows);
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) {
    const cases = runSelfTests(inventory, expectedCurrentRows);
    for (const [index, entry] of cases.entries()) {
      process.stdout.write("self-check " + (index + 1) + "/6 PASS — " +
        entry.case + ": " + entry.rejected +
        (entry.additionalMutation ? "; " + entry.additionalMutation + ": " +
          entry.additionalRejection : "") + "\n");
    }
  }
  if (args.has("--write")) {
    writeFileSync(OUTPUT, outputText(inventory));
    process.stdout.write("wrote " + path.relative(ROOT, OUTPUT) + "\n");
  }
  if (args.has("--check") || (!args.has("--write") && !args.has("--self-test"))) {
    assert.equal(readFileSync(OUTPUT, "utf8"), outputText(inventory),
      "generated inventory differs; inspect pinned input drift before updating");
    process.stdout.write("check passed: 109 rows, 18 editable IDs, frozen " +
      SOURCE_COMMIT + "\n");
  }
}

await main();
