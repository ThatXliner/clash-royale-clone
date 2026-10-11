import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const OUTPUT = path.join(HERE, "card-coverage-109-current-16.json");
const SOURCE_COMMIT = "6dcf64b81751f69f9fe7520878ac136bda9143ed";
const RUNTIME_GRAPH_SHA256 = "915d576e45b0a38987ba3bf760b94ef9e8817d31359e9eb597e86be9343c648e";
const RUNTIME_GRAPH_FILES = 70;

const PINNED_INPUTS = Object.freeze({
  "reference/stats/cards.json": "2903e9b3cb759fd6229b0463df4de8b29a5500995a768691fcfc9b5c05ff6b5f",
  "reference/stats/SOURCES.md": "9d2e56266451a02486f6893d35f37989660d6f9d838be2d953b8e242beff78ee",
  "artifacts/completion-inventory/reference/card-coverage-109.json": "e68bf690793d531c863f14117deace21de595c906ecbc8bf39cc98856cd33c07",
  "artifacts/cards-expansion-round-2/reference-normalization.json": "7a9c140f5e0dfbccea101c8579230172b9d3026ea5b058a6645bfac020642228",
  "tests/cards-basic-melee.test.js": "3aa3123b8649cc0a7b5df662ed35e222526f051922ff7822b408cdecb2d90d1a",
  "tests/cards-basic-flying.test.js": "420718e09c171f1764b6f28cfb835c8cc38cdde2ad5fc59a88337277ff2535ee",
  "tests/cards-basic-ranged.test.js": "d25a34a944dd8710d75a4b00d7af9f187c642ebadeeddede9aa93260f179318c",
  "tests/cards-swarms.test.js": "3be33a0bbb5b874cde06525d452648e4ad03694d54f0523ae95a97dcbc3a88ec",
  "tests/cards-structure-seeker.test.js": "ca38c6a2b5ff164fa232402cdc7527f7c8135ca9f37c688d5ad6a19d2d463887",
  "tests/cards-expansion-round-2.test.js": "66b0ad1d7292afe22f997b4306e46932baa1ec1a0a727e9820ba5024d35285ee",
  "tests/game-roster-troops-ordinary.test.js": "a2fdebce627c4a0f53896ce0d0711e4ec499bb864bc5182acb9cde52184c9989",
  "tests/editable-deck.test.js": "2123211ee486348dc9fa7cf37ef1da413d2e9041ea497575105bffee4cbb669d",
});

const EDITABLE_IDS = Object.freeze([
  "coilblade", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting",
  "briar-band", "cinderlings", "stonehauler", "thornscouts", "forgeguard",
  "cinder-host", "ironroot", "sunthread-pair", "duskwing-trio", "squall-orb",
]);
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

const AUXILIARY_DECLARATIONS = Object.freeze({
  ironroot: [{
    file: "tests/cards-expansion-round-2.test.js",
    test: "round 2: Cinder Host and Ironroot enter an editable deck and trade through GameSession",
    note: "Pekka is used as a field-questioned matchup fixture, not historical identity proof",
  }],
});

const DECLARATIONS = Object.freeze({
  "cinder-host": [{
    file: "tests/cards-expansion-round-2.test.js",
    test: "round 2: Cinder Host and Ironroot enter an editable deck and trade through GameSession",
    note: "Skeleton Army normalization is a QUESTION fixture, not a one-to-one identity mapping",
  }],
  "sunthread-pair": [{
    file: "tests/game-roster-troops-ordinary.test.js",
    test: "Sunthread Pair and Duskwing Trio trade sourced air/ground projectiles through in-flight restore",
    note: "current typed source claim and in-flight restore; no historical card key is declared",
  }],
  "duskwing-trio": [{
    file: "tests/game-roster-troops-ordinary.test.js",
    test: "Sunthread Pair and Duskwing Trio trade sourced air/ground projectiles through in-flight restore",
    note: "current typed source claim and in-flight restore; no historical card key is declared",
  }],
  "squall-orb": [{
    file: "tests/editable-deck.test.js",
    test: "editable mixed witness admits one QUESTION-profile Squall Orb with seven troops",
    note: "current effect admission; profile fields remain QUESTION and no historical key is declared",
  }, {
    file: "tests/editable-deck.test.js",
    test: "editable mixed GameSession casts from center, spends, cycles, and restores pending impact",
    note: "current spell estimate executes through restore; no historical card key is declared",
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
  if (actual !== expected) throw new Error(`${label} source drift: expected ${expected}, got ${actual}`);
}

function ensurePinned(relativePath, expected) {
  const actual = hash(fileBytes(relativePath));
  assertDigest(expected, actual, `frozen input ${relativePath}`);
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
  for (const file of files) digest.update(file).update("\0").update(hash(fileBytes(file))).update("\n");
  return digest.digest("hex");
}

function lineOf(source, needle, label) {
  const start = source.indexOf(needle);
  if (start < 0 || source.indexOf(needle, start + needle.length) >= 0) {
    throw new Error(`missing or ambiguous pinned evidence for ${label}`);
  }
  return source.slice(0, start).split("\n").length;
}

function declarationEvidence(file, test, id) {
  const source = text(file);
  return {
    file,
    line: lineOf(source, `test("${test}"`, `${id} test declaration`),
    test,
  };
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

function validateCurrentRows(rows, actualIds, referenceKeys) {
  assert.deepEqual(actualIds, EDITABLE_IDS, "current editable pool drift");
  assert.equal(rows.length, 16, "missing current editable mapping");
  assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "duplicate current editable id");
  assert.deepEqual([...rows.map((row) => row.id)].sort(), [...EDITABLE_IDS].sort(),
    "missing current editable mapping");
  const joinedKeys = [];
  for (const row of rows) {
    assert.ok(row.evidence.length > 0, `${row.id} has no test declaration evidence`);
    assert.ok(row.evidence.every(({ line }) => Number.isSafeInteger(line) && line > 0),
      `${row.id} has invalid evidence line`);
    if (row.comparison.status === "declared-test-comparator") {
      assert.ok(referenceKeys.has(row.comparison.referenceKey),
        `${row.id} has unsupported reference join ${row.comparison.referenceKey}`);
      assert.equal(row.comparison.fullParityClaimed, false);
      joinedKeys.push(row.comparison.referenceKey);
    } else {
      assert.equal(Object.hasOwn(row.comparison, "referenceKey"), false,
        `${row.id} has an unsupported identity join`);
    }
    for (const fixture of row.comparison.fixtureReferences ?? []) {
      assert.ok(referenceKeys.has(fixture.referenceKey));
      assert.match(fixture.status, /QUESTION/u);
      assert.equal(fixture.identityJoin, false);
    }
    assert.equal(row.fullHistoricalCardExecutionClaimed, false);
  }
  assert.equal(new Set(joinedKeys).size, joinedKeys.length,
    "duplicate historical comparator join");
}

async function runtimeApis() {
  const load = async (file) => import(pathToFileURL(path.join(ROOT, file)));
  return {
    editable: await load("src/content/editable-deck.js"),
    playable: await load("src/content/playable-roster.js"),
    catalog: await load("src/content/session-card-catalog.js"),
  };
}

function buildTestEvidence(rows) {
  const mapped = new Map(CURRENT_MAP.map(([id, referenceKey, file, testName, mappingNeedle]) =>
    [id, { referenceKey, file, testName, mappingNeedle }]));
  for (const [id, declarations] of Object.entries(DECLARATIONS)) {
    mapped.set(id, { declarations });
  }

  return rows.map((runtime, index) => {
    const id = runtime.id;
    const mapping = mapped.get(id);
    if (!mapping) throw new Error(`no evidence mapping for current ID ${id}`);
    const noExactComparator = id === "cinder-host" || id === "sunthread-pair" ||
      id === "duskwing-trio" || id === "squall-orb";
    const evidence = noExactComparator
      ? mapping.declarations.map(({ file, test, note }) => ({
          ...declarationEvidence(file, test, id), scope: note,
        }))
      : [declarationEvidence(mapping.file, mapping.testName, id)];
    for (const { file, test, note } of AUXILIARY_DECLARATIONS[id] ?? []) {
      evidence.push({ ...declarationEvidence(file, test, id), scope: note });
    }
    const sourceMappingLine = noExactComparator ? null :
      lineOf(text(mapping.file), mapping.mappingNeedle, `${id} declared comparator mapping`);
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
      comparison: mapping.referenceKey ? {
        status: "declared-test-comparator",
        referenceKey: mapping.referenceKey,
        evidenceMappingLine: sourceMappingLine,
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
      } : {
        status: id === "cinder-host" ? "question-fixture-only" :
          "no-exact-historical-identity-asserted",
        ...(id === "cinder-host" ? {
          fixtureReferences: [{
            referenceKey: "skeleton-army",
            artifact: "artifacts/cards-expansion-round-2/reference-normalization.json",
            status: "QUESTION fixture only; not an identity join",
            identityJoin: false,
          }],
        } : {}),
      },
      evidence,
      fullHistoricalCardExecutionClaimed: false,
    };
  });
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
  const legacy = JSON.parse(legacyBytes.toString("utf8"));
  assert.equal(legacy.editablePool.count, 11);
  assert.equal(legacy.editablePool.referenceMappedCount, 11);
  assert.equal(hash(legacyBytes), PINNED_INPUTS[
    "artifacts/completion-inventory/reference/card-coverage-109.json"]);

  const apis = await runtimeApis();
  const editableIds = [...apis.editable.EDITABLE_MIXED_DECK_CARD_IDS];
  const troopIds = [...apis.editable.EDITABLE_DECK_CARD_IDS];
  const defaultIds = [...apis.playable.PLAYABLE_CARD_IDS];
  assert.deepEqual(defaultIds, DEFAULT_IDS, "default eight-card deck drift");
  assert.equal(troopIds.length, 15);
  assert.equal(editableIds.length, 16);

  const catalog = apis.catalog.createSessionCardManifest();
  const admitted = new Map(catalog.cards.map((card) => [card.id, card]));
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
    if (!card) throw new Error(`editable card ${id} not admitted by session catalog`);
    return card;
  });
  const currentRows = buildTestEvidence(currentInput);
  for (const row of currentRows) {
    if (row.comparison.status !== "declared-test-comparator") continue;
    const historical = historicalByKey.get(row.comparison.referenceKey);
    if (!historical) throw new Error(`unsupported join ${row.id} -> ${row.comparison.referenceKey}`);
    const legacy = legacyLinks.get(row.id);
    if (legacy && (legacy.key !== row.comparison.referenceKey ||
        !row.evidence.some(({ file }) => file === legacy.evidenceFile))) {
      throw new Error(`retained baseline join changed for ${row.id}`);
    }
    historical.declaredCurrentComparatorIds.push(row.id);
  }
  validateCurrentRows(currentRows, editableIds, historicalByKey);

  const counts = Object.fromEntries(["unit", "structure", "effect"].map((kind) =>
    [kind, catalog.cards.filter((card) => card.kind === kind).length]));
  assert.deepEqual(catalog.counts, {
    admittedIds: 53, admittedOccurrences: 58, claimedIds: 59, claimedOccurrences: 64,
    excludedClaimedIds: 6, excludedClaimedOccurrences: 6, questionOnlyExports: 5,
  });
  assert.deepEqual(counts, { unit: 37, structure: 8, effect: 8 });
  const unitOccurrences = catalog.occurrences.filter((entry) =>
    entry.status === "admitted" && admitted.get(entry.id)?.kind === "unit").length;
  assert.equal(unitOccurrences, 39);
  assert.equal(currentRows.reduce((sum, row) => sum + row.admission.occurrenceCount, 0), 19);

  return {
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
      evidenceFileSha256: Object.fromEntries(Object.entries(PINNED_INPUTS)
        .filter(([file]) => file.startsWith("tests/") ||
          file === "artifacts/cards-expansion-round-2/reference-normalization.json")
        .sort(([left], [right]) => left.localeCompare(right))),
    },
    counts: {
      historicalRows: 109,
      historicalTypes: { troop: 78, building: 13, spell: 18 },
      editableCurrentIds: 16,
      editableCurrentKinds: { unit: 15, effect: 1 },
      currentAdmittedOccurrences: 19,
      currentProfileOrEstimateRecords: 16,
      unchangedDefaultDeckIds: 8,
      retainedBaselineComparators: 11,
      additionalTestDeclaredComparator: 1,
      totalTestDeclaredComparators: 12,
      questionFixtureMentions: 2,
      IDsWithoutExactHistoricalIdentityClaim: 4,
      sessionCatalog: {
        admittedIds: 53,
        admittedOccurrences: 58,
        units: 37,
        unitOccurrences,
        structures: 8,
        effects: 8,
      },
      fullHistoricalCardExecutions: 0,
      historicalParityClaims: 0,
    },
    interpretation: [
      "Each historical row is one pinned roster identity. Its unverifiedFields are preserved as QUESTION from the pinned source ledger.",
      "The 12 comparator candidates are test declarations, not proof of full historical mechanics parity; no historical parity is claimed.",
      "Cinder Host's Skeleton Army normalization and Ironroot's Pekka matchup source are QUESTION fixtures only; neither fixture proves historical identity or upgrades mechanics confidence.",
      "Sunthread Pair, Duskwing Trio, and Squall Orb have no exact historical card key asserted by the cited tests.",
      "Current runtime admission/profile estimates are counted separately from historical execution.",
      "This offline artifact and generator are outside the runtime and publication source paths.",
    ],
    historicalRows,
    currentEditableCards: currentRows,
  };
}

function validateInventory(result) {
  validateHistoricalRows(result.historicalRows);
  const byKey = new Map(result.historicalRows.map((row) => [row.key, row]));
  validateCurrentRows(result.currentEditableCards, EDITABLE_IDS, byKey);
  assert.equal(result.currentEditableCards.length, 16);
  assert.equal(result.counts.fullHistoricalCardExecutions, 0);
  assert.equal(result.counts.historicalParityClaims, 0);
}

function runSelfTests(result) {
  const byKey = new Map(result.historicalRows.map((row) => [row.key, row]));
  const repeatedHistorical = structuredClone(result.historicalRows);
  repeatedHistorical[1].key = repeatedHistorical[0].key;
  assert.throws(() => validateHistoricalRows(repeatedHistorical), /duplicate historical row key/u);
  assert.throws(() => validateHistoricalRows(result.historicalRows.slice(1)), /exactly 109/u);

  const missing = structuredClone(result.currentEditableCards);
  missing.pop();
  assert.throws(() => validateCurrentRows(missing, EDITABLE_IDS, byKey), /missing current editable mapping/u);
  const duplicate = structuredClone(result.currentEditableCards);
  duplicate[1].id = duplicate[0].id;
  assert.throws(() => validateCurrentRows(duplicate, EDITABLE_IDS, byKey), /duplicate current editable id/u);
  assert.throws(() => validateCurrentRows(result.currentEditableCards,
    [...EDITABLE_IDS, "unreviewed-card"], byKey), /current editable pool drift/u);

  const guessedJoin = structuredClone(result.currentEditableCards);
  guessedJoin.find((row) => row.id === "sunthread-pair").comparison = {
    status: "declared-test-comparator", referenceKey: "invented-card", fullParityClaimed: false,
  };
  assert.throws(() => validateCurrentRows(guessedJoin, EDITABLE_IDS, byKey),
    /unsupported reference join/u);

  assert.throws(() => assertDigest("expected", "changed", "pinned input"),
    /pinned input source drift/u);
  assert.notEqual(runtimeFingerprint(runtimeFileList()), "0".repeat(64),
    "runtime source digest must be reproducibly computed");
  return "self-check passed: duplicate/missing 109 rows, duplicate/missing/drifted 16 IDs, unsupported join, and pinned-source drift guard";
}

function outputText(result) {
  return `${JSON.stringify(result, null, 2)}\n`;
}

async function main() {
  const result = await makeInventory();
  validateInventory(result);
  const args = new Set(process.argv.slice(2));
  if (args.has("--self-test")) process.stdout.write(`${runSelfTests(result)}\n`);
  if (args.has("--write")) {
    writeFileSync(OUTPUT, outputText(result));
    process.stdout.write(`wrote ${path.relative(ROOT, OUTPUT)}\n`);
  }
  if (args.has("--check") || (!args.has("--write") && !args.has("--self-test"))) {
    assert.equal(readFileSync(OUTPUT, "utf8"), outputText(result),
      "generated inventory differs; inspect pinned input drift before updating");
    process.stdout.write(`check passed: 109 rows, 16 editable IDs, frozen ${SOURCE_COMMIT}\n`);
  }
}

await main();

