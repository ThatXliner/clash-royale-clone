export const VISUAL_ASSET_MANIFEST_VERSION = 1;
export const SHIPPED_ASSET_ROOT = "public/assets";
export const VISUAL_ASSET_MAX_COUNT = 4096;
export const VISUAL_ASSET_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

const ASSET_KINDS = new Set(["font", "icon", "image", "model"]);
const FORMATS_BY_KIND = Object.freeze({
  font: new Set(["otf", "ttf", "woff2"]),
  icon: new Set(["svg"]),
  image: new Set(["png", "webp"]),
  model: new Set(["glb"]),
});
const BYTE_CAPS_BY_KIND = Object.freeze({
  font: 1_048_576,
  icon: 65_536,
  image: 4_194_304,
  model: 16_777_216,
});
// Fonts and models are bounded by byte caps only; raster/vector surfaces are
// additionally bounded by the pixel caps from the visual bible scale rules.
const DIMENSION_CAPS_BY_KIND = Object.freeze({
  font: null,
  icon: 512,
  image: 4096,
  model: null,
});
const LICENSES = new Set(["CC0-1.0", "MIT", "OFL-1.1"]);
const AUTHORSHIP_VALUES = new Set(["in-repo-authored"]);

const MANIFEST_FIELDS = ["assets", "root", "version"];
const ASSET_FIELDS = [
  "authorship",
  "byteLength",
  "dimensions",
  "format",
  "id",
  "kind",
  "license",
  "path",
  "sha256",
];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ASSET_PATH_PATTERN = /^assets\/[a-z0-9][a-z0-9/.-]*[a-z0-9]$/;

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function freeze(value) {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function exactKeys(value, expected, label) {
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const actual = Reflect.ownKeys(descriptors);
  if (
    actual.length !== expected.length ||
    actual.some((key) => typeof key !== "string" || !expected.includes(key)) ||
    expected.some((key) => {
      const descriptor = descriptors[key];
      return !descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor, "value");
    })
  ) {
    throw new TypeError(`${label} has an invalid field surface`);
  }
}

function assertPlainGraph(value, label) {
  if (value === null || typeof value !== "object") {
    throw new TypeError(`${label} must be a plain data graph`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype) {
    throw new TypeError(`${label} must be a plain object graph`);
  }
  let cloned;
  try {
    cloned = structuredClone(value);
  } catch {
    throw new TypeError(`${label} must be a structurally clonable plain graph`);
  }
  if (canonical(cloned) !== canonical(value)) {
    throw new TypeError(`${label} does not round-trip as a plain data graph`);
  }
}

function denseList(value, label, maximum) {
  if (!Array.isArray(value) || value.length > maximum) {
    throw new TypeError(`${label} must be a bounded list`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const expected = new Set([
    "length",
    ...Array.from({ length: value.length }, (_, index) => String(index)),
  ]);
  if (
    Reflect.ownKeys(descriptors).length !== expected.size ||
    [...Reflect.ownKeys(descriptors)].some((key) =>
      typeof key !== "string" || !expected.has(key)) ||
    !descriptors.length ||
    descriptors.length.enumerable ||
    !Object.hasOwn(descriptors.length, "value") ||
    descriptors.length.value !== value.length ||
    Array.from({ length: value.length }, (_, index) => String(index)).some((key) =>
      !descriptors[key].enumerable || !Object.hasOwn(descriptors[key], "value"))
  ) {
    throw new TypeError(`${label} must contain dense data properties`);
  }
}

function validateDimensions(dimensionValue, kind, label) {
  const cap = DIMENSION_CAPS_BY_KIND[kind];
  if (dimensionValue === null) {
    if (cap !== null) {
      throw new TypeError(`${label} requires bounded dimensions for kind ${kind}`);
    }
    return;
  }
  if (cap === null) {
    throw new TypeError(`${label} must not declare dimensions for kind ${kind}`);
  }
  exactKeys(dimensionValue, ["height", "width"], `${label}.dimensions`);
  for (const field of ["height", "width"]) {
    const bound = dimensionValue[field];
    if (!Number.isSafeInteger(bound) || bound < 1 || bound > cap) {
      throw new TypeError(
        `${label}.dimensions.${field} exceeds the ${kind} pixel cap ${cap}`,
      );
    }
  }
}

function validateAsset(asset, label, seenIds, seenPaths) {
  exactKeys(asset, ASSET_FIELDS, label);
  for (const field of ASSET_FIELDS) {
    if (field === "dimensions") continue;
    const fieldValue = asset[field];
    if (fieldValue === null || typeof fieldValue === "object") {
      throw new TypeError(`${label}.${field} must be a primitive source value`);
    }
  }
  if (
    typeof asset.id !== "string" ||
    !VISUAL_ASSET_ID_PATTERN.test(asset.id) ||
    seenIds.has(asset.id)
  ) {
    throw new TypeError(`${label}.id is missing, malformed, or duplicated`);
  }
  seenIds.add(asset.id);
  if (
    typeof asset.path !== "string" ||
    !ASSET_PATH_PATTERN.test(asset.path) ||
    asset.path.includes("..") ||
    seenPaths.has(asset.path)
  ) {
    throw new TypeError(`${label}.path is missing, malformed, or duplicated`);
  }
  seenPaths.add(asset.path);
  if (!ASSET_KINDS.has(asset.kind)) {
    throw new TypeError(`${label}.kind is unknown`);
  }
  if (
    typeof asset.format !== "string" ||
    !FORMATS_BY_KIND[asset.kind].has(asset.format) ||
    !asset.path.endsWith(`.${asset.format}`)
  ) {
    throw new TypeError(`${label}.format does not match its kind and path extension`);
  }
  if (
    typeof asset.sha256 !== "string" ||
    !SHA256_PATTERN.test(asset.sha256)
  ) {
    throw new TypeError(`${label}.sha256 is not a lowercase hex sha-256 digest`);
  }
  if (
    !Number.isSafeInteger(asset.byteLength) ||
    asset.byteLength < 1 ||
    asset.byteLength > BYTE_CAPS_BY_KIND[asset.kind]
  ) {
    throw new TypeError(`${label}.byteLength violates the ${asset.kind} byte cap`);
  }
  if (
    typeof asset.authorship !== "string" ||
    !AUTHORSHIP_VALUES.has(asset.authorship)
  ) {
    throw new TypeError(`${label}.authorship is not a recognized in-repo authorship record`);
  }
  if (typeof asset.license !== "string" || !LICENSES.has(asset.license)) {
    throw new TypeError(`${label}.license is not an accepted SPDX license`);
  }
  validateDimensions(asset.dimensions, asset.kind, label);
}

function validateManifestGraph(manifest) {
  assertPlainGraph(manifest, "visual asset manifest");
  exactKeys(manifest, MANIFEST_FIELDS, "visual asset manifest");
  if (manifest.version !== VISUAL_ASSET_MANIFEST_VERSION) {
    throw new TypeError("visual asset manifest version mismatch");
  }
  if (manifest.root !== SHIPPED_ASSET_ROOT) {
    throw new TypeError("visual asset manifest root mismatch");
  }
  denseList(manifest.assets, "visual asset manifest assets", VISUAL_ASSET_MAX_COUNT);
  const seenIds = new Set();
  const seenPaths = new Set();
  for (let index = 0; index < manifest.assets.length; index += 1) {
    const asset = manifest.assets[index];
    assertPlainGraph(asset, `visual asset manifest assets[${index}]`);
    if (asset.dimensions !== null) {
      assertPlainGraph(asset.dimensions, `visual asset manifest assets[${index}].dimensions`);
    }
    validateAsset(asset, `visual asset manifest assets[${index}]`, seenIds, seenPaths);
  }
  return true;
}

const REGISTERED_ASSETS = [
  {
    authorship: "in-repo-authored",
    byteLength: 368,
    dimensions: { height: 64, width: 64 },
    format: "svg",
    id: "emberfall-mark",
    kind: "icon",
    license: "CC0-1.0",
    path: "assets/icons/emberfall-mark.svg",
    sha256: "4f355159095ed8682d39b593d2736b542a975985b0395abfe98bdf9837a9749c",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 301,
    dimensions: { height: 64, width: 64 },
    format: "svg",
    id: "rivermark-pip",
    kind: "icon",
    license: "CC0-1.0",
    path: "assets/icons/rivermark-pip.svg",
    sha256: "491e48bf2aa7d15754b7ea836bc0569728cece454205ed370e9745e36a470607",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 421,
    dimensions: { height: 64, width: 64 },
    format: "svg",
    id: "tidewarden-mark",
    kind: "icon",
    license: "CC0-1.0",
    path: "assets/icons/tidewarden-mark.svg",
    sha256: "051dbf39eda3e58d45eea74c581cb62264f871113ea824a877030ffc04175963",
  },
];

const MANIFEST = freeze({
  assets: freeze(REGISTERED_ASSETS.map((asset) => freeze({
    ...asset,
    dimensions: asset.dimensions === null ? null : freeze({ ...asset.dimensions }),
  }))),
  root: SHIPPED_ASSET_ROOT,
  version: VISUAL_ASSET_MANIFEST_VERSION,
});

const MANIFEST_BYTES = canonical(MANIFEST);

export function createVisualAssetManifest(...args) {
  if (args.length !== 0) {
    throw new TypeError("visual asset manifest takes no arguments");
  }
  return JSON.parse(MANIFEST_BYTES);
}

export function serializeVisualAssetManifest(...args) {
  if (args.length !== 0) {
    throw new TypeError("visual asset manifest serialization takes no arguments");
  }
  return MANIFEST_BYTES;
}

/**
 * Fail-closed admission of a serialized manifest envelope. Only canonical
 * JSON text with the exact closed field surface is admitted; anything else
 * is rejected without partial reads.
 */
export function admitVisualAssetManifest(serialized) {
  if (typeof serialized !== "string") {
    throw new TypeError("visual asset manifest admission requires canonical JSON text");
  }
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError("visual asset manifest admission requires valid JSON text");
  }
  if (canonical(parsed) !== serialized) {
    throw new TypeError("visual asset manifest admission requires canonical JSON text");
  }
  validateManifestGraph(parsed);
  return freeze(parsed);
}

/**
 * Graph-level admission used by verification paths that hold an already
 * parsed graph. Accessor properties, exotic prototypes, and Proxy wrappers
 * are rejected before any field value is read.
 */
export function admitVisualAssetManifestFromGraph(graph) {
  // Descriptor-level validation runs on the caller's graph itself, so accessor
  // properties fail the exact-key surface before any field value is consumed,
  // and Proxy wrappers fail the plain-graph probe inside validation.
  validateManifestGraph(graph);
  let clone;
  try {
    clone = structuredClone(graph);
  } catch {
    throw new TypeError("visual asset manifest graph is not structurally clonable plain data");
  }
  if (canonical(clone) !== canonical(graph)) {
    throw new TypeError("visual asset manifest graph is not stable under cloning");
  }
  return freeze(clone);
}
