import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  atomicWriteIntegrationManifest,
  auditCanonicalIntegration,
  parseStrictTapForAudit,
  probeDirectOccurrenceAdapters,
  validateOccurrenceArtifacts,
} from "../scripts/integration-audit.js";

const EXPECTED_MANIFEST_SHA256 =
  "009ed7e778379a105792dcf32d8ff37bd72bf13c42c442bae28d48f3d7f144fc";

function sha256LooksPinned(value) {
  return /^[\da-f]{64}$/u.test(value);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`
    ).join(",")}}`;
  }
  return JSON.stringify(value);
}

function rebind(artifact) {
  artifact.bindingSha256 = createHash("sha256").update(canonical({
    eventBytes: artifact.eventBytes,
    replayBytes: artifact.replayBytes,
    stateBytes: artifact.stateBytes,
  })).digest("hex");
  return artifact;
}

test("canonical integration audit strictly parses complete TAP", () => {
  const valid = [
    "TAP version 13",
    "# runner diagnostic",
    "# Subtest: interaction",
    "ok 1 - interaction",
    "  ---",
    "  duration_ms: 1.25",
    "  type: 'test'",
    "  ...",
    "1..1",
    "# tests 1",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
    "# duration_ms 2.5",
    "",
  ].join("\n");
  assert.deepEqual(parseStrictTapForAudit(valid, "fixture"), {
    pass: 1,
    tests: 1,
  });
  const nestedValid = [
    "TAP version 13",
    "# documentation mentions Bail out!, not ok, and TAP version 13",
    "# Subtest: parent documents Bail out! literally",
    "    # nested documentation mentions 1..9 and # fail 3",
    "    # Subtest: child documents not ok literally",
    "    ok 1 - child documents not ok literally",
    "      ---",
    "      duration_ms: 0.5",
    "      note: 'Bail out! is documentation here'",
    "      ...",
    "    1..1",
    "ok 1 - parent documents Bail out! literally",
    "  ---",
    "  duration_ms: 1",
    "  type: 'test'",
    "  ...",
    "1..1",
    "# tests 1",
    "# suites 0",
    "# pass 1",
    "# fail 0",
    "# cancelled 0",
    "# skipped 0",
    "# todo 0",
    "# duration_ms 2",
    "",
  ].join("\n");
  assert.deepEqual(parseStrictTapForAudit(nestedValid, "nested fixture"), {
    pass: 1,
    tests: 1,
  });

  const bailouts = [
    `Bail out! before\n${valid}`,
    valid.replace("TAP version 13", "TAP version 13\nBail out! after header"),
    valid.replace("1..1", "Bail out! before plan\n1..1"),
    valid.replace("# tests 1", "Bail out! after plan\n# tests 1"),
    `${valid}Bail out! after document\n`,
    nestedValid.replace(
      "    ok 1 - child documents not ok literally",
      "    Bail out! nested runner stopped",
    ),
  ];
  const garbage = [
    `crash before\n${valid}`,
    valid.replace("ok 1 - interaction", "garbage within\nok 1 - interaction"),
    valid.replace("# tests 1", "garbage after plan\n# tests 1"),
    `${valid}process crashed\n`,
    valid.replace("TAP version 13", "TAP version 13\nTAP version 13"),
    valid.replace("1..1", "1..1\n1..1"),
  ];
  const forgedSummaries = [
    valid.replace("# tests 1", "# pass 1\n# tests 1"),
    valid.replace("# tests 1\n# suites 0", "# suites 0\n# tests 1"),
    valid.replace("# pass 1", "# pass 01"),
    valid.replace("# fail 0", "# fail 0\n# fail 0"),
    valid.replace("# cancelled 0", "# cancelled -0"),
    valid.replace("# duration_ms 2.5", "# duration_ms NaN"),
    valid.replace("# duration_ms 2.5", "# duration_ms 2.5\n# diagnostic late"),
    valid.replace("ok 1 - interaction", "ok 1 - interaction # SKIP forged"),
    valid.replace("ok 1 - interaction", "ok 1 - interaction # todo forged"),
  ];
  const hostileNested = [
    nestedValid.replace(
      "    ok 1 - child documents not ok literally",
      "    not ok 1 - child documents not ok literally",
    ),
    nestedValid.replace(
      "# Subtest: parent documents Bail out! literally",
      "    not ok 1 - orphan failure\n# Subtest: parent documents Bail out! literally",
    ),
    nestedValid.replace(
      "    # nested documentation mentions 1..9 and # fail 3",
      "    process crashed before child result",
    ),
    nestedValid.replace(
      "    ok 1 - child documents not ok literally",
      "   ok 1 - child documents not ok literally",
    ),
    nestedValid.replace("    1..1", "    1..2"),
    nestedValid.replace(
      "    ok 1 - child documents not ok literally",
      "    ok 2 - child documents not ok literally",
    ),
    nestedValid.replace("    1..1", "    # tests 1\n    1..1"),
    nestedValid.replace(
      "# Subtest: parent documents Bail out! literally",
      "    ok 1 - orphan pass\n# Subtest: parent documents Bail out! literally",
    ),
    nestedValid.replace("      ...", "     ..."),
  ];
  for (const hostile of [
    valid.replace("TAP version 13\n", ""),
    valid.replace("ok 1 - interaction", "not ok 1 - interaction"),
    valid.replace("# fail 0", "# fail 1"),
    valid.replace("# skipped 0", "# skipped 1"),
    valid.replace("# tests 1", "# tests 0"),
    valid.replace("1..1", "1..2"),
    valid.replace("ok 1 - interaction", "ok 2 - interaction"),
    valid.replace(
      "ok 1 - interaction",
      "ok 1 - interaction\nok 1 - duplicate",
    ).replace("1..1", "1..2")
      .replace("# tests 1", "# tests 2")
      .replace("# pass 1", "# pass 2"),
    ...bailouts,
    ...garbage,
    ...forgedSummaries,
    ...hostileNested,
    valid.replace("# runner diagnostic", "# runner\u001b[31m diagnostic"),
    valid.replace("# runner diagnostic", "# runner\u0000 diagnostic"),
    valid.replace("# runner diagnostic", "# runner\tdiagnostic"),
    valid.replace("# runner diagnostic", `# ${"x".repeat(65_537)}`),
  ]) {
    assert.throws(() => parseStrictTapForAudit(hostile, "fixture"));
  }
  assert.throws(
    () => parseStrictTapForAudit("x".repeat(16 * 1024 * 1024 + 1), "fixture"),
    /bounded TAP output/u,
  );
});

test("canonical integration audit imports without CLI side effects", () => {
  const result = spawnSync(process.execPath, [
    "--input-type=module",
    "-e",
    "await import('./scripts/integration-audit.js')",
  ], {
    cwd: new URL("../", import.meta.url).pathname,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("canonical integration audit removes temporary output after rename failure", () => {
  const root = mkdtempSync(join(tmpdir(), "integration-output-cleanup-"));
  try {
    const destination = join(root, "destination");
    mkdirSync(destination);
    assert.throws(() =>
      atomicWriteIntegrationManifest(destination, "{\"fixture\":true}\n")
    );
    assert.deepEqual(
      readdirSync(root).filter((name) => name.includes(".tmp-")),
      [],
    );
  } finally {
    rmSync(root, { force: true, recursive: true });
  }
});

test("canonical integration audit samples all direct occurrence mechanics", () => {
  const artifacts = probeDirectOccurrenceAdapters();
  assert.equal(artifacts.length, 67);
  for (const artifact of artifacts) {
    const facades = new Set();
    for (const [field, payloadKey] of [
      ["stateBytes", "state"],
      ["eventBytes", "emitted"],
      ["replayBytes", "replay"],
    ]) {
      const raw = JSON.parse(artifact[field]);
      assert.deepEqual(Object.keys(raw).sort(), ["exportCall", "mechanic"]);
      assert.equal(raw.exportCall.exportName, artifact.exportName);
      assert.equal(raw.exportCall.result.id, artifact.id);
      assert.equal(Object.hasOwn(raw, "binding"), false);
      assert.ok(Object.hasOwn(raw.mechanic, payloadKey));
      facades.add(raw.mechanic.facade);
    }
    assert.equal(facades.size, 1);
  }

  for (const [id, deaths] of [["briar-band", 6], ["cinderlings", 3],
    ["thornscouts", 4], ["forgeguard", 5]]) {
    const artifact = artifacts.find((entry) =>
      entry.exportName === "createSwarmCatalog" && entry.id === id
    );
    const emitted = JSON.parse(artifact.eventBytes).mechanic.emitted;
    assert.equal(emitted.filter(({ type }) => type === "death").length, deaths);
    assert.equal(emitted.filter(({ type }) => type === "damage").length, deaths);
  }

  for (const id of ["aegis-sage", "emberlance", "squall-orb"]) {
    const sharedId = artifacts.filter((artifact) => artifact.id === id);
    assert.equal(
      new Set(sharedId.map((artifact) =>
        JSON.parse(artifact.stateBytes).mechanic.facade
      )).size,
      sharedId.length,
    );
  }
});

test("canonical integration audit rejects missing and swapped raw bindings", () => {
  const clean = probeDirectOccurrenceAdapters();
  const occurrences = clean.map(({ exportName, id }) => ({ exportName, id }));
  const missing = structuredClone(clean);
  const missingState = JSON.parse(missing[0].stateBytes);
  delete missingState.exportCall.result.id;
  missing[0].stateBytes = canonical(missingState);
  rebind(missing[0]);
  assert.throws(
    () => validateOccurrenceArtifacts(missing, occurrences),
    /has no direct binding/u,
  );

  const swapped = structuredClone(clean);
  const left = swapped.findIndex(({ exportName }) =>
    exportName === "createBasicMeleeCatalog"
  );
  const right = swapped.findIndex(({ exportName }) =>
    exportName === "createBasicRangedCatalog"
  );
  for (const field of ["stateBytes", "eventBytes", "replayBytes"]) {
    const target = JSON.parse(swapped[left][field]);
    const source = JSON.parse(clean[right][field]);
    target.mechanic = source.mechanic;
    swapped[left][field] = canonical(target);
  }
  rebind(swapped[left]);
  assert.throws(
    () => validateOccurrenceArtifacts(swapped, occurrences),
    /mechanic binding mismatch/u,
  );
});

test("canonical integration audit executes every supported card and reproduces artifacts", {
  timeout: 900_000,
}, () => {
  const result = auditCanonicalIntegration({ runs: 2 });

  assert.equal(result.supported, 67);
  assert.equal(result.covered, 67);
  assert.equal(result.uniqueSupportedIds, 62);
  assert.equal(result.question, 5);
  assert.equal(result.runHashes.length, 2);
  assert.equal(result.runHashes[0], result.runHashes[1]);
  assert.equal(result.runHashes[0], result.manifestSha256);
  assert.equal(result.manifestSha256, EXPECTED_MANIFEST_SHA256);
  assert.equal(sha256LooksPinned(result.shippingIsolationSha256), true);
  assert.equal(result.manifest.supported.length, result.supported);
  assert.equal(result.manifest.supportedArtifacts.length, result.supported);
  assert.equal(result.manifest.questionOnly.length, result.question);
  assert.equal(result.manifest.runners.length, 47);
  assert.deepEqual(
    [...result.manifest.supportedArtifacts].sort((left, right) =>
      left.id.localeCompare(right.id) ||
      left.exportName.localeCompare(right.exportName)
    ),
    result.manifest.supportedArtifacts,
  );
  for (const artifact of result.manifest.supportedArtifacts) {
    for (const field of ["stateBytes", "eventBytes", "replayBytes"]) {
      assert.equal(typeof artifact[field], "string", field);
      assert.ok(artifact[field].length > 0, `${artifact.id} ${field}`);
      assert.doesNotThrow(() => JSON.parse(artifact[field]));
    }
    for (const field of ["stateSha256", "eventSha256", "replaySha256"]) {
      assert.equal(sha256LooksPinned(artifact[field]), true, field);
    }
  }
  for (const field of ["stateBytes", "eventBytes", "replayBytes"]) {
    assert.equal(
      new Set(result.manifest.supportedArtifacts.map(
        (artifact) => artifact[field],
      )).size,
      result.supported,
      `${field} must be occurrence-unique`,
    );
  }
  assert.equal(result.manifestBytes.includes("duration_ms"), false);
  assert.equal(result.manifestBytes.includes("normalizedTap"), false);
  console.log(JSON.stringify({
    manifestSha256: result.manifestSha256,
    occurrences: result.manifest.supportedArtifacts.map(
      ({ exportName, id }) => `${id}:${exportName}`,
    ),
    supported: result.supported,
    uniqueSupportedIds: result.uniqueSupportedIds,
  }));
});
