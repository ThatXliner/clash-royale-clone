import { createHash } from "node:crypto";
import { lstat, readFile, readdir } from "node:fs/promises";
import { extname, join, relative, sep } from "node:path";
import { protectedIdentityHitsInSource } from "./shipping-isolation-guard.js";

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function portablePath(path) {
  return path.split(sep).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function isText(bytes) {
  return !bytes.includes(0) && !bytes.toString("utf8").includes("\ufffd");
}

async function referenceFiles(root) {
  const files = [];
  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const path = join(directory, entry.name);
      const info = await lstat(path);
      invariant(!info.isSymbolicLink(), `reference corpus contains a symbolic link: ${path}`);
      if (info.isDirectory()) await visit(path);
      else if (info.isFile()) files.push({ bytes: await readFile(path), path });
    }
  }
  const directory = join(root, "reference");
  try {
    await lstat(directory);
  } catch (error) {
    if (error?.code === "ENOENT") return files;
    throw error;
  }
  await visit(directory);
  return files;
}

function assertPortableReleasePath(path) {
  invariant(typeof path === "string" && path.length > 0 &&
    !path.startsWith("/") && !path.includes("\\") && !path.includes("\0"),
  `invalid release path: ${String(path)}`);
  const segments = path.split("/");
  invariant(segments.every((segment) => segment !== "" && segment !== "." && segment !== ".."),
    `non-canonical release path: ${path}`);
  invariant(!segments.some((segment) =>
    [".git", ".agents", ".codex", "reference", "tests"].includes(segment.toLowerCase())),
  `protected path in release graph: ${path}`);
  invariant(extname(path).toLowerCase() !== ".map", `source maps are not allowed in ${path}`);
}

export async function assertReleaseFilesIsolated({ files, referenceRoot }) {
  const corpus = await referenceFiles(referenceRoot);
  const exactReferenceHashes = new Set(corpus.map(({ bytes }) => `${bytes.length}:${sha256(bytes)}`));
  const embeddedReferenceBytes = corpus
    .filter(({ bytes }) => bytes.length >= 32)
    .map(({ bytes, path }) => ({ bytes, path }));
  let totalBytes = 0;
  const cards = await readFile(join(referenceRoot, "reference", "stats", "cards.json"))
    .then((bytes) => JSON.parse(bytes.toString("utf8")))
    .catch((error) => error?.code === "ENOENT" ? null : Promise.reject(error));
  const identities = (cards?.cards ?? []).flatMap(({ key, name }) => [key, name])
    .filter((value) => typeof value === "string" && value.length > 0);

  for (const [path, bytes] of files) {
    assertPortableReleasePath(path);
    invariant(Buffer.isBuffer(bytes), `release bytes must be a Buffer: ${path}`);
    totalBytes += bytes.length;
    invariant(!exactReferenceHashes.has(`${bytes.length}:${sha256(bytes)}`),
      `reference file bytes are present in release artifact: ${path}`);
    for (const fingerprint of embeddedReferenceBytes) {
      invariant(bytes.indexOf(fingerprint.bytes) === -1,
        `reference bytes from ${portablePath(relative(referenceRoot, fingerprint.path))} are present in ${path}`);
    }
    if (isText(bytes)) {
      const extension = extname(path).toLowerCase();
      const source = bytes.toString("utf8");
      const identitySource = extension === ".json"
        ? `(${JSON.stringify(JSON.parse(source))});`
        : [".js", ".mjs", ".cjs"].includes(extension)
          ? source
          : JSON.stringify(source);
      const hits = protectedIdentityHitsInSource(identitySource, identities);
      invariant(hits.length === 0,
        `protected benchmark identity in ${path}: ${hits.join(", ")}`);
    }
  }
  return Object.freeze({
    fileCount: files.size,
    referenceFileCount: corpus.length,
    totalBytes,
  });
}

export async function auditReleaseArtifact({ artifactRoot, referenceRoot }) {
  const manifestPath = join(artifactRoot, "release-manifest.json");
  const manifestBytes = await readFile(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  invariant(manifest?.schemaVersion === 1 && Array.isArray(manifest.files),
    "unsupported release manifest");
  const declaredPaths = manifest.files.map(({ path }) => path);
  invariant(declaredPaths.length === manifest.fileCount &&
    declaredPaths.join("\0") === [...declaredPaths].sort().join("\0"),
  "release manifest file list is not canonical");
  const files = new Map();
  for (const entry of manifest.files) {
    assertPortableReleasePath(entry.path);
    const path = join(artifactRoot, ...entry.path.split("/"));
    const info = await lstat(path);
    invariant(info.isFile() && !info.isSymbolicLink(), `manifest path is not a regular file: ${entry.path}`);
    const bytes = await readFile(path);
    invariant(entry.size === bytes.length && entry.sha256 === sha256(bytes),
      `release manifest does not match artifact bytes: ${entry.path}`);
    files.set(entry.path, bytes);
  }
  const actual = [];
  async function visit(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const info = await lstat(path);
      invariant(!info.isSymbolicLink(), `symbolic link in release artifact: ${relativePath}`);
      if (relativePath === "release-manifest.json") {
        invariant(info.isFile(), "release manifest must be a regular file");
      } else if (info.isDirectory()) await visit(path, relativePath);
      else if (info.isFile()) actual.push(relativePath);
      else invariant(false, `unsupported entry in release artifact: ${relativePath}`);
    }
  }
  await visit(artifactRoot);
  actual.sort();
  invariant(actual.join("\0") === [...declaredPaths].sort().join("\0"),
    "release artifact files differ from its manifest");
  const audit = await assertReleaseFilesIsolated({ files, referenceRoot });
  await assertReleaseFilesIsolated({
    files: new Map([["release-manifest.json", manifestBytes]]),
    referenceRoot,
  });
  invariant(audit.totalBytes === manifest.totalBytes, "release manifest total byte count is incorrect");
  return Object.freeze({
    fileCount: manifest.fileCount,
    totalBytes: manifest.totalBytes,
    manifestSha256: sha256(manifestBytes),
    referenceFileCount: audit.referenceFileCount,
  });
}
