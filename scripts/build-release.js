#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build as viteBuild } from "vite";
import { assertReleaseFilesIsolated } from "./release-isolation-guard.js";
import { qualifyBrowserArtifact } from "./release-browser-qualification.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const DEFAULT_CONFIG = join(WORKSPACE_ROOT, "scripts", "release-build.config.json");
const DEFAULT_OUTPUT = join(WORKSPACE_ROOT, "dist");
const MANIFEST_NAME = "release-manifest.json";
const BUNDLER_MANIFEST_PATH = ".vite/manifest.json";
const PROTECTED_SEGMENTS = new Set([
  ".agents", ".codex", ".git", "artifacts", "reference", "tests",
]);
const PROTECTED_CONTENT_SEGMENTS = new Set([...PROTECTED_SEGMENTS, "dist"]);

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function portablePath(path) {
  return path.split(sep).join("/");
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function assertPortablePath(path, label, { source = false } = {}) {
  invariant(typeof path === "string" && path.length > 0 && !path.startsWith("/") &&
    !path.includes("\\") && !path.includes("\0"), `invalid ${label}: ${String(path)}`);
  const parts = path.split("/");
  invariant(parts.every((part) => part && part !== "." && part !== ".."),
    `non-canonical ${label}: ${path}`);
  const protectedSegments = source ? PROTECTED_CONTENT_SEGMENTS : PROTECTED_SEGMENTS;
  invariant(!parts.some((part) => protectedSegments.has(part.toLowerCase())),
    `protected ${label}: ${path}`);
  invariant(extname(path).toLowerCase() !== ".map", `source maps are not allowed in ${label}: ${path}`);
  if (source) invariant(!parts.some((part) => part.toLowerCase() === "node_modules"),
    `node_modules source is not allowed in release graph: ${path}`);
}

async function nearestExistingRealpath(path) {
  let cursor = resolve(path);
  for (;;) {
    try {
      return { real: await realpath(cursor), suffix: relative(cursor, path) };
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const parent = dirname(cursor);
      invariant(parent !== cursor, `cannot resolve output ancestor: ${path}`);
      cursor = parent;
    }
  }
}

async function validateOutput(root, output) {
  const absolute = resolve(output);
  const rootReal = await realpath(root);
  const { real: ancestorReal, suffix } = await nearestExistingRealpath(absolute);
  const outputReal = resolve(ancestorReal, suffix);
  const filesystemRoot = resolve(absolute, sep);
  invariant(absolute !== filesystemRoot, "refusing filesystem root as release output");
  invariant(outputReal !== await realpath(homedir()), "refusing home directory as release output");
  invariant(outputReal !== await realpath(tmpdir()), "refusing temporary directory root as release output");
  invariant(absolute !== rootReal, "refusing workspace root as release output");
  invariant(!isWithin(absolute, rootReal), "refusing an output that contains the workspace");

  if (isWithin(rootReal, outputReal)) {
    const segments = relative(rootReal, outputReal).split(sep).filter(Boolean);
    const isDefaultDist = outputReal === resolve(rootReal, "dist");
    invariant(isDefaultDist || !segments.some((segment) =>
      [...PROTECTED_SEGMENTS, "dist"].includes(segment.toLowerCase())),
      "refusing protected repository path as release output");
  } else {
    const parent = dirname(outputReal);
    const parentStat = await stat(parent);
    invariant(parentStat.isDirectory(), "release output parent must be a directory");
    invariant(outputReal !== parent, "release output must be a named child directory");
  }

  try {
    const outputStat = await lstat(absolute);
    invariant(!outputStat.isSymbolicLink(), "release output must not be a symbolic link");
    invariant(outputStat.isDirectory(), "existing release output must be a directory");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return absolute;
}

function uniquePaths(value, label) {
  invariant(Array.isArray(value) && value.length > 0, `${label} are required`);
  const seen = new Set();
  for (const path of value) {
    assertPortablePath(path, label, { source: true });
    invariant(!seen.has(path), `duplicate ${label}: ${path}`);
    seen.add(path);
  }
  return [...value];
}

async function loadConfig(configPath) {
  const configStat = await lstat(configPath);
  invariant(configStat.isFile() && !configStat.isSymbolicLink(),
    "release build config must be a regular file");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  invariant(config?.schemaVersion === 1, "unsupported release build config schema");
  const entries = uniquePaths(config.entries, "release input entries");
  const qualificationProfile = config.qualificationProfile ?? "generic";
  invariant(["generic", "game"].includes(qualificationProfile),
    "release qualification profile must be generic or game");
  invariant(Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0,
    "allowed extensions are required");
  for (const key of ["maxFiles", "maxFileBytes", "maxTotalBytes"]) {
    invariant(Number.isSafeInteger(config.limits?.[key]) && config.limits[key] > 0,
      `invalid release limit: ${key}`);
  }
  for (const entry of entries) {
    invariant(config.allowedExtensions.includes(extname(entry).toLowerCase()),
      `unsupported release entry type: ${entry}`);
  }

  const htmlEntries = entries.filter((entry) => extname(entry).toLowerCase() === ".html");
  const browserEntrypoints = config.browserEntrypoints === undefined
    ? htmlEntries.slice(0, 1)
    : uniquePaths(config.browserEntrypoints, "browser entrypoints");
  invariant(browserEntrypoints.length > 0 && browserEntrypoints.every((entry) =>
    htmlEntries.includes(entry)), "browser entrypoints must be explicit HTML build entries");

  const moduleEntrypoints = config.moduleEntrypoints === undefined
    ? entries.filter((entry) => extname(entry).toLowerCase() === ".js")
    : config.moduleEntrypoints;
  invariant(Array.isArray(moduleEntrypoints), "standalone module entrypoints must be an array");
  invariant(new Set(moduleEntrypoints).size === moduleEntrypoints.length,
    "duplicate standalone module entrypoint");
  for (const path of moduleEntrypoints)
    assertPortablePath(path, "standalone module entrypoints", { source: true });
  invariant(moduleEntrypoints.every((entry) => entries.includes(entry) &&
    extname(entry).toLowerCase() === ".js"),
  "standalone module entrypoints must be explicit JavaScript build entries");

  const staticAssetRoots = config.staticAssetRoots ?? [];
  invariant(Array.isArray(staticAssetRoots), "static asset roots must be an array");
  const validatedStaticAssetRoots = staticAssetRoots.length === 0
    ? []
    : uniquePaths(staticAssetRoots, "static asset roots");
  const outputNames = config.outputNames ?? {};
  invariant(outputNames !== null && typeof outputNames === "object" && !Array.isArray(outputNames),
    "outputNames must be a mapping");
  for (const [chunkName, outputPath] of Object.entries(outputNames)) {
    invariant(chunkName.length > 0, "output name keys must be nonempty");
    assertPortablePath(outputPath, "release output name");
    invariant(config.allowedExtensions.includes(extname(outputPath).toLowerCase()),
      `unsupported release output type: ${outputPath}`);
  }

  return {
    ...config,
    entries,
    qualificationProfile,
    browserEntrypoints,
    moduleEntrypoints,
    staticAssetRoots: validatedStaticAssetRoots,
    outputNames,
  };
}

const RELEASE_CSP = "default-src 'none'; base-uri 'self'; connect-src 'self'; " +
  "font-src 'self' data:; form-action 'none'; frame-src 'self'; img-src 'self' data:; " +
  "media-src 'self'; object-src 'none'; script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; worker-src 'self'";

const MODULEPRELOAD_POLYFILL_IMPORT = "vite/modulepreload-polyfill";
const VITE_PRELOAD_HELPER_IMPORT = "\0vite/preload-helper.js";

function isLocalModuleSpecifier(source) {
  return source === "." || source === ".." || source.startsWith("./") ||
    source.startsWith("../") || (source.startsWith("/") && !source.startsWith("//")) ||
    /^[a-z]:[\\/]/iu.test(source);
}

function moduleSpecifierValue(source) {
  return source?.type === "TemplateLiteral" && source.expressions?.length === 0
    ? source.quasis?.[0]?.value?.cooked
    : source?.value;
}

function inlineModuleScripts(html) {
  const lowerHtml = html.toLowerCase();
  const scripts = [];
  let cursor = 0;
  while (cursor < html.length) {
    const scriptStart = lowerHtml.indexOf("<script", cursor);
    const commentStart = lowerHtml.indexOf("<!--", cursor);
    if (commentStart !== -1 && (scriptStart === -1 || commentStart < scriptStart)) {
      const commentEnd = lowerHtml.indexOf("-->", commentStart + 4);
      if (commentEnd === -1) break;
      cursor = commentEnd + 3;
      continue;
    }
    if (scriptStart === -1) break;
    const tagBoundary = lowerHtml[scriptStart + 7];
    if (tagBoundary && !/[\s/>]/u.test(tagBoundary)) {
      cursor = scriptStart + 7;
      continue;
    }

    let quote = "";
    let openingEnd = scriptStart + 7;
    for (; openingEnd < html.length; openingEnd += 1) {
      const character = html[openingEnd];
      if (quote) {
        if (character === quote) quote = "";
      } else if (character === "\"" || character === "'") quote = character;
      else if (character === ">") break;
    }
    if (openingEnd >= html.length) break;
    const attributes = html.slice(scriptStart + 7, openingEnd);
    const typeAttribute = attributes.match(/(?:^|\s)type\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/iu);
    const type = (typeAttribute?.[1] ?? typeAttribute?.[2] ?? typeAttribute?.[3] ?? "").toLowerCase();
    const closingStart = lowerHtml.indexOf("</script", openingEnd + 1);
    if (closingStart === -1) break;
    const closingEnd = lowerHtml.indexOf(">", closingStart + 8);
    if (closingEnd === -1) break;
    if (type === "module") scripts.push(html.slice(openingEnd + 1, closingStart));
    cursor = closingEnd + 1;
  }
  return scripts;
}

function moduleImportSpecifiers(ast) {
  const specifiers = [];
  const nodes = [ast];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (Array.isArray(node)) {
      nodes.push(...node);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    if (["ImportDeclaration", "ImportExpression", "ExportNamedDeclaration",
      "ExportAllDeclaration"].includes(node.type)) {
      const value = moduleSpecifierValue(node.source);
      if (typeof value === "string") specifiers.push(value);
    }
    for (const child of Object.values(node))
      if (child && typeof child === "object") nodes.push(child);
  }
  return specifiers;
}

function hasLocalDynamicImport(ast) {
  const nodes = [ast];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (Array.isArray(node)) {
      nodes.push(...node);
      continue;
    }
    if (!node || typeof node !== "object") continue;
    if (node.type === "ImportExpression") {
      const source = moduleSpecifierValue(node.source);
      if (typeof source === "string" && isLocalModuleSpecifier(source)) return true;
    }
    for (const child of Object.values(node))
      if (child && typeof child === "object") nodes.push(child);
  }
  return false;
}

function releasePolicyPlugin() {
  return {
    name: "moss-and-ember-release-policy",
    transformIndexHtml(html) {
      invariant(!/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy\b/i.test(html),
        "release HTML may not supply its own content security policy");
      return [
        {
          tag: "meta",
          attrs: { "http-equiv": "Content-Security-Policy", content: RELEASE_CSP },
          injectTo: "head-prepend",
        },
        { tag: "link", attrs: { rel: "icon", href: "data:," }, injectTo: "head" },
      ];
    },
  };
}

function releaseDependencyPolicyPlugin(root) {
  const generatedPreloadHelperImporters = new Set();
  return {
    enforce: "pre",
    name: "moss-and-ember-release-dependency-policy",
    transform(code, id) {
      const sourcePath = id.split(/[?#]/u, 1)[0];
      if (sourcePath.startsWith("\0") || !isAbsolute(sourcePath)) return null;
      if (!isWithin(root, resolve(sourcePath))) return null;
      const extension = extname(sourcePath).toLowerCase();
      let moduleCodes;
      if (extension === ".html") {
        moduleCodes = inlineModuleScripts(code);
      } else if ([".js", ".mjs", ".cjs", ".jsx", ".ts", ".tsx"].includes(extension)) {
        moduleCodes = [code];
      } else {
        return null;
      }

      for (const moduleCode of moduleCodes) {
        let ast;
        try {
          ast = this.parse(moduleCode);
        } catch {
          continue;
        }
        const specifiers = moduleImportSpecifiers(ast);
        if (extension === ".html") {
          invariant(!specifiers.includes(MODULEPRELOAD_POLYFILL_IMPORT),
            "release HTML may not import Vite's internal modulepreload polyfill");
        }
        invariant(!specifiers.includes(VITE_PRELOAD_HELPER_IMPORT),
          "authored release modules may not import Vite's internal preload helper");
        if (hasLocalDynamicImport(ast)) generatedPreloadHelperImporters.add(resolve(sourcePath));
      }
      return null;
    },
    async resolveId(source, importer) {
      // Vite adds this virtual import while transforming authored dynamic imports.
      // Verify the original in-workspace source so an authored import of the same
      // virtual ID cannot borrow the bundler's exception.
      if (source === VITE_PRELOAD_HELPER_IMPORT) {
        const importerPath = typeof importer === "string" && !importer.startsWith("\0")
          ? importer.split(/[?#]/u, 1)[0]
          : "";
        const absoluteImporter = isAbsolute(importerPath) ? resolve(importerPath) : "";
        invariant(isWithin(root, absoluteImporter) &&
          generatedPreloadHelperImporters.has(absoluteImporter),
          `bare dependency is not allowed: ${source}`);
        return null;
      }

      // Vite's synthetic importers are generated by the bundler, not source files.
      // Root-authored imports still arrive with their absolute source-file importer.
      if (!importer || importer.startsWith("\0") || importer.startsWith("vite:")) return null;
      const importerPath = importer.split(/[?#]/u, 1)[0];
      if (importerPath.startsWith("\0") || !isAbsolute(importerPath)) return null;
      const absoluteImporter = resolve(importerPath);
      if (!isWithin(root, absoluteImporter)) return null;
      // Vite adds this import to HTML entries after their authored inline code is checked.
      if (source === MODULEPRELOAD_POLYFILL_IMPORT &&
          extname(importerPath).toLowerCase() === ".html") return null;

      const localSpecifier = isLocalModuleSpecifier(source);
      invariant(localSpecifier, `bare dependency is not allowed: ${source}`);
      const resolved = await this.resolve(source, importer, { skipSelf: true });
      if (!resolved) return null;
      invariant(!resolved.external, `external release module is not allowed: ${source}`);
      const resolvedId = resolved.id.split(/[?#]/u, 1)[0];
      invariant(!resolvedId.startsWith("\0") && isAbsolute(resolvedId),
        `release module must resolve to an in-workspace file: ${source}`);
      const resolvedRealPath = await realpath(resolvedId);
      invariant(isWithin(root, resolvedRealPath) && resolvedRealPath !== root,
        `release source import escapes workspace: ${source}`);
      const resolvedSource = portablePath(relative(root, resolvedRealPath));
      assertPortablePath(resolvedSource, "resolved source import", { source: true });
      return null;
    },
  };
}

async function assertRegularTree(root, relativePath, { maxDepth = 64 } = {}) {
  const files = [];
  async function visit(absolute, rel, depth) {
    invariant(depth <= maxDepth, `static asset tree is too deep: ${relativePath}`);
    const entries = await readdir(absolute, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const childPath = join(absolute, entry.name);
      const childRelative = `${rel}/${entry.name}`;
      const info = await lstat(childPath);
      invariant(!info.isSymbolicLink(), `symbolic link in release static assets: ${childRelative}`);
      if (info.isDirectory()) await visit(childPath, childRelative, depth + 1);
      else if (info.isFile()) files.push({ absolute: childPath, path: portablePath(childRelative) });
      else invariant(false, `unsupported release static asset: ${childRelative}`);
    }
  }
  const absolute = resolve(root, relativePath);
  invariant(isWithin(root, absolute) && absolute !== root,
    `static asset root escapes workspace: ${relativePath}`);
  const info = await lstat(absolute).catch((error) => {
    if (error?.code === "ENOENT") throw new Error(`missing release static asset root: ${relativePath}`);
    throw error;
  });
  invariant(info.isDirectory() && !info.isSymbolicLink(),
    `release static asset root must be a real directory: ${relativePath}`);
  await visit(absolute, relativePath, 0);
  return files;
}

async function copyStaticAssets(root, config, outDir) {
  const result = new Map();
  for (const staticRoot of config.staticAssetRoots) {
    const sources = await assertRegularTree(root, staticRoot);
    for (const source of sources) {
      assertPortablePath(source.path, "release static asset", { source: true });
      const extension = extname(source.path).toLowerCase();
      invariant(config.allowedExtensions.includes(extension),
        `unsupported release static asset type: ${source.path}`);
      const bytes = await readFile(source.absolute);
      const target = join(outDir, ...source.path.split("/"));
      await mkdir(dirname(target), { recursive: true });
      try {
        await writeFile(target, bytes, { flag: "wx" });
      } catch (error) {
        if (error?.code !== "EEXIST") throw error;
        const existing = await readFile(target);
        invariant(existing.equals(bytes), `bundler output conflicts with static asset: ${source.path}`);
      }
      result.set(source.path, bytes);
    }
  }
  return result;
}

function releaseAssetFileNames(root, staticAssetRoots) {
  // Keep imported static-root assets beside their copied originals; other assets stay hashed.
  const absoluteRoot = resolve(root);
  const absoluteStaticRoots = staticAssetRoots.map((staticRoot) => {
    assertPortablePath(staticRoot, "release static asset root", { source: true });
    return resolve(absoluteRoot, ...staticRoot.split("/"));
  });
  const assignedCaseFoldedPaths = new Map();
  const hashedAssetPattern = "assets/[hash][extname]";

  return ({ name, originalFileNames }) => {
    invariant(Array.isArray(originalFileNames), "Vite asset provenance must be an array");
    if (originalFileNames.length === 0) return hashedAssetPattern;

    const sources = originalFileNames.map((sourceName) => {
      invariant(typeof sourceName === "string" && sourceName.length > 0,
        "Vite asset provenance contains an invalid source path");
      const parts = sourceName.split(/[\\/]/u);
      if (!isAbsolute(sourceName)) {
        while (parts[0] === ".") parts.shift();
      }
      invariant(parts.length > 0 && !parts.some((part) => part === "." || part === ".."),
        `non-canonical release asset source path: ${sourceName}`);

      const absoluteSource = isAbsolute(sourceName)
        ? resolve(sourceName)
        : resolve(absoluteRoot, sourceName);
      invariant(isWithin(absoluteRoot, absoluteSource) && absoluteSource !== absoluteRoot,
        `release asset source is outside workspace: ${sourceName}`);
      const path = portablePath(relative(absoluteRoot, absoluteSource));
      assertPortablePath(path, "release asset source");
      invariant(!path.split("/").some((part) => part.toLowerCase() === "dist"),
        `protected release asset source: ${path}`);
      const isStatic = absoluteStaticRoots.some((staticRoot) =>
        absoluteSource !== staticRoot && isWithin(staticRoot, absoluteSource));
      return { isStatic, path };
    });

    const staticSources = sources.filter(({ isStatic }) => isStatic);
    if (staticSources.length === 0) {
      // Grouped chunk names can contain slashes. Keep generated assets flat so Vite's
      // pre-emission CSS path calculation matches the emitted asset directory.
      const candidate = typeof name === "string" && name.length > 0
        ? name
        : sources[0].path;
      const assetName = candidate.split(/[\\/]/u).at(-1);
      const extension = extname(assetName);
      const stem = extension ? assetName.slice(0, -extension.length) : assetName;
      return `assets/${stem || "asset"}-[hash]${extension || "[extname]"}`;
    }
    invariant(staticSources.length === sources.length,
      `ambiguous release asset provenance mixes static and non-static sources: ${originalFileNames.join(", ")}`);
    const canonicalPath = staticSources[0].path;
    invariant(staticSources.every(({ path }) => path === canonicalPath),
      `ambiguous release asset provenance maps to multiple static paths: ${originalFileNames.join(", ")}`);

    const caseFoldedPath = canonicalPath.toLowerCase();
    const caseCollision = assignedCaseFoldedPaths.get(caseFoldedPath);
    invariant(caseCollision === undefined || caseCollision === canonicalPath,
      `case-colliding release static asset output: ${caseCollision} and ${canonicalPath}`);
    assignedCaseFoldedPaths.set(caseFoldedPath, canonicalPath);
    return canonicalPath;
  };
}

function normalizedGraph(rawGraph, config) {
  invariant(rawGraph !== null && typeof rawGraph === "object" && !Array.isArray(rawGraph),
    "Vite did not produce a module manifest");
  const graph = {};
  const keys = Object.keys(rawGraph).sort();
  for (const key of keys) {
    assertPortablePath(key, "bundler graph source", { source: true });
    const entry = rawGraph[key];
    invariant(entry !== null && typeof entry === "object" && typeof entry.file === "string",
      `invalid Vite graph node: ${key}`);
    assertPortablePath(entry.file, "bundler graph output");
    for (const output of [...(entry.css ?? []), ...(entry.assets ?? [])])
      assertPortablePath(output, "bundler graph asset");
    const normalized = { file: entry.file };
    if (entry.src !== undefined) normalized.src = entry.src;
    if (entry.name !== undefined) normalized.name = entry.name;
    if (entry.isEntry === true) normalized.isEntry = true;
    if (entry.isDynamicEntry === true) normalized.isDynamicEntry = true;
    for (const field of ["imports", "dynamicImports", "css", "assets"]) {
      if (entry[field] !== undefined) {
        invariant(Array.isArray(entry[field]), `invalid Vite graph ${field}: ${key}`);
        normalized[field] = [...new Set(entry[field])].sort();
      }
    }
    if ((entry.src ?? key) !== key && key.endsWith(".html")) {
      throw new Error(`Vite HTML graph key does not match its source: ${key}`);
    }
    graph[key] = normalized;
  }
  for (const source of config.entries) {
    const node = graph[source];
    invariant(node?.isEntry === true, `Vite omitted explicit release entry: ${source}`);
    invariant(!source.toLowerCase().includes("/tests/") && !source.startsWith("tests/"),
      `test entry cannot be shipped: ${source}`);
  }
  for (const node of Object.values(graph)) {
    for (const imported of [...(node.imports ?? []), ...(node.dynamicImports ?? [])]) {
      invariant(Object.hasOwn(graph, imported), `unresolved Vite graph import: ${imported}`);
    }
  }
  return graph;
}

async function toolchainVersion() {
  const packageJson = JSON.parse(await readFile(join(WORKSPACE_ROOT, "package.json"), "utf8"));
  const version = packageJson.devDependencies?.vite;
  invariant(typeof version === "string" && /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version),
    "Vite must be pinned as an exact build-only devDependency");
  return version;
}

async function buildViteGraph(root, config, outDir) {
  const input = Object.fromEntries(config.entries.map((path) => [
    path.slice(0, -extname(path).length), resolve(root, ...path.split("/")),
  ]));
  const viteManifestPath = join(outDir, BUNDLER_MANIFEST_PATH);
  const version = await toolchainVersion();
  await viteBuild({
    configFile: false,
    root,
    base: "./",
    publicDir: false,
    envDir: join(outDir, ".empty-env"),
    mode: "production",
    logLevel: "warn",
    plugins: [releaseDependencyPolicyPlugin(root), releasePolicyPlugin()],
    build: {
      outDir,
      emptyOutDir: true,
      manifest: BUNDLER_MANIFEST_PATH,
      sourcemap: false,
      minify: false,
      cssMinify: true,
      target: "esnext",
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      rolldownOptions: {
        input,
        external: [],
        preserveEntrySignatures: "strict",
        onwarn(warning, defaultHandler) {
          if (warning.code === "UNRESOLVED_IMPORT" || warning.code === "MISSING_EXPORT") {
            throw new Error(`unresolved release module import: ${warning.message}`);
          }
          defaultHandler(warning);
        },
        output: {
          strictExecutionOrder: true,
          entryFileNames: (chunk) => config.outputNames[chunk.name] ??
            `assets/${chunk.name}-[hash].js`,
          chunkFileNames: "assets/[name]-[hash].js",
          assetFileNames: releaseAssetFileNames(root, config.staticAssetRoots),
          codeSplitting: {
            groups: [{
              name: "game-runtime",
              test: (id) => id.startsWith(`${root}${sep}`),
              minSize: 1,
              minModuleSize: 1,
              maxSize: 400_000,
              minShareCount: 1,
              entriesAware: true,
            }],
          },
        },
      },
    },
  });
  let rawGraph;
  try {
    rawGraph = JSON.parse(await readFile(viteManifestPath, "utf8"));
  } catch (error) {
    throw new Error(`Vite build manifest is missing or invalid: ${error.message}`);
  }
  const graph = normalizedGraph(rawGraph, config);
  await rm(join(outDir, ".vite"), { recursive: true, force: true });
  await rm(join(outDir, ".empty-env"), { recursive: true, force: true });
  return { graph, version };
}

async function collectOutputFiles(root, config, graph, outDir) {
  const files = new Map();
  let totalBytes = 0;
  async function visit(directory, prefix = "") {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(directory, entry.name);
      const info = await lstat(absolutePath);
      invariant(!info.isSymbolicLink(), `symbolic link in release output: ${relativePath}`);
      if (info.isDirectory()) {
        await visit(absolutePath, relativePath);
        continue;
      }
      invariant(info.isFile(), `unsupported release output entry: ${relativePath}`);
      assertPortablePath(relativePath, "release output");
      const extension = extname(relativePath).toLowerCase();
      invariant(config.allowedExtensions.includes(extension),
        `unsupported release output file type: ${relativePath}`);
      invariant(info.size <= config.limits.maxFileBytes,
        `release file exceeds byte limit: ${relativePath}`);
      const bytes = await readFile(absolutePath);
      totalBytes += bytes.length;
      invariant(totalBytes <= config.limits.maxTotalBytes, "release graph exceeds total byte limit");
      files.set(portablePath(relativePath), bytes);
    }
  }
  await visit(outDir);
  const staticFiles = await copyStaticAssets(root, config, outDir);
  for (const [path, bytes] of staticFiles) {
    if (files.has(path)) {
      invariant(files.get(path).equals(bytes), `duplicate release output file: ${path}`);
      continue;
    }
    invariant(bytes.length <= config.limits.maxFileBytes,
      `release file exceeds byte limit: ${path}`);
    totalBytes += bytes.length;
    invariant(totalBytes <= config.limits.maxTotalBytes, "release graph exceeds total byte limit");
    files.set(path, bytes);
  }
  invariant(files.size <= config.limits.maxFiles, "release graph exceeds file-count limit");

  const outputPaths = new Set(files.keys());
  for (const node of Object.values(graph)) {
    for (const path of [node.file, ...(node.css ?? []), ...(node.assets ?? [])]) {
      invariant(outputPaths.has(path), `Vite graph output is missing from artifact: ${path}`);
    }
  }
  for (const entry of config.entries) {
    if (extname(entry).toLowerCase() === ".html") {
      invariant(outputPaths.has(entry), `Vite omitted HTML release entry: ${entry}`);
    }
  }
  for (const [path, bytes] of files) {
    if ([".js", ".css"].includes(extname(path).toLowerCase())) {
      invariant(!/[#@]\s*sourceMappingURL\s*=/iu.test(bytes.toString("utf8")),
        `source map directive is not allowed in ${path}`);
    }
  }
  return { files, totalBytes };
}

function canonicalManifest(config, graph, files, totalBytes, version) {
  const listedFiles = [...files.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([path, bytes]) => ({ path, size: bytes.length, sha256: sha256(bytes) }));
  const standaloneModules = config.moduleEntrypoints.map((source) => {
    const node = graph[source];
    invariant(node?.isEntry === true, `standalone module entry was not built: ${source}`);
    return node.file;
  }).sort();
  return `${JSON.stringify({
    schemaVersion: 1,
    entrypoints: [...config.browserEntrypoints].sort(),
    standaloneModules,
    fileCount: listedFiles.length,
    totalBytes,
    files: listedFiles,
    build: {
      bundler: "vite",
      version,
      qualificationProfile: config.qualificationProfile,
      runtimeDependencies: [],
      inputs: [...config.entries].sort(),
      staticAssetRoots: [...config.staticAssetRoots].sort(),
      graph,
    },
  }, null, 2)}\n`;
}

async function publishAtomically(output, files, manifest) {
  const parent = dirname(output);
  const name = output.slice(parent.length + 1);
  const token = `${process.pid}-${Date.now()}`;
  const staging = join(parent, `.${name}.staging-${token}`);
  const backup = join(parent, `.${name}.backup-${token}`);
  await mkdir(staging);
  let oldMoved = false;
  let published = false;
  try {
    for (const [path, bytes] of [...files.entries()].sort(([left], [right]) => left < right ? -1 : 1)) {
      const destination = join(staging, ...path.split("/"));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });
    }
    await writeFile(join(staging, MANIFEST_NAME), manifest, { flag: "wx" });
    try {
      await rename(output, backup);
      oldMoved = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(staging, output);
    published = true;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    if (oldMoved && !published) {
      try {
        await rename(backup, output);
      } catch (restoreError) {
        error.message += `; failed to restore prior artifact: ${restoreError.message}`;
      }
    }
    throw error;
  }
  if (oldMoved) await rm(backup, { recursive: true, force: true });
}

export async function buildRelease({
  root = WORKSPACE_ROOT,
  output = DEFAULT_OUTPUT,
  configPath = DEFAULT_CONFIG,
} = {}) {
  const rootReal = await realpath(resolve(root));
  const safeOutput = await validateOutput(rootReal, output);
  const config = await loadConfig(resolve(configPath));
  for (const source of config.entries) {
    const absolute = resolve(rootReal, ...source.split("/"));
    invariant(isWithin(rootReal, absolute) && absolute !== rootReal,
      `release entry escapes workspace: ${source}`);
    const info = await lstat(absolute).catch((error) => {
      if (error?.code === "ENOENT") throw new Error(`missing release entry: ${source}`);
      throw error;
    });
    invariant(info.isFile() && !info.isSymbolicLink(), `release entry must be a regular file: ${source}`);
    invariant(config.allowedExtensions.includes(extname(source).toLowerCase()),
      `unsupported release entry type: ${source}`);
  }

  const scratch = await mkdtemp(join(dirname(safeOutput), `.${safeOutput.split(sep).at(-1)}.vite-`));
  const viteOutput = join(scratch, "bundle");
  try {
    const { graph, version } = await buildViteGraph(rootReal, config, viteOutput);
    const { files, totalBytes } = await collectOutputFiles(rootReal, config, graph, viteOutput);
    await assertReleaseFilesIsolated({ files, referenceRoot: rootReal });
    const manifest = canonicalManifest(config, graph, files, totalBytes, version);
    await assertReleaseFilesIsolated({
      files: new Map([[MANIFEST_NAME, Buffer.from(manifest)]]),
      referenceRoot: rootReal,
    });
    const temporaryManifest = join(viteOutput, MANIFEST_NAME);
    let browserQualification;
    await writeFile(temporaryManifest, manifest, { flag: "wx" });
    try {
      browserQualification = await qualifyBrowserArtifact({
        root: viteOutput,
        manifestPath: MANIFEST_NAME,
        serverMode: "release",
        prefix: "",
        mountedPath: "",
        browserEntrypoints: config.browserEntrypoints,
        moduleEntrypoints: JSON.parse(manifest).standaloneModules,
        flow: config.qualificationProfile,
        landingPage: false,
      });
    } finally {
      await rm(temporaryManifest, { force: true });
    }
    await publishAtomically(safeOutput, files, manifest);
    return Object.freeze({
      output: safeOutput,
      fileCount: files.size,
      totalBytes,
      browserQualification,
    });
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

function parseArguments(argv) {
  let output = DEFAULT_OUTPUT;
  for (let index = 0; index < argv.length; index += 1) {
    invariant(argv[index] === "--out", `unknown argument: ${argv[index]}`);
    invariant(index + 1 < argv.length, "--out requires an explicit path");
    output = resolve(argv[index += 1]);
  }
  return { output };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  buildRelease(parseArguments(process.argv.slice(2))).then(
    ({ fileCount, output, totalBytes }) => {
      process.stdout.write(`release artifact: ${output} (${fileCount} files, ${totalBytes} bytes)\n`);
    },
    (error) => {
      process.stderr.write(`release build failed: ${error.message}\n`);
      process.exitCode = 1;
    },
  );
}
