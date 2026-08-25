import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";

import {
  createVisualBible,
  serializeVisualBible,
} from "../src/content/visual-art-direction.js";
import {
  VISUAL_ASSET_MAX_COUNT,
  admitVisualAssetManifest,
  admitVisualAssetManifestFromGraph,
  createVisualAssetManifest,
  serializeVisualAssetManifest,
} from "../src/content/visual-asset-manifest.js";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "..");
const SHIPPED_ASSET_DISK_ROOT = join(ROOT, "public/assets");
const REFERENCE_DISK_ROOT = join(ROOT, "reference");

const BIBLE_DIMENSIONS = Object.freeze([
  "factionIdentity",
  "materials",
  "palette",
  "scale",
  "silhouettes",
  "typography",
]);

const PROTECTED_SOURCE_PATTERN = /supercell|clash[ _-]?royale/i;
const HEX_COLOR_PATTERN = /^#[0-9A-F]{6}$/;

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function listFilesRecursively(root) {
  const found = [];
  const visit = (absolute, relative) => {
    for (const entry of readdirSync(absolute).sort()) {
      const entryAbsolute = join(absolute, entry);
      if (statSync(entryAbsolute).isDirectory()) {
        visit(entryAbsolute, relative ? `${relative}/${entry}` : entry);
      } else {
        found.push({
          absolute: entryAbsolute,
          relative: relative ? `${relative}/${entry}` : entry,
        });
      }
    }
  };
  visit(root, "");
  return found;
}

function svgViewBoxSize(bytes) {
  const match = /viewBox="0 0 (\d+) (\d+)"/.exec(bytes.toString("utf8"));
  if (!match) return null;
  return { height: Number(match[2]), width: Number(match[1]) };
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

test("visual asset manifest: frozen visual bible pins all six dimensions", () => {
  assert.throws(() => createVisualBible("x"), TypeError);
  const bible = createVisualBible();
  const first = serializeVisualBible();
  const second = serializeVisualBible();
  assert.equal(first, second);
  assert.equal(canonical(bible), first);

  for (const dimension of BIBLE_DIMENSIONS) {
    assert.ok(Object.hasOwn(bible, dimension), `bible missing ${dimension}`);
    assert.ok(
      JSON.stringify(bible[dimension]).length >= 100,
      `bible dimension ${dimension} lacks concrete values`,
    );
  }

  assert.equal(bible.version, 1);
  assert.ok(bible.palette.length >= 10);
  for (const swatch of bible.palette) {
    assert.match(swatch.hex, HEX_COLOR_PATTERN, swatch.name);
    assert.ok(swatch.name.length > 0 && swatch.role.length > 0);
  }
  const paletteHexes = new Set(bible.palette.map(({ hex }) => hex));
  assert.equal(paletteHexes.size, bible.palette.length);
  assert.ok(bible.silhouettes.families.length >= 5);
  assert.ok(bible.materials.shadeStepDarkenRatio > 0);
  assert.match(bible.scale.tileReference, /tile/);
  assert.ok(bible.typography.displayFace.fallbackStack.includes("serif"));
  assert.ok(bible.factionIdentity.factions.length >= 2);
});

test("visual asset manifest: visual bible is content-addressed by pinned digest", () => {
  // Pinned at introduction (VIS-003A round 1). Any edit to the bible's
  // canonical bytes changes this digest and fails here until deliberately
  // re-pinned as a frozen revision.
  const PINNED_BIBLE_SHA256 =
    "cfbfbd4b607011b2e3c21adb6e284211616f2e8677c8e34ad029e748d38b7bec";
  assert.equal(sha256(serializeVisualBible()), PINNED_BIBLE_SHA256);
});

test("visual asset manifest: registry matches shipped assets on disk byte-for-byte", () => {
  assert.throws(() => createVisualAssetManifest("x"), TypeError);
  const manifest = createVisualAssetManifest();
  assert.equal(canonical(manifest), serializeVisualAssetManifest());
  assert.equal(admitVisualAssetManifest(serializeVisualAssetManifest()).assets.length,
    manifest.assets.length);

  const diskFiles = listFilesRecursively(SHIPPED_ASSET_DISK_ROOT)
    .map(({ absolute, relative }) => ({ absolute, manifestPath: `assets/${relative}` }));
  const diskByPath = new Map(diskFiles.map((file) => [file.manifestPath, file]));
  const entriesByPath = new Map(manifest.assets.map((asset) => [asset.path, asset]));

  assert.equal(diskFiles.length, manifest.assets.length);
  assert.ok(manifest.assets.length >= 1, "manifest must account for shipped reality");
  assert.ok(manifest.assets.length <= VISUAL_ASSET_MAX_COUNT);

  for (const [path, file] of diskByPath) {
    const entry = entriesByPath.get(path);
    assert.ok(entry, `unregistered shipped asset under public/assets: ${path}`);
    const bytes = readFileSync(file.absolute);
    assert.equal(bytes.byteLength, entry.byteLength, `${path}: byte length drift`);
    assert.equal(sha256(bytes), entry.sha256, `${path}: sha-256 drift`);
    const observedSize = svgViewBoxSize(bytes);
    if (observedSize && entry.dimensions) {
      assert.deepEqual(observedSize, entry.dimensions, `${path}: dimension drift`);
    }
  }
  for (const [path, entry] of entriesByPath) {
    assert.ok(diskByPath.has(path), `phantom manifest entry with no file: ${path}`);
    assert.equal(entry.authorship, "in-repo-authored");
    assert.match(entry.sha256, /^[0-9a-f]{64}$/);
  }
});

test("visual asset manifest: zero byte overlap with the reference corpus", () => {
  const manifest = createVisualAssetManifest();
  const manifestDigests = new Set([
    ...manifest.assets.map(({ sha256: digest }) => digest),
    sha256(serializeVisualBible()),
    sha256(serializeVisualAssetManifest()),
  ]);

  const referenceFiles = listFilesRecursively(REFERENCE_DISK_ROOT);
  assert.ok(referenceFiles.length > 0, "reference corpus walk must be non-vacuous");
  const referenceDigests = new Set();
  for (const file of referenceFiles) {
    referenceDigests.add(sha256(readFileSync(file.absolute)));
  }
  for (const digest of manifestDigests) {
    assert.equal(referenceDigests.has(digest), false,
      `manifest or bible bytes collide with a reference corpus file (${digest})`);
  }
});

test("visual asset manifest: provenance never references protected-game sources", () => {
  const manifest = createVisualAssetManifest();
  const bibleBytes = serializeVisualBible();
  const manifestBytes = serializeVisualAssetManifest();
  assert.equal(PROTECTED_SOURCE_PATTERN.test(bibleBytes), false);
  assert.equal(PROTECTED_SOURCE_PATTERN.test(manifestBytes), false);
  for (const asset of manifest.assets) {
    assert.equal(PROTECTED_SOURCE_PATTERN.test(asset.authorship), false);
    assert.equal(PROTECTED_SOURCE_PATTERN.test(asset.license), false);
    assert.equal(asset.authorship, "in-repo-authored");
    assert.ok(["CC0-1.0", "MIT", "OFL-1.1"].includes(asset.license));
  }
});

const BASE_ASSET = Object.freeze({
  authorship: "in-repo-authored",
  byteLength: 368,
  dimensions: { height: 64, width: 64 },
  format: "svg",
  id: "emberfall-mark",
  kind: "icon",
  license: "CC0-1.0",
  path: "assets/icons/emberfall-mark.svg",
  sha256: "4f355159095ed8682d39b593d2736b542a975985b0395abfe98bdf9837a9749c",
});

function variant(overrides = {}, manifestOverrides = {}) {
  const graph = {
    assets: [{ ...BASE_ASSET, ...overrides }],
    root: "public/assets",
    version: 1,
    ...manifestOverrides,
  };
  return JSON.parse(canonical(graph));
}

function admitsVariant(overrides, manifestOverrides) {
  return admitVisualAssetManifestFromGraph(variant(overrides, manifestOverrides));
}

function rejects(label, fn) {
  assert.throws(fn, TypeError, label);
}

test("visual asset manifest: admission accepts only the closed canonical surface", () => {
  assert.equal(admitsVariant().assets.length, 1);

  rejects("non-string envelope", () => admitVisualAssetManifest(undefined));
  rejects("non-string envelope object", () =>
    admitVisualAssetManifest(createVisualAssetManifest()));
  rejects("invalid json", () => admitVisualAssetManifest("{not json"));
  rejects("non-canonical pretty text", () =>
    admitVisualAssetManifest(JSON.stringify(createVisualAssetManifest(), null, 2)));
  rejects("non-canonical key order", () => {
    const parsed = createVisualAssetManifest();
    admitVisualAssetManifest(`{"version":${parsed.version},"root":${JSON.stringify(
      parsed.root)},"assets":${canonical(parsed.assets)}}`);
  });

  rejects("wrong version", () => admitsVariant(undefined, { version: 2 }));
  rejects("missing version key", () => {
    const graph = variant();
    delete graph.version;
    admitVisualAssetManifestFromGraph(graph);
  });
  rejects("extra manifest key", () => admitsVariant(undefined, { extra: true }));
  rejects("extra asset key", () => admitsVariant({ extra: "field" }));
  rejects("missing asset key", () => {
    const graph = variant();
    delete graph.assets[0].license;
    admitVisualAssetManifestFromGraph(graph);
  });

  rejects("duplicate ids", () => {
    const graph = variant();
    graph.assets.push({ ...graph.assets[0], path: "assets/icons/other.svg" });
    admitVisualAssetManifestFromGraph(graph);
  });
  rejects("duplicate paths", () => {
    const graph = variant();
    graph.assets.push({ ...graph.assets[0], id: "second-mark" });
    admitVisualAssetManifestFromGraph(graph);
  });
  rejects("unknown kind", () => admitsVariant({ kind: "sprite" }));
  rejects("format kind mismatch", () => admitsVariant({
    format: "png",
    path: "assets/icons/emberfall-mark.png",
  }));
  rejects("extension mismatch", () =>
    admitsVariant({ path: "assets/icons/emberfall-mark.png" }));
  rejects("path traversal", () =>
    admitsVariant({ path: "assets/../assets/icons/emberfall-mark.svg" }));
  rejects("path outside root", () =>
    admitsVariant({ path: "elsewhere/icons/emberfall-mark.svg" }));
  rejects("uppercase digest", () =>
    admitsVariant({ sha256: BASE_ASSET.sha256.toUpperCase() }));
  rejects("short digest", () => admitsVariant({ sha256: "abc123" }));
  rejects("zero byte length", () => admitsVariant({ byteLength: 0 }));
  rejects("byte cap violation", () =>
    admitsVariant({ byteLength: 65_537 }));
  rejects("dimension cap violation", () =>
    admitsVariant({ dimensions: { height: 64, width: 513 } }));
  rejects("icon without bounded dimensions", () => admitsVariant({ dimensions: null }));
  rejects("dimensions on uncapped kind", () => admitsVariant({
    format: "otf",
    kind: "font",
    path: "assets/fonts/rivermark-slab.otf",
    dimensions: { height: 1, width: 1 },
  }));
  rejects("unknown license", () => admitsVariant({ license: "LicenseRef-Unknown" }));
  rejects("unknown authorship record", () =>
    admitsVariant({ authorship: "scraped-from-web" }));
  rejects("malformed id", () => admitsVariant({ id: "Bad_Id" }));
  rejects("sparse asset list", () => {
    const graph = variant();
    delete graph.assets[0];
    admitVisualAssetManifestFromGraph(graph);
  });
  rejects("symbol keyed surface", () => {
    const graph = variant();
    const decorated = new Proxy(graph, {
      get(target, key, receiver) {
        if (key === Symbol.for("smuggle")) return "contraband";
        return Reflect.get(target, key, receiver);
      },
      ownKeys(target) {
        return [...Reflect.ownKeys(target), Symbol.for("smuggle")];
      },
    });
    admitVisualAssetManifestFromGraph(decorated);
  });

  let accessorCovered = 0;
  rejects("accessor asset field", () => {
    const graph = variant();
    const smuggledValue = { height: 64, width: 64 };
    Object.defineProperty(graph.assets[0], "dimensions", {
      enumerable: true,
      get() {
        return smuggledValue;
      },
    });
    admitVisualAssetManifestFromGraph(graph);
    accessorCovered += 1;
  });
  rejects("proxy wrapped manifest", () => {
    const graph = variant();
    admitVisualAssetManifestFromGraph(new Proxy(graph, {}));
  });
  rejects("proxy lying about fields", () => {
    const graph = variant();
    admitVisualAssetManifestFromGraph(new Proxy(graph, {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        if (descriptor && key === "version") {
          return { ...descriptor, value: 999 };
        }
        return descriptor;
      },
    }));
  });
  assert.equal(accessorCovered, 0,
    "rejected graphs must fail before any accessor value is consumed");
});
