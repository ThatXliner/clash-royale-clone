import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  auditShippingIsolation,
  formatShippingIsolationReport,
} from "../scripts/shipping-isolation-guard.js";

const ROOT = new URL("../", import.meta.url).pathname;
const CLEAN_FIXTURE = new URL(
  "./fixtures/shipping-isolation-guard/clean/",
  import.meta.url,
).pathname;
const PACKAGE_FIXTURE_ROOT = new URL(
  "./fixtures/shipping-isolation-guard/",
  import.meta.url,
).pathname;
const PROTECTED = ["Royal Benchmark"];

function temporaryRoot(name = "case") {
  return mkdtempSync(join(tmpdir(), `shipping-guard-${name}-`));
}

function write(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

function project(source, options = {}) {
  const root = temporaryRoot(options.name);
  write(join(root, "package.json"), JSON.stringify({
    name: "guard-adversarial-fixture",
    private: true,
    type: "module",
    exports: "./src/index.js",
  }));
  write(join(root, "src/index.js"), source);
  for (const [path, contents] of Object.entries(options.files ?? {})) {
    write(join(root, path), contents);
  }
  return root;
}

function codes(report) {
  return new Set(report.issues.map(({ code }) => code));
}

test("shipping isolation guard: clean graph is canonical and excludes test fixtures", () => {
  const root = temporaryRoot("clean");
  cpSync(CLEAN_FIXTURE, root, { recursive: true });

  const first = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root,
  });
  const second = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root,
  });

  assert.equal(first.ok, true);
  assert.deepEqual(first.entries, ["src/index.js"]);
  assert.deepEqual(first.files, [
    "src/feature.js",
    "src/index.js",
    "src/leaf.js",
  ]);
  assert.equal(first.files.some((path) => path.startsWith("tests/")), false);
  assert.equal(formatShippingIsolationReport(first),
    formatShippingIsolationReport(second));
  assert.equal(formatShippingIsolationReport(first).includes(root), false);

  const packageRoot = project([
    `import "guard-bare-package";`,
    `const delegatedRequire = require;`,
    `delegatedRequire("guard-aliased-package");`,
    `const delegatedImport = (path) => import(path);`,
    `delegatedImport("./aliased-import.js");`,
    `const DelegatedURL = URL;`,
    `new DelegatedURL("./aliased-url.js", import.meta.url);`,
  ].join("\n"), {
    files: {
      "src/aliased-import.js": `export const clean = true;`,
      "src/aliased-url.js": `export const clean = true;`,
      "node_modules/guard-bare-package/package.json": JSON.stringify({
        exports: {
          ".": {
            import: "./import.js",
            require: "./require.cjs",
          },
        },
        name: "guard-bare-package",
      }),
      "node_modules/guard-bare-package/import.js":
        `export const payload = "Royal Benchmark";`,
      "node_modules/guard-bare-package/require.cjs":
        `module.exports = "clean alternate";`,
      "node_modules/guard-aliased-package/package.json": JSON.stringify({
        main: "./main.cjs",
        name: "guard-aliased-package",
      }),
      "node_modules/guard-aliased-package/main.cjs":
        `module.exports = "prefix Royal Benchmark suffix";`,
    },
    name: "bare-and-aliased",
  });
  const packageReport = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root: packageRoot,
  });
  assert.equal(packageReport.ok, false);
  assert.equal(codes(packageReport).has("PROTECTED_IDENTITY"), true);
  assert.equal(packageReport.files.includes(
    "node_modules/guard-bare-package/import.js",
  ), true);
  assert.equal(packageReport.files.includes(
    "node_modules/guard-aliased-package/main.cjs",
  ), true);
  assert.equal(packageReport.files.includes("src/aliased-import.js"), true);
  assert.equal(packageReport.files.includes("src/aliased-url.js"), true);

  const criticPackages = [
    {
      candidates: [
        "node_modules/critic-package/browser.js",
        "node_modules/critic-package/import.js",
        "node_modules/critic-package/secondary.js",
      ],
      entry: "src/index.js",
      name: "exports-browser-before-import",
      target: "node_modules/critic-package/import.js",
    },
    {
      candidates: [
        "node_modules/critic-package/browser.cjs",
        "node_modules/critic-package/require.cjs",
      ],
      entry: "src/index.cjs",
      name: "exports-browser-before-require",
      target: "node_modules/critic-package/require.cjs",
    },
    {
      candidates: [
        "node_modules/critic-package/browser.cjs",
        "node_modules/critic-package/main.cjs",
        "node_modules/critic-package/module.cjs",
      ],
      entry: "src/index.cjs",
      name: "browser-string-hides-main",
      target: "node_modules/critic-package/main.cjs",
    },
    {
      candidates: [
        "node_modules/critic-package/browser.cjs",
        "node_modules/critic-package/main.cjs",
      ],
      entry: "src/index.cjs",
      name: "browser-map-hides-main",
      target: "node_modules/critic-package/main.cjs",
    },
  ];
  let executedTargetsCovered = 0;
  for (const fixture of criticPackages) {
    const fixtureRoot = join(PACKAGE_FIXTURE_ROOT, fixture.name);
    const execution = spawnSync(
      process.execPath,
      [join(fixtureRoot, fixture.entry)],
      { encoding: "utf8" },
    );
    assert.equal(execution.status, 0, execution.stderr);
    const [executedTarget, marker] = execution.stdout.trim().split("\n");
    assert.equal(executedTarget, fixture.target);
    assert.equal(marker, "Royal Benchmark");

    const report = auditShippingIsolation({
      protectedIdentities: PROTECTED,
      root: fixtureRoot,
    });
    assert.equal(report.ok, false, fixture.name);
    assert.equal(codes(report).has("PROTECTED_IDENTITY"), true, fixture.name);
    assert.equal(report.files.includes(executedTarget), true, fixture.name);
    for (const candidate of fixture.candidates) {
      assert.equal(report.files.includes(candidate), true,
        `${fixture.name}: missing ${candidate}`);
    }
    executedTargetsCovered += 1;
  }
  assert.equal(executedTargetsCovered, 4);
  console.log(
    `shipping guard Node package targets: ${executedTargetsCovered}/4 covered`,
  );
});

const referenceCases = [
  ["static import", `import x from "../reference/data.js";`],
  ["escaped import", `import x from "..\\x2freference/data.js";`],
  ["unicode import", `import x from "../\\u0072\\u0065ference/data.js";`],
  ["concatenated import", `import("../ref" + "erence/data.js");`],
  ["template import", 'import(`../${"ref"}erence/data.js`);'],
  ["dynamic import alias", [
    `const left = "../ref";`,
    `const path = left + "erence/data.js";`,
    `import(path);`,
  ].join("\n")],
  ["require alias", [
    `const path = "..\\\\ref" + "erence\\\\data.js";`,
    `require(path);`,
  ].join("\n")],
  ["URL", `new URL("../reference/data.json", import.meta.url);`],
  ["percent URL", `new URL("../%72eference/data.json", import.meta.url);`],
  ["re-export", `export { value } from ("../ref" + "erence/data.js");`],
  ["root URL", `new URL("file:///reference/data.json");`],
  ["query terminal", `import("../reference?raw");`],
];

test("shipping isolation guard: rejects every encoded reference specifier form", () => {
  let detected = 0;
  for (const [name, source] of referenceCases) {
    const report = auditShippingIsolation({
      protectedIdentities: PROTECTED,
      root: project(source, { name }),
    });
    assert.equal(
      [...codes(report)].some((code) => code.startsWith("REFERENCE_")),
      true,
      `${name}: ${formatShippingIsolationReport(report)}`,
    );
    detected += 1;
  }
  assert.equal(detected, 12);
  console.log(`shipping guard reference adversaries: ${detected}/12 detected`);
});

const identityCases = [
  ["literal", `export const value = "Royal Benchmark";`],
  ["case folded", `export const value = "rOyAl bEnChMaRk";`],
  ["hex escaped", `export const value = "\\x52oyal Benchmark";`],
  ["unicode escaped", `export const value = "\\u0052oyal Benchmark";`],
  ["concatenated", `export const value = "Royal " + "Benchmark";`],
  ["parenthesized", `export const value = (("Royal ") + ("Benchmark"));`],
  ["template", "export const value = `Royal Benchmark`;"],
  ["template expression", 'export const value = `Royal ${"Benchmark"}`;'],
  ["indirect", [
    `const first = "Royal ";`,
    `const second = "Benchmark";`,
    `export const value = first + second;`,
  ].join("\n")],
  ["contained", `export const value = "prefix Royal Benchmark suffix";`],
  ["json graph", `import data from "./data.json";`, {
    "src/data.json": `{"identity":"Royal Benchmark"}`,
  }],
];

test("shipping isolation guard: rejects protected identities after static evaluation", () => {
  let detected = 0;
  for (const [name, source, files] of identityCases) {
    const report = auditShippingIsolation({
      protectedIdentities: PROTECTED,
      root: project(source, { files, name }),
    });
    assert.equal(
      codes(report).has("PROTECTED_IDENTITY") ||
        codes(report).has("PROTECTED_BYTES"),
      true,
      `${name}: ${formatShippingIsolationReport(report)}`,
    );
    detected += 1;
  }
  assert.equal(detected, 11);
  console.log(`shipping guard identity adversaries: ${detected}/11 detected`);
});

test("shipping isolation guard: scans unreachable distributable outputs bytewise", () => {
  const root = project(`export const clean = true;`, {
    files: {
      "dist/chunk.js": `const first = "Royal "; const identity = first + "Benchmark";`,
      "dist/chunk.js.map": JSON.stringify({
        sources: ["comparison-only.js"],
        sourcesContent: [`export const leaked = "Royal Benchmark";`],
        version: 3,
      }),
      "dist/reference/map.json": `{"safe":true}`,
    },
    name: "dist",
  });
  const report = auditShippingIsolation({
    bounds: { maxTotalBytes: 60 },
    protectedIdentities: PROTECTED,
    root,
  });

  assert.equal(report.ok, false);
  assert.equal(codes(report).has("PROTECTED_BYTES"), true);
  assert.equal(codes(report).has("REFERENCE_FILE"), true);
  assert.equal(codes(report).has("TOTAL_SIZE_LIMIT"), true);
  assert.equal(report.files.includes("dist/chunk.js"), true);
  assert.equal(report.files.includes("dist/chunk.js.map"), true);
});

test("shipping isolation guard: detects embedded reference-file bytes", () => {
  const corpus = JSON.stringify({
    fixture: "comparison-only numeric corpus",
    values: [101, 203, 509, 887, 1_367],
  });
  const root = project(`export const clean = true;`, {
    files: {
      "dist/copied-corpus.json": `{"wrapped":${corpus}}`,
      "reference/stats/comparison.json": corpus,
    },
    name: "embedded-corpus",
  });
  const report = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root,
  });
  assert.equal(codes(report).has("REFERENCE_CONTENT"), true);
});

test("shipping isolation guard: rejects unresolved dynamic specifiers fail-closed", () => {
  const root = project(`export const load = (name) => import(name);`, {
    name: "dynamic",
  });
  const report = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root,
  });
  assert.equal(codes(report).has("UNRESOLVED_DYNAMIC_SPECIFIER"), true);

  const external = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root: project(`import("https://example.invalid/runtime.js");`, {
      name: "external-runtime",
    }),
  });
  assert.equal(codes(external).has("MODULE_UNSUPPORTED"), true);

  for (const [name, source] of [
    ["function-import", [
      `const load = Function("specifier", "return import(specifier)");`,
      `load("./clean.js");`,
    ].join("\n")],
    ["eval-require", `eval("require('./clean.cjs')");`],
  ]) {
    const constructed = auditShippingIsolation({
      protectedIdentities: PROTECTED,
      root: project(source, {
        files: {
          "src/clean.cjs": `module.exports = "clean";`,
          "src/clean.js": `export const clean = true;`,
        },
        name,
      }),
    });
    assert.equal(
      codes(constructed).has("UNRESOLVED_DYNAMIC_SPECIFIER"),
      true,
      name,
    );
  }
});

test("shipping isolation guard: benign words, similar paths, URLs, and comments pass", () => {
  const benign = [
    `export const title = "Royal benchmarking handbook";`,
    `export const title = "Benchmark";`,
    `export const path = "./reference-copy/data.js";`,
    `export const path = "./myreference/data.js";`,
    `export const url = "./asset.js?from=/reference/data";`,
    `// import "../reference/data.js";`,
    `/* "Royal Benchmark" */`,
  ].join("\n");
  const report = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root: project(benign, { name: "benign" }),
  });
  assert.equal(report.ok, true, formatShippingIsolationReport(report));

  const embedded = auditShippingIsolation({
    protectedIdentities: ["Sentinel"],
    root: project([
      `const prefixSentinelSuffix = "clean";`,
      `export const label = "prefixSentinelSuffix";`,
    ].join("\n"), { name: "embedded-single-word" }),
  });
  assert.equal(codes(embedded).has("PROTECTED_IDENTITY"), true);

  const establishedAmbiguity = auditShippingIsolation({
    protectedIdentities: ["clone", "Clone"],
    root: project([
      `const cloneCandidate = "recursive clone eligibility";`,
      `export { cloneCandidate };`,
    ].join("\n"), { name: "ambiguous-single-word" }),
  });
  assert.equal(
    establishedAmbiguity.ok,
    true,
    formatShippingIsolationReport(establishedAmbiguity),
  );
});

test("shipping isolation guard: path traversal and symlink escapes are rejected", (t) => {
  const outside = temporaryRoot("outside");
  write(join(outside, "outside.js"), `export const outside = true;`);
  const traversalRoot = project(
    `import ${JSON.stringify(join(outside, "outside.js"))};`,
    { name: "traversal" },
  );
  const traversal = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root: traversalRoot,
  });
  assert.equal(codes(traversal).has("MODULE_ESCAPE"), true);

  const symlinkRoot = project(`import "./linked.js";`, { name: "symlink" });
  try {
    symlinkSync(join(outside, "outside.js"), join(symlinkRoot, "src/linked.js"));
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const linked = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root: symlinkRoot,
  });
  assert.equal(codes(linked).has("MODULE_ESCAPE"), true);
});

test("shipping isolation guard: in-root symlink aliases cannot conceal reference files", (t) => {
  const root = project(`import "./alias.js";`, { name: "reference-link" });
  write(join(root, "reference/secret.js"), `export const safe = true;`);
  try {
    symlinkSync(
      join(root, "reference/secret.js"),
      join(root, "src/alias.js"),
    );
  } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) {
      t.skip(`symlinks unavailable: ${error.code}`);
      return;
    }
    throw error;
  }
  const report = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root,
  });
  assert.equal(codes(report).has("REFERENCE_FILE"), true);
});

test("shipping isolation guard: depth, count, byte, and token bounds fail closed", () => {
  const depthRoot = project(`import "./a.js";`, {
    files: { "src/a.js": `import "./b.js";`, "src/b.js": `export {};` },
    name: "depth",
  });
  assert.equal(codes(auditShippingIsolation({
    bounds: { maxDepth: 1 },
    protectedIdentities: PROTECTED,
    root: depthRoot,
  })).has("DEPTH_LIMIT"), true);

  const countRoot = project(`import "./a.js"; import "./b.js";`, {
    files: { "src/a.js": `export {};`, "src/b.js": `export {};` },
    name: "count",
  });
  assert.equal(codes(auditShippingIsolation({
    bounds: { maxFiles: 2 },
    protectedIdentities: PROTECTED,
    root: countRoot,
  })).has("FILE_LIMIT"), true);

  const byteRoot = project(`export const value = "1234567890";`, {
    name: "bytes",
  });
  assert.equal(codes(auditShippingIsolation({
    bounds: { maxFileBytes: 10 },
    protectedIdentities: PROTECTED,
    root: byteRoot,
  })).has("FILE_SIZE_LIMIT"), true);

  const tokenRoot = project(`export const a = "a"; export const b = "b";`, {
    name: "tokens",
  });
  assert.equal(codes(auditShippingIsolation({
    bounds: { maxTokensPerFile: 3 },
    protectedIdentities: PROTECTED,
    root: tokenRoot,
  })).has("SOURCE_PARSE"), true);
});

test("shipping isolation guard: failures are collected atomically without mutation", () => {
  const root = project([
    `import "../reference/data.js";`,
    `export const identity = "Royal " + "Benchmark";`,
  ].join("\n"), { name: "atomic" });
  const before = readFileSync(join(root, "src/index.js"), "utf8");
  const report = auditShippingIsolation({
    protectedIdentities: PROTECTED,
    root,
  });
  const after = readFileSync(join(root, "src/index.js"), "utf8");

  assert.equal(report.ok, false);
  assert.equal(report.issues.length >= 2, true);
  assert.equal(codes(report).has("REFERENCE_SPECIFIER"), true);
  assert.equal(codes(report).has("PROTECTED_IDENTITY"), true);
  assert.equal(after, before);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.entries), true);
  assert.equal(Object.isFrozen(report.files), true);
  assert.equal(Object.isFrozen(report.issues), true);
  assert.equal(Object.isFrozen(report.issues[0]), true);
  assert.equal(Object.isFrozen(report.stats), true);
});

test("shipping isolation guard: executable CLI reports canonical success and failure", () => {
  const cleanRoot = temporaryRoot("cli-clean");
  cpSync(CLEAN_FIXTURE, cleanRoot, { recursive: true });
  const success = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/shipping-isolation-guard.js"), cleanRoot],
    { encoding: "utf8" },
  );
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).ok, true);

  const failureRoot = project(`import "../reference/data.js";`, {
    name: "cli-failure",
  });
  const failure = spawnSync(
    process.execPath,
    [join(ROOT, "scripts/shipping-isolation-guard.js"), failureRoot],
    { encoding: "utf8" },
  );
  assert.equal(failure.status, 1, failure.stderr);
  const parsed = JSON.parse(failure.stdout);
  assert.equal(parsed.ok, false);
  assert.deepEqual(parsed.issues, [...parsed.issues].sort((a, b) =>
    a.file.localeCompare(b.file) || a.code.localeCompare(b.code) ||
    a.detail.localeCompare(b.detail)
  ));
});

test("shipping isolation guard: this repository's shipped entry graph passes", () => {
  const report = auditShippingIsolation({ root: ROOT });
  assert.equal(report.ok, true, formatShippingIsolationReport(report));
  assert.equal(report.stats.protectedIdentities, 218);
  assert.equal(report.stats.graphFiles > 50, true);
});
