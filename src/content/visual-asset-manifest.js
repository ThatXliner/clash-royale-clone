export const VISUAL_ASSET_MANIFEST_VERSION = 1;
export const SHIPPED_ASSET_ROOT = "public/assets";
export const VISUAL_ASSET_MAX_COUNT = 4096;
export const VISUAL_ASSET_ID_PATTERN = /^[a-z][a-z0-9-]{0,62}$/;

const ASSET_KINDS = new Set(["font", "icon", "image", "model"]);
const FORMATS_BY_KIND = Object.freeze({
  font: new Set(["otf", "ttf", "woff2"]),
  icon: new Set(["svg"]),
  image: new Set(["png", "svg", "webp"]),
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
const LICENSES = new Set(["AGPL-3.0-only", "CC0-1.0", "MIT", "OFL-1.1"]);
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
    byteLength: 987565,
    dimensions: { height: 1254, width: 1254 },
    format: "png",
    id: "briar-runner-painted-sheet",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/briar-runner-painted-sheet.png",
    sha256: "a1aa43df00dacc212beedb4905dddd7a57db412981ea29662bc1d868a97794f4",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 7692,
    dimensions: { height: 408, width: 600 },
    format: "svg",
    id: "briar-runner-sprite-sheet",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/briar-runner-sprite-sheet.svg",
    sha256: "5f25d05932e3c56f9a8dfce7ea9b9d02e9ad2fb34ef0ce983733f9b97b6b7a2e",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 320516,
    dimensions: { height: 887, width: 1774 },
    format: "webp",
    id: "card-portraits-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/card-portraits-painted.webp",
    sha256: "16307a59bde57889e11bcd7b86b54d69ba9985eae6ef436d9703e528fba58e4f",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 390962,
    dimensions: { height: 1672, width: 941 },
    format: "webp",
    id: "moss-ember-arena-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/moss-ember-arena-painted.webp",
    sha256: "22713e1725c21a8f853df5e2af3278689e7e844783606d93c7a12a365d8e930e",
  },
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
  {
    authorship: "in-repo-authored",
    byteLength: 308508,
    dimensions: { height: 1254, width: 1254 },
    format: "webp",
    id: "stonehauler-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/stonehauler-painted.webp",
    sha256: "47c19650d41d21a6efb3f883b6fff73892abd214783279dcb5708cc198b87357",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 52722,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "squall-orb-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/squall-orb-painted.webp",
    sha256: "963c4a9b8a8a35a3c8405663c93fe24ccb13a18c7a22d317236152e3b253a5e3",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 56722,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "cinder-host-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/cinder-host-painted.webp",
    sha256: "8782c64550d8f75e7293a18fefb1006503a9a4bdc92848458c0841148b230b80",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 77128,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "ironroot-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/ironroot-painted.webp",
    sha256: "abccd83c46fda2c01bf9ef6264e5f9dedf42f74d4afc6fa0a05649058fd17dd8",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 213794,
    dimensions: { height: 1254, width: 1254 },
    format: "webp",
    id: "thornscouts-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/thornscouts-painted.webp",
    sha256: "04893c3101194546b572056ad9466d88b26fc2ede3549ec821e1304b1fe9c11a",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 268352,
    dimensions: { height: 1254, width: 1254 },
    format: "webp",
    id: "forgeguard-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/forgeguard-painted.webp",
    sha256: "cdd98ec4812e602b118645de53238013c75b798cd632363c3ffd1235212cc5ed",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 55344,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "sunthread-pair-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/sunthread-pair-painted.webp",
    sha256: "96dc16ece8eae4fea3f84644b0efbe1bacec44f85f9e99e958a18303dd48beec",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 48314,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "duskwing-trio-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/duskwing-trio-painted.webp",
    sha256: "14c435ea7e5f427c1191cbf3deba2cf90beddb74e65273bad9992d4e54c9cefb",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 40140,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "gloamwing-cluster-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/gloamwing-cluster-painted.webp",
    sha256: "176687230a5e9b3b57364437692308f568e2933b7b0225e46694cfbbfb4b6cf8",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 36532,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "coppershade-flock-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/coppershade-flock-painted.webp",
    sha256: "521167c772916265e797c51c28183d91f090c2670ec7d527bf59e60a85684dec",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 70090,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "ember-basin-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/ember-basin-battle-sprite.webp",
    sha256: "9c805943147cbbe48030edb3ed2d197936319af6753a170af70d8210f1b5a7c9",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 71726,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "ember-basin-portrait-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/ember-basin-portrait-painted.webp",
    sha256: "1bdcc5aa3f6efdbb37cf0dab5023f326884d8e4409545749f50b4125acc1f232",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 74608,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "ember-basin-portrait-painted-v2",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/ember-basin-portrait-painted-v2.webp",
    sha256: "fbeb95f34410348c34bf68892deb25b7df387783c7d88819ee7a7b37038c87a3",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 65626,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "kilnkeeper-portrait-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/kilnkeeper-portrait-painted.webp",
    sha256: "38e9f64348fa823a64755fda2496b699c88c27c7dd0a14a440e704d9093d2240",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 47138,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "kilnkeeper-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/kilnkeeper-battle-sprite.webp",
    sha256: "43766c813461acbfe36a949c6a972ba4e5ddf07513276bd5079cf564b1bf157a",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 78170,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "rivet-runners-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/rivet-runners-battle-sprite.webp",
    sha256: "0a9d033f894bd19178871a2927117cf66bb7f42c0b65dc224e11cecca0b4ce53",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 76868,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "rivet-runners-portrait-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/rivet-runners-portrait-painted.webp",
    sha256: "6df560ccabb6c7f7347225bdb4c0fe2f9eadbb3aa1f769b6b540cd6f96c35b77",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 75334,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "buried-coil-portrait",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/buried-coil-portrait.webp",
    sha256: "e52c43cc2c56f4aef3d3410a8a7adb1df63de581eb2fd93f443d85271ae62d5b",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 43144,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "buried-coil-hidden-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/buried-coil-hidden.webp",
    sha256: "5ee469494f97eab0652cc150d6b23b75c5bca44eba90b84a88cf8faf98d1a469",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 1565,
    dimensions: { height: 13, width: 13 },
    format: "svg",
    id: "buried-coil-revealed-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/buried-coil-revealed.svg",
    sha256: "0e677493ea65b9132ed553ec21a1efdf474cc887d6e21d569ff4fc3f96189b53",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 49440,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "brackenwheel-battle-sprite",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/brackenwheel-battle-sprite.webp",
    sha256: "440ef5d41aa289c8701151ad36916e0cdce1ce3bcfb2996852c0dc3d10d4621c",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 62014,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "brackenwheel-portrait-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/brackenwheel-portrait-painted.webp",
    sha256: "8c46fd063956905674aab420a0a2513ed83013c31c12c4e45456880f43246096",
  },
  {
    authorship: "in-repo-authored",
    byteLength: 71106,
    dimensions: { height: 512, width: 512 },
    format: "webp",
    id: "aether-well-portrait-painted",
    kind: "image",
    license: "AGPL-3.0-only",
    path: "assets/aether-well-portrait-painted.webp",
    sha256: "f46cb6b879def255c14058428fa6689e996b8e6699f675c02f19e0812638169c",
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
