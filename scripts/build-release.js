#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, extname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertReleaseFilesIsolated } from "./release-isolation-guard.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolve(dirname(SCRIPT_PATH), "..");
const DEFAULT_CONFIG = join(WORKSPACE_ROOT, "scripts", "release-build.config.json");
const DEFAULT_OUTPUT = join(WORKSPACE_ROOT, "dist");
const MANIFEST_NAME = "release-manifest.json";
const PROTECTED_SEGMENTS = new Set([".git", ".agents", ".codex", "reference", "tests"]);
const PARSER_LIMITS = Object.freeze({ maxAttributes: 64, maxAstNodes: 100_000, maxTokens: 100_000 });
const ACORN_SOURCE_KEY = "internal/deps/acorn/acorn/dist/acorn";
let platformParser;

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
    invariant(!segments.some((segment) => PROTECTED_SEGMENTS.has(segment)),
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

function parseLocalSpecifier(raw, fromPath, { requireDot = false, allowFragment = false } = {}) {
  invariant(!raw.includes("\\") && !raw.includes("\0"), `invalid dependency in ${fromPath}`);
  invariant(!raw.startsWith("//") && !/^[a-z][a-z+.-]*:/i.test(raw),
    `external dependency is not allowed in ${fromPath}: ${raw}`);
  const clean = raw.split(/[?#]/, 1)[0];
  if (allowFragment && clean.length === 0 && raw.startsWith("#")) return null;
  invariant(clean.length > 0 && !clean.startsWith("/"),
    `dependency must be a relative file in ${fromPath}: ${raw}`);
  invariant(!requireDot || clean.startsWith("./") || clean.startsWith("../"),
    `bare dependency is not allowed in ${fromPath}: ${raw}`);
  try {
    const decoded = decodeURIComponent(clean);
    invariant(!decoded.includes("\\") && !decoded.startsWith("/") &&
      !decoded.startsWith("//") && !/^[a-z][a-z+.-]*:/i.test(decoded),
    `encoded dependency is not a safe local path in ${fromPath}: ${raw}`);
    return decoded;
  } catch {
    throw new Error(`invalid encoded dependency in ${fromPath}: ${raw}`);
  }
}

function resolveBrowserLocal(raw, sourcePath, { baseHref = null, ignoreSameDocumentFragment = false } = {}) {
  invariant(typeof raw === "string" && !raw.includes("\0") && !raw.includes("\\"),
    `invalid browser dependency in ${sourcePath}`);
  if (/^data:/i.test(raw)) return null;
  if (ignoreSameDocumentFragment && raw.startsWith("#")) return null;
  invariant(!/%(?:2f|5c)/i.test(raw), `encoded path separator in ${sourcePath}: ${raw}`);
  const documentUrl = new URL(`https://release.invalid/${sourcePath}`);
  let baseUrl = documentUrl;
  try {
    if (baseHref !== null) baseUrl = new URL(baseHref, documentUrl);
    const resolved = new URL(raw, baseUrl);
    invariant(resolved.origin === documentUrl.origin && resolved.protocol === "https:" &&
      resolved.username === "" && resolved.password === "",
    `external dependency is not allowed in ${sourcePath}: ${raw}`);
    const decoded = decodeURIComponent(resolved.pathname);
    invariant(decoded.startsWith("/") && !decoded.includes("\\"),
      `invalid browser dependency in ${sourcePath}: ${raw}`);
    const workspacePath = posix.normalize(decoded.slice(1));
    invariant(workspacePath !== "" && workspacePath !== "." && !workspacePath.startsWith("../"),
      `browser dependency escapes workspace in ${sourcePath}: ${raw}`);
    return posix.relative(posix.dirname(sourcePath), workspacePath);
  } catch (error) {
    if (error?.message?.includes(sourcePath)) throw error;
    throw new Error(`invalid browser dependency in ${sourcePath}: ${raw}`);
  }
}

function loadPlatformParser() {
  if (platformParser !== undefined) return platformParser;
  const source = process.binding("natives")[ACORN_SOURCE_KEY];
  invariant(typeof source === "string", "Node's platform JavaScript parser is unavailable");
  const module = { exports: {} };
  Function("exports", "module", source)(module.exports, module);
  platformParser = module.exports;
  return platformParser;
}

function javascriptDependencies(source, sourcePath) {
  let hasSourceMapDirective = false;
  const tokenizer = loadPlatformParser().tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: "latest",
    onComment(_block, text) {
      if (/[@#]\s*sourceMappingURL\s*=/.test(text)) hasSourceMapDirective = true;
    },
    sourceType: "module",
  });
  let tokenCount = 0;
  let syntaxDepth = 0;
  for (;;) {
    let token;
    try {
      token = tokenizer.getToken();
    } catch (error) {
      throw new Error(`invalid JavaScript module ${sourcePath}: ${error.message}`);
    }
    if (token.type.label === "eof") break;
    tokenCount += 1;
    invariant(tokenCount <= PARSER_LIMITS.maxTokens, `JavaScript token limit exceeded in ${sourcePath}`);
    if (["(", "[", "{"].includes(token.type.label)) syntaxDepth += 1;
    else if ([")", "]", "}"].includes(token.type.label)) syntaxDepth -= 1;
    invariant(syntaxDepth <= 256, `JavaScript syntax depth exceeded in ${sourcePath}`);
  }
  invariant(!hasSourceMapDirective, `source maps are not allowed in ${sourcePath}`);
  let ast;
  try {
    ast = loadPlatformParser().parse(source, {
      allowHashBang: true,
      ecmaVersion: "latest",
      sourceType: "module",
    });
  } catch (error) {
    throw new Error(`invalid JavaScript module ${sourcePath}: ${error.message}`);
  }
  const dependencies = [];
  const stack = [ast];
  let nodes = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    nodes += 1;
    invariant(nodes <= PARSER_LIMITS.maxAstNodes, `JavaScript AST exceeds node limit in ${sourcePath}`);
    invariant(node.type !== "ImportExpression", `dynamic import is not allowed in ${sourcePath}`);
    if (node.type === "ImportDeclaration" || node.type === "ExportNamedDeclaration" ||
        node.type === "ExportAllDeclaration") {
      if (node.source !== null && node.source !== undefined) {
        invariant(typeof node.source.value === "string", `non-string module dependency in ${sourcePath}`);
        const dependency = parseLocalSpecifier(node.source.value, sourcePath, { requireDot: true });
        const isJson = dependency.split(/[?#]/, 1)[0].toLowerCase().endsWith(".json");
        const attributes = node.attributes ?? [];
        if (isJson) {
          invariant(attributes.length === 1 &&
            (attributes[0].key?.name ?? attributes[0].key?.value) === "type" &&
            attributes[0].value?.value === "json",
          `JSON import requires exactly { type: "json" } in ${sourcePath}`);
        } else {
          invariant(attributes.length === 0, `import attributes are only allowed for JSON in ${sourcePath}`);
        }
        dependencies.push(dependency);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "start" || key === "end" || key === "loc") continue;
      if (Array.isArray(value)) stack.push(...value);
      else if (value && typeof value === "object") stack.push(value);
    }
  }
  return dependencies;
}

function decodeHtmlEntities(value, sourcePath) {
  const named = { amp: "&", apos: "'", gt: ">", lt: "<", quot: '"' };
  return value.replace(/&(#(?:x[0-9a-f]+|[0-9]+)|[a-z][a-z0-9]+);/gi, (whole, entity) => {
    if (entity[0] === "#") {
      const hex = entity[1].toLowerCase() === "x";
      const point = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      invariant(Number.isSafeInteger(point) && point > 0 && point <= 0x10ffff,
        `invalid HTML entity in ${sourcePath}`);
      return String.fromCodePoint(point);
    }
    invariant(Object.hasOwn(named, entity.toLowerCase()), `unsupported HTML entity in ${sourcePath}: &${entity};`);
    return named[entity.toLowerCase()];
  });
}

const RELEASE_CSP = "default-src 'none'; base-uri 'self'; connect-src 'self'; " +
  "font-src 'self' data:; form-action 'none'; frame-src 'self'; img-src 'self' data:; " +
  "media-src 'self'; object-src 'none'; script-src 'self'; " +
  "style-src 'self' 'unsafe-inline'; worker-src 'none'";

function enforceReleasePolicy(source, sourcePath) {
  const hasIcon = /<link\b[^>]*\brel\s*=\s*(?:"[^"]*\bicon\b[^"]*"|'[^']*\bicon\b[^']*'|[^\s>]*\bicon\b)/i.test(source);
  const meta = `<meta http-equiv="Content-Security-Policy" content="${RELEASE_CSP}">` +
    (hasIcon ? "" : '<link rel="icon" href="data:,">');
  const head = /<head\b[^>]*>/i.exec(source);
  const html = /<html\b[^>]*>/i.exec(source);
  const doctype = /<!doctype\b[^>]*>/i.exec(source);
  const insertion = head
    ? head.index + head[0].length
    : html
      ? html.index + html[0].length
      : doctype
        ? doctype.index + doctype[0].length
        : 0;
  invariant(!/<meta\b[^>]*\bhttp-equiv\s*=\s*["']?content-security-policy\b/i.test(source),
  `release HTML may not supply its own content security policy: ${sourcePath}`);
  return `${source.slice(0, insertion)}\n    ${meta}${source.slice(insertion)}`;
}

function parseHtmlTags(source, sourcePath) {
  const tags = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      invariant(end >= 0, `unterminated HTML comment in ${sourcePath}`);
      cursor = end + 3;
      continue;
    }
    if (source[start + 1] === "!" || source[start + 1] === "?" || source[start + 1] === "/") {
      const end = source.indexOf(">", start + 2);
      invariant(end >= 0, `unterminated HTML declaration in ${sourcePath}`);
      cursor = end + 1;
      continue;
    }
    let index = start + 1;
    while (/\s/.test(source[index] ?? "")) index += 1;
    const nameStart = index;
    while (/[A-Za-z0-9:-]/.test(source[index] ?? "")) index += 1;
    if (index === nameStart) { cursor = start + 1; continue; }
    const name = source.slice(nameStart, index).toLowerCase();
    const attributes = new Map();
    let closed = false;
    while (index < source.length) {
      while (/\s/.test(source[index] ?? "")) index += 1;
      if (source[index] === ">" || (source[index] === "/" && source[index + 1] === ">")) {
        index += source[index] === "/" ? 2 : 1;
        closed = true;
        break;
      }
      const attributeStart = index;
      while (/[^\s=/>]/.test(source[index] ?? "")) index += 1;
      invariant(index > attributeStart, `malformed HTML tag in ${sourcePath}`);
      const attribute = source.slice(attributeStart, index).toLowerCase();
      invariant(!attributes.has(attribute), `duplicate HTML attribute ${attribute} in ${sourcePath}`);
      while (/\s/.test(source[index] ?? "")) index += 1;
      let value = "";
      if (source[index] === "=") {
        index += 1;
        while (/\s/.test(source[index] ?? "")) index += 1;
        const quote = source[index];
        if (quote === '"' || quote === "'") {
          const valueStart = ++index;
          while (index < source.length && source[index] !== quote) index += 1;
          invariant(index < source.length, `unterminated HTML attribute in ${sourcePath}`);
          value = source.slice(valueStart, index);
          index += 1;
        } else {
          const valueStart = index;
          while (/[^\s>]/.test(source[index] ?? "")) index += 1;
          invariant(index > valueStart, `empty HTML attribute in ${sourcePath}`);
          value = source.slice(valueStart, index);
        }
      }
      attributes.set(attribute, decodeHtmlEntities(value, sourcePath));
      invariant(attributes.size <= PARSER_LIMITS.maxAttributes, `HTML attribute limit exceeded in ${sourcePath}`);
    }
    invariant(closed, `unterminated HTML tag in ${sourcePath}`);
    const selfClosing = source[index - 2] === "/";
    const tag = { name, attributes, content: null, selfClosing };
    tags.push(tag);
    invariant(tags.length <= PARSER_LIMITS.maxTokens, `HTML tag limit exceeded in ${sourcePath}`);
    if ((name === "script" || name === "style") && !selfClosing) {
      const close = source.toLowerCase().indexOf(`</${name}`, index);
      invariant(close >= 0, `unterminated ${name} element in ${sourcePath}`);
      tag.content = source.slice(index, close);
      if (name === "script" && !attributes.has("src"))
        invariant(tag.content.trim() === "", `inline script is unsupported in ${sourcePath}`);
      cursor = close;
    } else cursor = index;
  }
  return tags;
}

function htmlDependencies(source, sourcePath) {
  const tags = parseHtmlTags(source, sourcePath);
  let base = null;
  const resources = [];
  const dependencies = [];
  const add = (tag, attribute) => {
    invariant(tag.attributes.has(attribute), `${attribute} is required on release ${tag.name} in ${sourcePath}`);
    resources.push(tag.attributes.get(attribute));
  };
  const addSrcset = (value) => resources.push(...parseSrcset(value, sourcePath));
  for (const tag of tags) {
    if (tag.name === "base") {
      invariant(base === null, `multiple HTML base elements in ${sourcePath}`);
      add(tag, "href");
      base = resources.pop();
    }
  }
  if (base !== null) resolveBrowserLocal("__release_base_probe__", sourcePath, { baseHref: base });
  for (const tag of tags) {
    if (tag.attributes.has("style")) dependencies.push(...cssDependencies(
      tag.attributes.get("style"), sourcePath, { baseHref: base },
    ));
    if (tag.name === "style") dependencies.push(...cssDependencies(
      tag.content ?? "", sourcePath, { baseHref: base },
    ));
    if (tag.name === "base") continue;
    if (tag.name === "script") add(tag, "src");
    else if (tag.name === "link") {
      const rel = (tag.attributes.get("rel") ?? "").toLowerCase().split(/\s+/);
      if (tag.attributes.has("imagesrcset")) addSrcset(tag.attributes.get("imagesrcset"));
      if (rel.includes("preload")) {
        invariant(tag.attributes.has("href") || tag.attributes.has("imagesrcset"),
          `href or imagesrcset is required on release link in ${sourcePath}`);
        if (tag.attributes.has("href")) resources.push(tag.attributes.get("href"));
      } else if (rel.some((value) => ["stylesheet", "modulepreload", "icon", "manifest"].includes(value))) add(tag, "href");
    } else if (["img", "source", "audio", "video", "track", "embed", "iframe"].includes(tag.name)) {
      if (tag.name === "img") invariant(tag.attributes.has("src") || tag.attributes.has("srcset"),
        `src or srcset is required on release img in ${sourcePath}`);
      if (tag.attributes.has("src")) resources.push(tag.attributes.get("src"));
      if (tag.attributes.has("srcset")) addSrcset(tag.attributes.get("srcset"));
      if (tag.name === "video" && tag.attributes.has("poster")) resources.push(tag.attributes.get("poster"));
    } else if (tag.name === "object" && tag.attributes.has("data")) resources.push(tag.attributes.get("data"));
  }
  dependencies.push(...resources.map((resource) =>
    resolveBrowserLocal(resource, sourcePath, { baseHref: base }))
    .filter((resource) => resource !== null));
  return dependencies;
}

function parseSrcset(value, sourcePath) {
  const urls = [];
  let cursor = 0;
  let candidates = 0;
  while (cursor < value.length) {
    while (/[\s,]/.test(value[cursor] ?? "")) cursor += 1;
    if (cursor >= value.length) break;
    const urlStart = cursor;
    while (cursor < value.length && !/\s/.test(value[cursor])) cursor += 1;
    let url = value.slice(urlStart, cursor);
    let trailingCommas = 0;
    while (url.endsWith(",")) { url = url.slice(0, -1); trailingCommas += 1; }
    invariant(url.length > 0, `invalid srcset in ${sourcePath}`);
    let descriptor = "";
    if (trailingCommas === 0) {
      while (/\s/.test(value[cursor] ?? "")) cursor += 1;
      const descriptorStart = cursor;
      let parens = 0;
      while (cursor < value.length) {
        if (value[cursor] === "(") parens += 1;
        else if (value[cursor] === ")") parens -= 1;
        if (value[cursor] === "," && parens === 0) break;
        cursor += 1;
      }
      invariant(parens === 0, `unbalanced srcset descriptor in ${sourcePath}`);
      descriptor = value.slice(descriptorStart, cursor).trim();
      if (value[cursor] === ",") cursor += 1;
    }
    if (descriptor !== "") {
      const fields = descriptor.split(/\s+/);
      invariant(fields.length === 1 && (/^[1-9][0-9]*w$/.test(fields[0]) ||
        /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)x$/.test(fields[0])) &&
        !fields[0].startsWith("0w") && Number.parseFloat(fields[0]) > 0,
      `invalid srcset descriptor in ${sourcePath}`);
    }
    urls.push(url);
    candidates += 1;
    invariant(candidates <= PARSER_LIMITS.maxTokens, `srcset candidate limit exceeded in ${sourcePath}`);
  }
  invariant(urls.length > 0, `empty srcset in ${sourcePath}`);
  return urls;
}

function decodeCssEscapes(value, sourcePath) {
  return value.replace(/\\(?:([0-9a-f]{1,6})\s?|([^\r\n]))/gi, (whole, hex, escaped) => {
    if (hex) {
      const point = Number.parseInt(hex, 16);
      invariant(point > 0 && point <= 0x10ffff, `invalid CSS escape in ${sourcePath}`);
      return String.fromCodePoint(point);
    }
    return escaped;
  });
}

function cssDependencies(source, sourcePath, { baseHref = null } = {}) {
  const rawDependencies = [];
  let cleaned = "";
  let cleanCursor = 0;
  let cleanQuote = null;
  while (cleanCursor < source.length) {
    if (cleanQuote !== null) {
      const character = source[cleanCursor];
      cleaned += character;
      if (character === "\\") {
        cleanCursor += 1;
        invariant(cleanCursor < source.length, `unterminated CSS escape in ${sourcePath}`);
        cleaned += source[cleanCursor];
      } else if (character === cleanQuote) cleanQuote = null;
      cleanCursor += 1;
    } else if (source[cleanCursor] === '"' || source[cleanCursor] === "'") {
      cleanQuote = source[cleanCursor];
      cleaned += source[cleanCursor++];
    } else if (source.startsWith("/*", cleanCursor)) {
      const end = source.indexOf("*/", cleanCursor + 2);
      invariant(end >= 0, `unterminated CSS comment in ${sourcePath}`);
      invariant(!/[#@]\s*sourceMappingURL\s*=/.test(source.slice(cleanCursor, end + 2)),
        `source maps are not allowed in ${sourcePath}`);
      cleaned += " ".repeat(end + 2 - cleanCursor);
      cleanCursor = end + 2;
    } else cleaned += source[cleanCursor++];
  }
  invariant(cleanQuote === null, `unterminated CSS string in ${sourcePath}`);
  source = cleaned;
  const delimiters = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === '"' || source[index] === "'") {
      const quote = source[index++];
      while (index < source.length && source[index] !== quote) {
        if (source[index] === "\\") {
          index += 1;
          while (index + 1 < source.length && /[0-9a-f]/i.test(source[index + 1]) &&
              source.slice(index, index + 6).length < 6) index += 1;
        }
        index += 1;
      }
      invariant(index < source.length, `unterminated CSS string in ${sourcePath}`);
    } else if (source[index] === "\\") {
      index += 1;
    } else if (["{", "(", "["].includes(source[index])) delimiters.push(source[index]);
    else if (["}", ")", "]"].includes(source[index])) {
      const expected = { "}": "{", ")": "(", "]": "[" }[source[index]];
      invariant(delimiters.pop() === expected, `unbalanced CSS delimiter in ${sourcePath}`);
    }
  }
  invariant(delimiters.length === 0, `unbalanced CSS delimiter in ${sourcePath}`);

  for (let index = 0; index < source.length; index += 1) {
    const identifier = source.slice(index).match(/^(?:[A-Za-z_-]|\\(?:[0-9a-fA-F]{1,6}\s?|[^\r\n]))(?:[A-Za-z0-9_-]|\\(?:[0-9a-fA-F]{1,6}\s?|[^\r\n]))*/)?.[0];
    if (!identifier) continue;
    const functionName = decodeCssEscapes(identifier, sourcePath).toLowerCase();
    let open = index + identifier.length;
    while (/\s/.test(source[open] ?? "")) open += 1;
    if (!["image-set", "-webkit-image-set"].includes(functionName) || source[open] !== "(") {
      index += identifier.length - 1;
      continue;
    }
    let cursor = open + 1;
    let segmentStart = cursor;
    let depth = 0;
    let quote = null;
    const segments = [];
    while (cursor < source.length) {
      const character = source[cursor];
      if (quote !== null) {
        if (character === "\\") cursor += 1;
        else if (character === quote) quote = null;
      } else if (character === '"' || character === "'") quote = character;
      else if (character === "(") depth += 1;
      else if (character === ")") {
        if (depth === 0) { segments.push(source.slice(segmentStart, cursor)); break; }
        depth -= 1;
      } else if (character === "," && depth === 0) {
        segments.push(source.slice(segmentStart, cursor));
        segmentStart = cursor + 1;
      }
      cursor += 1;
    }
    invariant(cursor < source.length && quote === null, `malformed image-set in ${sourcePath}`);
    for (const segment of segments) {
      const candidate = segment.trimStart();
      if (candidate[0] !== '"' && candidate[0] !== "'") continue;
      const candidateQuote = candidate[0];
      let end = 1;
      while (end < candidate.length && candidate[end] !== candidateQuote) {
        if (candidate[end] === "\\") end += 1;
        end += 1;
      }
      invariant(end < candidate.length, `unterminated image-set string in ${sourcePath}`);
      rawDependencies.push(decodeCssEscapes(candidate.slice(1, end), sourcePath));
    }
    index = cursor;
  }
  let cursor = 0;
  let tokens = 0;
  while (cursor < source.length) {
    const quote = source[cursor];
    if (quote === '"' || quote === "'") {
      cursor += 1;
      while (cursor < source.length && source[cursor] !== quote) {
        if (source[cursor] === "\\") cursor += 1;
        cursor += 1;
      }
      invariant(cursor < source.length, `unterminated CSS string in ${sourcePath}`);
      cursor += 1;
      continue;
    }
    const identifier = source.slice(cursor).match(/^(?:[A-Za-z_-]|\\(?:[0-9a-fA-F]{1,6}\s?|[^\r\n]))(?:[A-Za-z0-9_-]|\\(?:[0-9a-fA-F]{1,6}\s?|[^\r\n]))*/)?.[0];
    if (identifier) {
      const decoded = decodeCssEscapes(identifier, sourcePath).toLowerCase();
      let after = cursor + identifier.length;
      while (/\s/.test(source[after] ?? "")) after += 1;
      const before = source.slice(0, cursor).trimEnd().at(-1);
      if (decoded === "import" && before === "@" && (source[after] === '"' || source[after] === "'")) {
        const importQuote = source[after++];
        const start = after;
        while (after < source.length && source[after] !== importQuote) {
          if (source[after] === "\\") after += 1;
          after += 1;
        }
        invariant(after < source.length, `unterminated CSS import in ${sourcePath}`);
        rawDependencies.push(decodeCssEscapes(source.slice(start, after), sourcePath));
        cursor = after + 1;
      } else if (decoded === "url" && source[after] === "(") {
        let end = after + 1;
        while (/\s/.test(source[end] ?? "")) end += 1;
        let value;
        if (source[end] === '"' || source[end] === "'") {
          const urlQuote = source[end++];
          const start = end;
          while (end < source.length && source[end] !== urlQuote) {
            if (source[end] === "\\") end += 1;
            end += 1;
          }
          invariant(end < source.length, `unterminated CSS url in ${sourcePath}`);
          value = source.slice(start, end++);
          while (/\s/.test(source[end] ?? "")) end += 1;
        } else {
          const start = end;
          while (end < source.length && source[end] !== ")") end += 1;
          value = source.slice(start, end).trim();
          invariant(!/\s/.test(value), `whitespace in unquoted CSS url in ${sourcePath}`);
        }
        invariant(source[end] === ")", `unterminated CSS url in ${sourcePath}`);
        value = decodeCssEscapes(value, sourcePath);
        if (!/^data:/i.test(value)) {
          rawDependencies.push(value);
        }
        cursor = end + 1;
      } else cursor += identifier.length;
    } else cursor += 1;
    tokens += 1;
    invariant(tokens <= PARSER_LIMITS.maxTokens, `CSS token limit exceeded in ${sourcePath}`);
  }
  return rawDependencies.map((dependency) => {
    invariant(dependency.length > 0, `empty CSS dependency in ${sourcePath}`);
    return resolveBrowserLocal(dependency, sourcePath, {
      baseHref,
      ignoreSameDocumentFragment: true,
    });
  }).filter((dependency) => dependency !== null);
}

function dependenciesFor(source, extension, sourcePath) {
  if (extension === ".html") return htmlDependencies(source, sourcePath);
  if (extension === ".css") return cssDependencies(source, sourcePath);
  if (extension === ".js") return javascriptDependencies(source, sourcePath);
  if (extension === ".svg") return svgDependencies(source, sourcePath);
  return [];
}

function svgDependencies(source, sourcePath) {
  invariant(!/<!DOCTYPE\b|<!ENTITY\b|<!\[CDATA\[/i.test(source),
    `DTD, entities, and CDATA are unsupported in ${sourcePath}`);
  invariant(!/&(?!(?:amp|apos|gt|lt|quot|#(?:x[0-9a-f]+|[0-9]+));)/i.test(source),
    `invalid or external XML entity in ${sourcePath}`);
  validateSvgXmlStructure(source, sourcePath);
  const dependencies = [];
  for (const tag of parseHtmlTags(source, sourcePath)) {
    if (tag.attributes.has("style")) dependencies.push(...cssDependencies(tag.attributes.get("style"), sourcePath));
    if (tag.name === "style") dependencies.push(...cssDependencies(tag.content ?? "", sourcePath));
    for (const [name, value] of tag.attributes) {
      if (name !== "style" && /url\s*\(/i.test(value))
        dependencies.push(...cssDependencies(`${name}:${value}`, sourcePath));
    }
    if (["image", "use", "script", "feimage"].includes(tag.name)) {
      const href = tag.attributes.get("href") ?? tag.attributes.get("xlink:href");
      if (href !== undefined) {
        const dependency = resolveBrowserLocal(href, sourcePath, { ignoreSameDocumentFragment: true });
        if (dependency !== null) dependencies.push(dependency);
      }
    }
  }
  return dependencies;
}

function validateSvgXmlStructure(source, sourcePath) {
  const stack = [];
  let cursor = 0;
  let roots = 0;
  while (cursor < source.length) {
    const start = source.indexOf("<", cursor);
    if (start < 0) break;
    if (source.startsWith("<!--", start)) {
      const end = source.indexOf("-->", start + 4);
      invariant(end >= 0, `unterminated XML comment in ${sourcePath}`);
      cursor = end + 3;
      continue;
    }
    if (source.startsWith("<?xml", start)) {
      const end = source.indexOf("?>", start + 5);
      invariant(end >= 0, `unterminated XML declaration in ${sourcePath}`);
      cursor = end + 2;
      continue;
    }
    invariant(!source.startsWith("<?", start) && !source.startsWith("<!", start),
      `unsupported XML declaration in ${sourcePath}`);
    let index = start + 1;
    const closing = source[index] === "/";
    if (closing) index += 1;
    const nameStart = index;
    while (/[A-Za-z0-9_.:-]/.test(source[index] ?? "")) index += 1;
    invariant(index > nameStart, `malformed XML element in ${sourcePath}`);
    const name = source.slice(nameStart, index).toLowerCase();
    let quote = null;
    while (index < source.length) {
      if (quote !== null) {
        if (source[index] === quote) quote = null;
      } else if (source[index] === '"' || source[index] === "'") quote = source[index];
      else if (source[index] === ">") break;
      index += 1;
    }
    invariant(index < source.length && quote === null, `unterminated XML element in ${sourcePath}`);
    const selfClosing = source.slice(start, index).trimEnd().endsWith("/");
    if (closing) invariant(stack.pop() === name, `mismatched XML element in ${sourcePath}`);
    else if (!selfClosing) {
      if (stack.length === 0) roots += 1;
      stack.push(name);
    } else if (stack.length === 0) roots += 1;
    invariant(stack.length <= 256, `XML nesting limit exceeded in ${sourcePath}`);
    cursor = index + 1;
  }
  invariant(stack.length === 0 && roots === 1, `unbalanced XML document in ${sourcePath}`);
}

async function loadConfig(configPath) {
  const configStat = await lstat(configPath);
  invariant(configStat.isFile() && !configStat.isSymbolicLink(), "release build config must be a regular file");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  invariant(config?.schemaVersion === 1, "unsupported release build config schema");
  invariant(Array.isArray(config.entries) && config.entries.length > 0, "release entries are required");
  invariant(Array.isArray(config.allowedExtensions) && config.allowedExtensions.length > 0,
    "allowed extensions are required");
  for (const key of ["maxFiles", "maxFileBytes", "maxTotalBytes"]) {
    invariant(Number.isSafeInteger(config.limits?.[key]) && config.limits[key] > 0,
      `invalid release limit: ${key}`);
  }
  return config;
}

async function collectGraph(root, config) {
  const rootReal = await realpath(root);
  const queue = [...config.entries];
  const files = new Map();
  let totalBytes = 0;
  while (queue.length > 0) {
    const declared = queue.shift();
    invariant(typeof declared === "string" && declared.length > 0, "release paths must be strings");
    const absolute = resolve(rootReal, declared);
    invariant(isWithin(rootReal, absolute) && absolute !== rootReal,
      `release dependency escapes workspace: ${declared}`);
    const rel = portablePath(relative(rootReal, absolute));
    invariant(!rel.split("/").some((segment) => PROTECTED_SEGMENTS.has(segment)),
      `protected path in release graph: ${rel}`);
    if (files.has(rel)) continue;
    let pathCursor = rootReal;
    for (const segment of rel.split("/")) {
      pathCursor = join(pathCursor, segment);
      const segmentStat = await lstat(pathCursor).catch((error) => {
        if (error?.code === "ENOENT") throw new Error(`missing release dependency: ${rel}`);
        throw error;
      });
      invariant(!segmentStat.isSymbolicLink(), `symbolic link in release dependency: ${rel}`);
    }
    const extension = extname(rel).toLowerCase();
    invariant(config.allowedExtensions.includes(extension), `unsupported release file type: ${rel}`);
    const fileStat = await lstat(absolute).catch((error) => {
      if (error?.code === "ENOENT") throw new Error(`missing release dependency: ${rel}`);
      throw error;
    });
    invariant(fileStat.isFile() && !fileStat.isSymbolicLink(), `release dependency is not a regular file: ${rel}`);
    invariant(fileStat.size <= config.limits.maxFileBytes, `release file exceeds byte limit: ${rel}`);
    const actual = await realpath(absolute);
    invariant(isWithin(rootReal, actual), `release dependency escapes workspace: ${rel}`);
    let bytes = await readFile(absolute);
    if (config.entries.includes(rel) && extension === ".html") {
      bytes = Buffer.from(enforceReleasePolicy(bytes.toString("utf8"), rel));
    }
    totalBytes += bytes.length;
    invariant(totalBytes <= config.limits.maxTotalBytes, "release graph exceeds total byte limit");
    invariant(files.size + 1 <= config.limits.maxFiles, "release graph exceeds file-count limit");
    files.set(rel, bytes);
    const source = extension === ".json" ? "" : bytes.toString("utf8");
    const dependencies = dependenciesFor(source, extension, rel)
      .map((dependency) => portablePath(relative(rootReal, resolve(dirname(absolute), dependency))))
      .sort();
    queue.push(...dependencies);
  }
  return { files, totalBytes };
}

function canonicalManifest(config, files, totalBytes) {
  const entries = [...files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([path, bytes]) => ({
    path,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  }));
  return `${JSON.stringify({
    schemaVersion: 1,
    entrypoints: [...config.entries].sort(),
    fileCount: entries.length,
    totalBytes,
    files: entries,
  }, null, 2)}\n`;
}

async function publishAtomically(output, files, manifest) {
  const parent = dirname(output);
  const name = output.slice(parent.length + 1);
  const token = `${process.pid}`;
  const staging = join(parent, `.${name}.staging-${token}`);
  const backup = join(parent, `.${name}.backup-${token}`);
  await mkdir(staging);
  let oldMoved = false;
  let published = false;
  try {
    for (const [path, bytes] of [...files.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) {
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
  const { files, totalBytes } = await collectGraph(rootReal, config);
  await assertReleaseFilesIsolated({ files, referenceRoot: rootReal });
  const manifest = canonicalManifest(config, files, totalBytes);
  await assertReleaseFilesIsolated({
    files: new Map([[MANIFEST_NAME, Buffer.from(manifest)]]),
    referenceRoot: rootReal,
  });
  await publishAtomically(safeOutput, files, manifest);
  return Object.freeze({ output: safeOutput, fileCount: files.size, totalBytes });
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
