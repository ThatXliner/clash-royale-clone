import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import test from "node:test";
import { buildRelease } from "../scripts/build-release.js";

const WORKSPACE = resolve(new URL("..", import.meta.url).pathname);

async function snapshot(directory) {
  const result = {};
  async function visit(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else result[relative(directory, absolute).split("\\").join("/")] = await readFile(absolute, "hex");
    }
  }
  await visit(directory);
  return result;
}

async function fixture(t, files, limits = {}) {
  const root = await mkdtemp(join(tmpdir(), "release-build-fixture-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, contents] of Object.entries(files)) {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, contents);
  }
  const config = {
    schemaVersion: 1,
    entries: ["public/index.html"],
    limits: { maxFiles: 16, maxFileBytes: 4096, maxTotalBytes: 16384, ...limits },
    allowedExtensions: [".html", ".css", ".js", ".json", ".png", ".svg", ".woff2", ".mp4", ".mp3"],
  };
  const configPath = join(root, "build.json");
  await writeFile(configPath, `${JSON.stringify(config)}\n`);
  return { configPath, output: join(root, "artifact"), root };
}

test("two clean production builds are byte-identical and manifest the explicit graph", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "release-build-real-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const first = join(temporary, "first");
  const second = join(temporary, "second");
  await buildRelease({ output: first });
  await buildRelease({ output: second });
  assert.deepEqual(await snapshot(first), await snapshot(second));

  const manifest = JSON.parse(await readFile(join(first, "release-manifest.json"), "utf8"));
  assert.deepEqual(manifest.entrypoints, ["public/index.html"]);
  assert.equal(manifest.fileCount, manifest.files.length);
  assert.ok(manifest.fileCount > 3);
  assert.deepEqual(manifest.files.map(({ path }) => path),
    manifest.files.map(({ path }) => path).toSorted());
  for (const file of manifest.files) {
    assert.doesNotMatch(file.path, /(?:^|\/)(?:reference|tests)(?:\/|$)|\.map$/);
    const bytes = await readFile(join(first, file.path));
    assert.equal(file.size, bytes.length);
    assert.equal(file.sha256, createHash("sha256").update(bytes).digest("hex"));
  }
});

test("a successful rebuild atomically replaces stale output", async (t) => {
  const project = await fixture(t, {
    "public/index.html": '<link rel="stylesheet" href="./app.css"><script type="module" src="../src/app.js"></script>',
    "public/app.css": ":root { color: blue; }\n",
    "src/app.js": 'import data from "./data.json" with { type: "json" };\nexport { data };\n',
    "src/data.json": '{"ok":true}\n',
  });
  await mkdir(project.output);
  await writeFile(join(project.output, "stale.txt"), "stale");
  await buildRelease(project);
  await assert.rejects(readFile(join(project.output, "stale.txt")), { code: "ENOENT" });
  assert.equal(await readFile(join(project.output, "src/data.json"), "utf8"), '{"ok":true}\n');
});

test("missing and dynamic dependencies fail without touching the prior artifact", async (t) => {
  for (const source of ['import "./missing.js";\n', 'import("./later.js");\n']) {
    await t.test(source.includes("missing") ? "missing" : "dynamic", async (t) => {
      const project = await fixture(t, {
        "public/index.html": '<script type="module" src="../src/app.js"></script>',
        "src/app.js": source,
        "src/later.js": "export default 1;\n",
      });
      await mkdir(project.output);
      await writeFile(join(project.output, "sentinel"), "preserved");
      await assert.rejects(buildRelease(project), /missing release dependency|dynamic import/);
      assert.equal(await readFile(join(project.output, "sentinel"), "utf8"), "preserved");
    });
  }
});

test("syntax-complete JavaScript discovery handles compact forms and JSON attributes", async (t) => {
  for (const source of [
    'import"./missing.js";\n',
    'import{x}from"./missing.js";\n',
    'export{x}from"./missing.js";\n',
  ]) {
    const project = await fixture(t, {
      "public/index.html": '<script type="module" src="../src/app.js"></script>',
      "src/app.js": source,
    });
    await assert.rejects(buildRelease(project), /missing release dependency/);
  }
  for (const source of [
    'import data from "./data.json";\n',
    'import data from "./data.json" with { type: "css" };\n',
    'import data from "./data.json" with { type: "json", mode: "strict" };\n',
  ]) {
    const project = await fixture(t, {
      "public/index.html": '<script type="module" src="../src/app.js"></script>',
      "src/app.js": source,
      "src/data.json": "{}\n",
    });
    await assert.rejects(buildRelease(project), /JSON import requires exactly/);
  }
  const valid = await fixture(t, {
    "public/index.html": '<script type="module" src="../src/app.js"></script>',
    "src/app.js": [
      'const fake = `import("./not-real.js")`;',
      '// import "./also-not-real.js"',
      'import data from "./data.json?version=1#payload" with { type: "json" };',
      "export default data;",
    ].join("\n"),
    "src/data.json": "{}\n",
  });
  await buildRelease(valid);
  assert.equal(await readFile(join(valid.output, "src/data.json"), "utf8"), "{}\n");
});

test("bounded HTML and CSS parsers discover every local browser resource", async (t) => {
  const project = await fixture(t, {
    "public/index.html": [
      "<!doctype html>",
      '<!-- <img src="./missing-comment.png"> -->',
      '<link rel="stylesheet alternate" href="./styles/main.css?x=1#theme">',
      '<link rel="modulepreload" href="../src/preload.js">',
      '<script type="module" src="../src/app.js"></script>',
      '<img srcset="./one.png 1x, ./two.png?size=2 2x">',
      '<video src="./clip.mp4" poster="./poster.png"></video>',
      '<audio src="./sound.mp3"></audio>',
    ].join("\n"),
    "public/styles/main.css": [
      '@import "./theme.css" screen;',
      '.font { src: u\\72l("../font.woff2#face"); }',
      '.image { background: url(../texture.png?v=2); }',
      '.fake::after { content: "url(../missing-string.png)"; }',
      '/* url(../missing-comment.png) */',
    ].join("\n"),
    "public/styles/theme.css": '@import "./main.css";\n:root { color: navy; }\n',
    "public/font.woff2": "font",
    "public/texture.png": "texture",
    "public/one.png": "one",
    "public/two.png": "two",
    "public/clip.mp4": "clip",
    "public/poster.png": "poster",
    "public/sound.mp3": "sound",
    "src/app.js": "export default 1;\n",
    "src/preload.js": "export default 2;\n",
  });
  await buildRelease(project);
  const manifest = JSON.parse(await readFile(join(project.output, "release-manifest.json"), "utf8"));
  assert.deepEqual(manifest.files.map(({ path }) => path), [
    "public/clip.mp4", "public/font.woff2", "public/index.html", "public/one.png",
    "public/poster.png", "public/sound.mp3", "public/styles/main.css",
    "public/styles/theme.css", "public/texture.png", "public/two.png", "src/app.js",
    "src/preload.js",
  ]);
});

test("HTML base and required image resources fail closed", async (t) => {
  const externalBase = await fixture(t, {
    "public/index.html": '<base href="https://cdn.example/"><script src="app.js"></script>',
  });
  await assert.rejects(buildRelease(externalBase), /external dependency/);
  const missingImage = await fixture(t, { "public/index.html": "<img alt=missing>" });
  await assert.rejects(buildRelease(missingImage), /src or srcset is required/);
});

test("HTML base URLs preserve directory semantics across queries and fragments", async (t) => {
  for (const base of ["../assets/?v=1", "../assets/#v"]) {
    const project = await fixture(t, {
      "public/index.html": `<base href="${base}"><script src="app.js"></script>`,
      "assets/app.js": "export default 1;\n",
    });
    await buildRelease(project);
    assert.equal(await readFile(join(project.output, "assets/app.js"), "utf8"), "export default 1;\n");
  }
  const sameDocument = await fixture(t, {
    "public/index.html": '<base href="#v"><script src="app.js"></script>',
    "public/app.js": "export default 2;\n",
  });
  await buildRelease(sameDocument);
  assert.equal(await readFile(join(sameDocument.output, "public/app.js"), "utf8"), "export default 2;\n");
});

test("CSS validates structure and discovers image-set strings and URLs", async (t) => {
  const project = await fixture(t, {
    "public/index.html": '<link rel="stylesheet" href="./main.css">',
    "public/main.css": [
      '.hero { background-image: image-set("./one.png" 1x, url(./two.png) 2x); }',
      '.legacy { background: -webkit-image-set("./three.png" 1x); }',
    ].join("\n"),
    "public/one.png": "one",
    "public/two.png": "two",
    "public/three.png": "three",
  });
  await buildRelease(project);
  for (const name of ["one.png", "two.png", "three.png"])
    assert.equal(await readFile(join(project.output, "public", name), "utf8"), name.slice(0, -4));

  for (const malformed of [".x { color: red", ".x { background: url(./x.png; }", '.x { content: "open; }']) {
    const invalid = await fixture(t, {
      "public/index.html": '<link rel="stylesheet" href="./main.css">',
      "public/main.css": malformed,
    });
    await assert.rejects(buildRelease(invalid), /unbalanced CSS|unterminated CSS/);
  }
});

test("inline CSS, responsive preload, and exact srcset candidates enter the graph", async (t) => {
  const project = await fixture(t, {
    "public/index.html": [
      '<base href="./assets/">',
      '<link rel="preload" as="image" imagesrcset="small.png 320w, wide,name.png 2x">',
      '<div style="background:url(&quot;inline.png?x=1#v&quot;)"></div>',
      '<style>.sheet { background: url(sheet.png); }</style>',
    ].join("\n"),
    "public/assets/small.png": "small",
    "public/assets/wide,name.png": "wide",
    "public/assets/inline.png": "inline",
    "public/assets/sheet.png": "sheet",
  });
  await buildRelease(project);
  const paths = JSON.parse(await readFile(join(project.output, "release-manifest.json"), "utf8"))
    .files.map(({ path }) => path);
  for (const path of ["public/assets/small.png", "public/assets/wide,name.png",
    "public/assets/inline.png", "public/assets/sheet.png"]) assert.ok(paths.includes(path));
});

test("SVG resource graphs recurse through href and CSS while cycles terminate", async (t) => {
  const project = await fixture(t, {
    "public/index.html": '<img src="./art/root.svg">',
    "public/art/root.svg": [
      '<svg xmlns="http://www.w3.org/2000/svg">',
      '<image href="./nested.svg" style="filter:url(#local);fill:url(./fill.svg)"/>',
      '<path fill="url(./paint.svg)"/>',
      '<style>.texture { fill: url(./texture.png); }</style>',
      '</svg>',
    ].join("\n"),
    "public/art/nested.svg": '<svg xmlns="http://www.w3.org/2000/svg"><image xlink:href="./root.svg"/></svg>',
    "public/art/fill.svg": '<svg xmlns="http://www.w3.org/2000/svg"><use href="#shape"/></svg>',
    "public/art/paint.svg": '<svg xmlns="http://www.w3.org/2000/svg"/>',
    "public/art/texture.png": "texture",
  });
  await buildRelease(project);
  const manifest = JSON.parse(await readFile(join(project.output, "release-manifest.json"), "utf8"));
  assert.deepEqual(manifest.files.map(({ path }) => path), [
    "public/art/fill.svg", "public/art/nested.svg", "public/art/paint.svg", "public/art/root.svg",
    "public/art/texture.png", "public/index.html",
  ]);

  for (const svg of [
    '<!DOCTYPE svg SYSTEM "https://example.test/a.dtd"><svg/>',
    '<svg>&external;</svg>',
    '<svg><image href="https://example.test/a.png"/></svg>',
    '<svg><style>.x { fill: url(</style></svg>',
    '<svg><g></svg>',
  ]) {
    const invalid = await fixture(t, {
      "public/index.html": '<img src="./bad.svg">',
      "public/bad.svg": svg,
    });
    await assert.rejects(buildRelease(invalid), /DTD|XML entity|external dependency|unbalanced CSS|unterminated CSS|mismatched XML/);
  }
  const bounded = await fixture(t, {
    "public/index.html": '<img src="./one.svg">',
    "public/one.svg": '<svg><image href="./two.svg"/></svg>',
    "public/two.svg": '<svg><image href="./one.svg"/><image href="./three.svg"/></svg>',
    "public/three.svg": "<svg/>",
  }, { maxFiles: 3 });
  await assert.rejects(buildRelease(bounded), /file-count limit/);
});

test("escapes, symlinks, unsupported maps, and graph bounds are rejected atomically", async (t) => {
  const cases = [
    ["escape", '<script type="module" src="../../outside.js"></script>', {}, /missing release dependency/],
    ["map", '<script type="module" src="./app.js.map"></script>', { "public/app.js.map": "{}" }, /unsupported release file type/],
    ["bound", '<script type="module" src="./app.js"></script>', { "public/app.js": "export default 1;\n" }, /file-count limit/, { maxFiles: 1 }],
  ];
  for (const [name, html, extra, expected, limits] of cases) {
    await t.test(name, async (t) => {
      const project = await fixture(t, { "public/index.html": html, ...extra }, limits);
      await assert.rejects(buildRelease(project), expected);
      await assert.rejects(readFile(join(project.output, "release-manifest.json")), { code: "ENOENT" });
    });
  }

  await t.test("symlink", async (t) => {
    const project = await fixture(t, {
      "public/index.html": '<script type="module" src="./linked.js"></script>',
      "real.js": "export default 1;\n",
    });
    await symlink(join(project.root, "real.js"), join(project.root, "public", "linked.js"));
    await assert.rejects(buildRelease(project), /symbolic link/);
  });
});

test("dangerous and protected output targets are refused", async () => {
  await assert.rejects(buildRelease({ output: WORKSPACE }), /workspace root/);
  await assert.rejects(buildRelease({ output: join(WORKSPACE, "reference", "dist") }), /protected/);
  await assert.rejects(buildRelease({ output: dirname(WORKSPACE) }), /contains the workspace/);
  await assert.rejects(buildRelease({ output: tmpdir() }), /temporary directory root/);
});
