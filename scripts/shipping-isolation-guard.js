#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  realpathSync,
  readdirSync,
  statSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { builtinModules } from "node:module";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BOUNDS = Object.freeze({
  maxDepth: 64,
  maxFiles: 4_096,
  maxFileBytes: 8 * 1024 * 1024,
  maxTotalBytes: 64 * 1024 * 1024,
  maxTokensPerFile: 250_000,
});
const SOURCE_EXTENSIONS = new Set([".js", ".mjs", ".cjs", ".json"]);
const RESOLVE_EXTENSIONS = ["", ".js", ".mjs", ".cjs", ".json"];
const DISTRIBUTABLE_DIRECTORIES = ["dist", "build"];
const BUILTIN_MODULES = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

function slash(path) {
  return path.split(sep).join("/");
}

function within(root, path) {
  const rel = relative(root, path);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." &&
    !isAbsolute(rel));
}

function issue(code, file, detail) {
  return { code, detail, file };
}

function decodeEscape(source, index) {
  const escaped = source[index + 1];
  if (escaped === undefined) return null;
  const simple = {
    0: "\0",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
  };
  if (Object.hasOwn(simple, escaped)) {
    if (escaped === "0" && /\d/u.test(source[index + 2] ?? "")) return null;
    return { next: index + 2, value: simple[escaped] };
  }
  if (escaped === "\n") return { next: index + 2, value: "" };
  if (escaped === "\r") {
    return {
      next: source[index + 2] === "\n" ? index + 3 : index + 2,
      value: "",
    };
  }
  if (escaped === "x") {
    const digits = source.slice(index + 2, index + 4);
    if (!/^[\da-f]{2}$/iu.test(digits)) return null;
    return { next: index + 4, value: String.fromCharCode(parseInt(digits, 16)) };
  }
  if (escaped === "u") {
    if (source[index + 2] === "{") {
      const close = source.indexOf("}", index + 3);
      const digits = close === -1 ? "" : source.slice(index + 3, close);
      if (!/^[\da-f]{1,6}$/iu.test(digits)) return null;
      const point = parseInt(digits, 16);
      if (point > 0x10ffff) return null;
      return { next: close + 1, value: String.fromCodePoint(point) };
    }
    const digits = source.slice(index + 2, index + 6);
    if (!/^[\da-f]{4}$/iu.test(digits)) return null;
    return { next: index + 6, value: String.fromCharCode(parseInt(digits, 16)) };
  }
  return { next: index + 2, value: escaped };
}

function templateExpressionClose(source, start) {
  let depth = 1;
  let index = start;
  while (index < source.length) {
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) return -1;
      index = end + 2;
      continue;
    }
    const quote = source[index];
    if (quote === "'" || quote === '"') {
      index += 1;
      while (index < source.length && source[index] !== quote) {
        index += source[index] === "\\" ? 2 : 1;
      }
      if (index >= source.length) return -1;
      index += 1;
      continue;
    }
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
    index += 1;
  }
  return -1;
}

function tokenize(source, maximum) {
  const tokens = [];
  let index = 0;
  const push = (type, value, start = index) => {
    tokens.push({ start, type, value });
    if (tokens.length > maximum) {
      throw new RangeError(`token count exceeds ${maximum}`);
    }
  };
  while (index < source.length) {
    if (/\s/u.test(source[index])) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      const end = source.indexOf("\n", index + 2);
      index = end === -1 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const end = source.indexOf("*/", index + 2);
      if (end === -1) throw new SyntaxError("unterminated block comment");
      index = end + 2;
      continue;
    }
    const start = index;
    const character = source[index];
    if (character === "'" || character === '"') {
      let value = "";
      index += 1;
      let closed = false;
      while (index < source.length) {
        if (source[index] === character) {
          index += 1;
          closed = true;
          break;
        }
        if (source[index] === "\\") {
          const decoded = decodeEscape(source, index);
          if (decoded === null) throw new SyntaxError("invalid string escape");
          value += decoded.value;
          index = decoded.next;
        } else {
          if (source[index] === "\n" || source[index] === "\r") {
            throw new SyntaxError("unterminated string");
          }
          value += source[index];
          index += 1;
        }
      }
      if (!closed) throw new SyntaxError("unterminated string");
      push("string", value, start);
      continue;
    }
    if (character === "`") {
      push("punct", "(", start);
      index += 1;
      let cooked = "";
      let closed = false;
      while (index < source.length) {
        if (source[index] === "`") {
          push("string", cooked, start);
          index += 1;
          closed = true;
          break;
        }
        if (source.startsWith("${", index)) {
          push("string", cooked, start);
          push("punct", "+", index);
          push("punct", "(", index);
          const close = templateExpressionClose(source, index + 2);
          if (close === -1) throw new SyntaxError("unterminated template");
          const nested = tokenize(
            source.slice(index + 2, close),
            maximum - tokens.length,
          );
          for (const token of nested) {
            push(token.type, token.value, token.start + index + 2);
          }
          push("punct", ")", close);
          push("punct", "+", close);
          cooked = "";
          index = close + 1;
          continue;
        }
        if (source[index] === "\\") {
          const decoded = decodeEscape(source, index);
          if (decoded === null) throw new SyntaxError("invalid template escape");
          cooked += decoded.value;
          index = decoded.next;
        } else {
          cooked += source[index];
          index += 1;
        }
      }
      if (closed) {
        push("punct", ")", index - 1);
        continue;
      }
      throw new SyntaxError("unterminated template");
    }
    if (/[$_\p{ID_Start}]/u.test(character)) {
      index += 1;
      while (index < source.length &&
        /[$_\u200c\u200d\p{ID_Continue}]/u.test(source[index])) {
        index += 1;
      }
      push("identifier", source.slice(start, index), start);
      continue;
    }
    if (/\d/u.test(character)) {
      index += 1;
      while (index < source.length && /[\d._a-fxobn]/iu.test(source[index])) {
        index += 1;
      }
      push("number", source.slice(start, index), start);
      continue;
    }
    const pair = source.slice(index, index + 2);
    const punct = ["=>", "?.", "??", "&&", "||", "==", "!=", "**"].includes(pair)
      ? pair
      : character;
    push("punct", punct, start);
    index += punct.length;
  }
  return tokens;
}

function evaluate(tokens, start, end, bindings, stack = new Set()) {
  while (tokens[start]?.value === "(" && tokens[end - 1]?.value === ")") {
    let depth = 0;
    let wraps = true;
    for (let index = start; index < end; index += 1) {
      if (tokens[index].value === "(") depth += 1;
      if (tokens[index].value === ")") depth -= 1;
      if (depth === 0 && index !== end - 1) {
        wraps = false;
        break;
      }
    }
    if (!wraps) break;
    start += 1;
    end -= 1;
  }
  let depth = 0;
  for (let index = end - 1; index >= start; index -= 1) {
    if (tokens[index].value === ")") depth += 1;
    if (tokens[index].value === "(") depth -= 1;
    if (depth === 0 && tokens[index].value === "+") {
      const left = evaluate(tokens, start, index, bindings, stack);
      const right = evaluate(tokens, index + 1, end, bindings, stack);
      return left === null || right === null ? null : left + right;
    }
  }
  if (end - start === 1 && tokens[start]?.type === "string") {
    return tokens[start].value;
  }
  if (end - start === 1 && tokens[start]?.type === "identifier") {
    const name = tokens[start].value;
    if (stack.has(name) || !bindings.has(name)) return null;
    stack.add(name);
    const binding = bindings.get(name);
    const value = evaluate(tokens, binding.start, binding.end, bindings, stack);
    stack.delete(name);
    return value;
  }
  if (
    end - start === 3 &&
    tokens[start]?.value === "String" &&
    tokens[start + 1]?.value === "." &&
    tokens[start + 2]?.value === "raw"
  ) {
    return null;
  }
  return null;
}

function delimiter(tokens, start, opening, closing) {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    if (tokens[index].value === opening) depth += 1;
    if (tokens[index].value === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function expressionEnd(tokens, start, stopValues) {
  let round = 0;
  let square = 0;
  let curly = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    if (round === 0 && square === 0 && curly === 0 && stopValues.has(value)) {
      return index;
    }
    if (value === "(") round += 1;
    if (value === ")") round -= 1;
    if (value === "[") square += 1;
    if (value === "]") square -= 1;
    if (value === "{") curly += 1;
    if (value === "}") curly -= 1;
  }
  return tokens.length;
}

function analyzeSource(source, maxTokens) {
  const tokens = tokenize(source, maxTokens);
  const bindings = new Map();
  for (let index = 0; index < tokens.length - 3; index += 1) {
    if (!["const", "let", "var"].includes(tokens[index].value)) continue;
    const name = tokens[index + 1];
    if (name?.type !== "identifier" || tokens[index + 2]?.value !== "=") continue;
    const end = expressionEnd(tokens, index + 3, new Set([",", ";"]));
    bindings.set(name.value, { end, start: index + 3 });
    index = end;
  }

  const loaderBindings = new Map();
  const directLoader = (start, end, seen = new Set()) => {
    while (tokens[start]?.value === "(" && tokens[end - 1]?.value === ")" &&
      delimiter(tokens.slice(start, end), 0, "(", ")") === end - start - 1) {
      start += 1;
      end -= 1;
    }
    if (end - start !== 1 || tokens[start]?.type !== "identifier") return null;
    const name = tokens[start].value;
    if (name === "require") return "require";
    if (name === "URL") return "url";
    if (seen.has(name) || !bindings.has(name)) return null;
    seen.add(name);
    const binding = bindings.get(name);
    const result = directLoader(binding.start, binding.end, seen);
    seen.delete(name);
    return result;
  };
  for (const [name, binding] of bindings) {
    const kind = directLoader(binding.start, binding.end);
    if (kind !== null) loaderBindings.set(name, kind);
  }
  const codeConstructor = (start, end, seen = new Set()) => {
    while (tokens[start]?.value === "(" && tokens[end - 1]?.value === ")") {
      start += 1;
      end -= 1;
    }
    if (end - start !== 1 || tokens[start]?.type !== "identifier") return null;
    const name = tokens[start].value;
    if (name === "Function" || name === "eval") return name;
    if (seen.has(name) || !bindings.has(name)) return null;
    seen.add(name);
    const binding = bindings.get(name);
    const result = codeConstructor(binding.start, binding.end, seen);
    seen.delete(name);
    return result;
  };
  // Recognize simple, statically propagated loader wrappers such as
  // `const load = (path) => require(path)` and `(path) => import(path)`.
  for (const [name, binding] of bindings) {
    let start = binding.start;
    let end = binding.end;
    let parameter = null;
    if (
      tokens[start]?.value === "(" &&
      tokens[start + 1]?.type === "identifier" &&
      tokens[start + 2]?.value === ")" &&
      tokens[start + 3]?.value === "=>"
    ) {
      parameter = tokens[start + 1].value;
      start += 4;
    } else if (
      tokens[start]?.type === "identifier" &&
      tokens[start + 1]?.value === "=>"
    ) {
      parameter = tokens[start].value;
      start += 2;
    }
    if (parameter === null) continue;
    while (tokens[start]?.value === "(" &&
      tokens[end - 1]?.value === ")") {
      start += 1;
      end -= 1;
    }
    let kind = null;
    let argument = -1;
    if (
      tokens[start]?.value === "import" &&
      tokens[start + 1]?.value === "("
    ) {
      kind = "dynamic-import";
      argument = start + 2;
    } else if (
      tokens[start]?.value === "new" &&
      directLoader(start + 1, start + 2) === "url" &&
      tokens[start + 2]?.value === "("
    ) {
      kind = "url";
      argument = start + 3;
    } else if (
      directLoader(start, start + 1) === "require" &&
      tokens[start + 1]?.value === "("
    ) {
      kind = "require";
      argument = start + 2;
    }
    if (kind !== null && tokens[argument]?.value === parameter) {
      loaderBindings.set(name, kind);
    }
  }

  const dependencies = [];
  const identifiers = [];
  const values = [];
  for (const token of tokens) {
    if (token.type === "string") values.push(token.value);
    if (token.type === "identifier") identifiers.push(token.value);
  }
  for (const binding of bindings.values()) {
    const value = evaluate(tokens, binding.start, binding.end, bindings);
    if (value !== null) values.push(value);
  }
  const add = (kind, start, end, dynamic = false) => {
    const value = evaluate(tokens, start, end, bindings);
    dependencies.push({
      dynamic,
      kind,
      offset: tokens[start]?.start ?? 0,
      value,
    });
    if (value !== null) values.push(value);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const value = tokens[index].value;
    const constructor = tokens[index]?.type === "identifier"
      ? codeConstructor(index, index + 1)
      : null;
    if (
      constructor !== null &&
      tokens[index - 1]?.value !== "new" &&
      tokens[index + 1]?.value === "("
    ) {
      const close = delimiter(tokens, index + 1, "(", ")");
      if (close === -1) throw new SyntaxError(
        `unterminated ${constructor}()`,
      );
      dependencies.push({
        dynamic: true,
        kind: "constructed-loader",
        offset: tokens[index].start,
        value: null,
      });
    }
    if (
      value === "new" &&
      codeConstructor(index + 1, index + 2) !== null &&
      tokens[index + 2]?.value === "("
    ) {
      const close = delimiter(tokens, index + 2, "(", ")");
      if (close === -1) throw new SyntaxError("unterminated new Function()");
      dependencies.push({
        dynamic: true,
        kind: "constructed-loader",
        offset: tokens[index].start,
        value: null,
      });
    }
    if (value === "import") {
      if (tokens[index + 1]?.value === "(") {
        const close = delimiter(tokens, index + 1, "(", ")");
        if (close === -1) throw new SyntaxError("unterminated import()");
        add("dynamic-import", index + 2, close, true);
        index = close;
      } else {
        let from = index + 1;
        while (from < tokens.length &&
          !["from", ";"].includes(tokens[from].value)) from += 1;
        const start = tokens[from]?.value === "from" ? from + 1 : index + 1;
        if (tokens[start]?.type === "string") add("import", start, start + 1);
      }
      continue;
    }
    if (value === "export") {
      let from = index + 1;
      while (from < tokens.length &&
        !["from", ";"].includes(tokens[from].value)) from += 1;
      if (tokens[from]?.value === "from") {
        const end = expressionEnd(tokens, from + 1, new Set([";"]));
        add("re-export", from + 1, end);
      }
      continue;
    }
    const aliasedLoader = tokens[index]?.type === "identifier"
      ? (loaderBindings.get(value) ?? null)
      : null;
    if ((value === "require" || value === "URL" || aliasedLoader !== null) &&
      tokens[index + 1]?.value === "(") {
      const close = delimiter(tokens, index + 1, "(", ")");
      if (close === -1) throw new SyntaxError(`unterminated ${value}()`);
      const comma = expressionEnd(tokens, index + 2, new Set([",", ")"]));
      const kind = aliasedLoader ??
        (value === "URL" ? "url" : "require");
      add(kind, index + 2, comma, kind !== "url");
      index = close;
      continue;
    }
    if (
      value === "new" &&
      (tokens[index + 1]?.value === "URL" ||
        loaderBindings.get(tokens[index + 1]?.value) === "url") &&
      tokens[index + 2]?.value === "("
    ) {
      const close = delimiter(tokens, index + 2, "(", ")");
      if (close === -1) throw new SyntaxError("unterminated new URL()");
      const comma = expressionEnd(tokens, index + 3, new Set([",", ")"]));
      add("url", index + 3, comma);
      index = close;
    }
  }
  return { dependencies, identifiers, values };
}

function normalizeIdentity(value) {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function isProbablyText(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8_192));
  return !sample.includes(0) &&
    !sample.toString("utf8").includes("\ufffd");
}

function isReferencePath(value) {
  let normalized = value.replaceAll("\\", "/");
  const terminator = normalized.search(/[?#]/u);
  if (terminator !== -1) normalized = normalized.slice(0, terminator);
  try {
    if (/^file:/iu.test(normalized)) {
      normalized = fileURLToPath(normalized).replaceAll("\\", "/");
    } else {
      normalized = decodeURIComponent(normalized);
    }
  } catch {
    // Malformed percent encoding is handled as the literal spelling.
  }
  return normalized.split("/").some((part) =>
    normalizeIdentity(part) === "reference"
  );
}

function identityHits(value, identities) {
  const normalized = normalizeIdentity(value);
  const normalizedCounts = new Map();
  for (const identity of identities) {
    const protectedValue = normalizeIdentity(identity);
    normalizedCounts.set(
      protectedValue,
      (normalizedCounts.get(protectedValue) ?? 0) + 1,
    );
  }
  return identities.filter((identity) => {
    const protectedValue = normalizeIdentity(identity);
    // Single-word benchmark names overlap ordinary shipped mechanics
    // ("clone", "freeze", etc.). The default corpus contains both their key
    // and display spelling, so retain exact matching for those established
    // ambiguous terms. A genuinely singular protected token is not allowed to
    // hide behind an identifier/string prefix or suffix.
    if (/^[\p{L}\p{N}_]+$/u.test(protectedValue)) {
      return normalizedCounts.get(protectedValue) > 1
        ? normalized === protectedValue
        : normalized.includes(protectedValue);
    }
    let offset = normalized.indexOf(protectedValue);
    while (offset !== -1) {
      const before = normalized[offset - 1] ?? "";
      const after = normalized[offset + protectedValue.length] ?? "";
      if (!/[\p{L}\p{N}_]/u.test(before) &&
        !/[\p{L}\p{N}_]/u.test(after)) return true;
      offset = normalized.indexOf(protectedValue, offset + 1);
    }
    return false;
  });
}

function embeddedIdentifierHits(value, identities) {
  const normalized = normalizeIdentity(value);
  const counts = new Map();
  for (const identity of identities) {
    const protectedValue = normalizeIdentity(identity);
    counts.set(protectedValue, (counts.get(protectedValue) ?? 0) + 1);
  }
  return identities.filter((identity) => {
    const protectedValue = normalizeIdentity(identity);
    return /^[\p{L}\p{N}_]+$/u.test(protectedValue) &&
      counts.get(protectedValue) === 1 &&
      normalized !== protectedValue &&
      normalized.includes(protectedValue);
  });
}

export function protectedIdentityHitsInSource(source, identities) {
  const analysis = analyzeSource(source, DEFAULT_BOUNDS.maxTokensPerFile);
  const hits = new Set();
  for (const value of analysis.values) {
    for (const hit of identityHits(value, identities)) hits.add(hit);
  }
  for (const identifier of analysis.identifiers) {
    for (const hit of embeddedIdentifierHits(identifier, identities)) hits.add(hit);
  }
  return [...hits].sort((a, b) => a.localeCompare(b));
}

function readPackageEntries(root, packageJson, bounds) {
  const entries = new Set();
  const add = (value) => {
    if (typeof value === "string" && !value.startsWith("node:")) {
      entries.add(value);
    } else if (Array.isArray(value)) {
      value.forEach(add);
    } else if (value && typeof value === "object") {
      Object.keys(value).sort().forEach((key) => add(value[key]));
    }
  };
  add(packageJson.exports);
  add(packageJson.main);
  add(packageJson.module);
  add(packageJson.browser);
  add(packageJson.bin);
  if (entries.size === 0) {
    const src = join(root, "src");
    if (statOrNull(src)?.isDirectory()) {
      const state = { enumerated: 0 };
      for (const entry of enumerateFiles(src, root, bounds, state)) {
        if (entry.path && SOURCE_EXTENSIONS.has(extname(entry.path))) {
          entries.add(`./${slash(relative(root, entry.path))}`);
        }
      }
    }
  }
  return [...entries].sort();
}

function statOrNull(path) {
  try {
    return statSync(path);
  } catch (error) {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return null;
    throw error;
  }
}

function packageSpecifierParts(specifier) {
  const parts = specifier.split("/");
  if (specifier.startsWith("@")) {
    if (parts.length < 2 || !parts[0] || !parts[1]) return null;
    return {
      name: `${parts[0]}/${parts[1]}`,
      subpath: parts.length === 2 ? "." : `./${parts.slice(2).join("/")}`,
    };
  }
  if (!parts[0]) return null;
  return {
    name: parts[0],
    subpath: parts.length === 1 ? "." : `./${parts.slice(1).join("/")}`,
  };
}

function conditionalTargets(value, conditions, output = new Set()) {
  if (typeof value === "string") {
    output.add(value);
    return output;
  }
  if (value === false || value === null) return output;
  if (Array.isArray(value)) {
    for (const candidate of value) conditionalTargets(
      candidate,
      conditions,
      output,
    );
    return output;
  }
  if (!value || typeof value !== "object") return output;
  for (const [condition, candidate] of Object.entries(value)
    .sort(([left], [right]) => left.localeCompare(right))) {
    if (condition === "default" || conditions.has(condition)) {
      conditionalTargets(candidate, conditions, output);
    }
  }
  return output;
}

function exportedTargets(exportsField, subpath, conditions) {
  const targets = new Set();
  if (typeof exportsField === "string" || Array.isArray(exportsField)) {
    if (subpath === ".") conditionalTargets(exportsField, conditions, targets);
    return targets;
  }
  if (!exportsField || typeof exportsField !== "object") return targets;
  const keys = Object.keys(exportsField);
  if (!keys.some((key) => key.startsWith("."))) {
    if (subpath === ".") conditionalTargets(exportsField, conditions, targets);
    return targets;
  }
  // Audit the requested subpath and every other declared subpath. A package
  // target is executable surface, even when a particular import spelling or
  // condition-order precedence would select only one branch in this run.
  for (const key of keys.sort()) {
    if (key === subpath) {
      conditionalTargets(exportsField[key], conditions, targets);
      continue;
    }
    const star = key.indexOf("*");
    if (star === -1) {
      conditionalTargets(exportsField[key], conditions, targets);
      continue;
    }
    const prefix = key.slice(0, star);
    const suffix = key.slice(star + 1);
    if (!subpath.startsWith(prefix) || !subpath.endsWith(suffix)) continue;
    const middle = subpath.slice(prefix.length, subpath.length - suffix.length);
    const wildcardTargets = conditionalTargets(
      exportsField[key],
      conditions,
    );
    for (const target of wildcardTargets) {
      targets.add(target.replaceAll("*", middle));
    }
  }
  return targets;
}

function findPackageRoot(name, importer, rootReal) {
  let directory = dirname(importer);
  while (within(rootReal, directory)) {
    const candidate = join(directory, "node_modules", ...name.split("/"));
    if (statOrNull(candidate)?.isDirectory()) {
      const real = realpathSync(candidate);
      return within(rootReal, real) ? { path: real } : { escape: real };
    }
    if (directory === rootReal) break;
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return { missing: name };
}

function resolveBarePackage(specifier, importer, rootReal, kind, bounds) {
  const parsed = packageSpecifierParts(specifier);
  if (parsed === null) return { unsupported: specifier };
  const located = findPackageRoot(parsed.name, importer, rootReal);
  if (!located.path) return located;
  const packageRoot = located.path;
  const packagePath = join(packageRoot, "package.json");
  const packageStat = statOrNull(packagePath);
  if (!packageStat?.isFile()) {
    return { unsupported: `${parsed.name}: missing package.json` };
  }
  if (packageStat.size > bounds.maxFileBytes) {
    return {
      unsupported: `${parsed.name}: package.json exceeds maxFileBytes`,
    };
  }
  let packageJson;
  try {
    packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  } catch {
    return { unsupported: `${parsed.name}: invalid package.json` };
  }
  const conditions = new Set([
    "browser",
    "default",
    "import",
    "module",
    "node",
    "require",
  ]);
  const usesExports = packageJson.exports !== undefined;
  const targets = usesExports
    ? exportedTargets(packageJson.exports, parsed.subpath, conditions)
    : new Set();
  if (targets.size === 0 && packageJson.exports !== undefined) {
    return { missing: `${specifier}: package export` };
  }
  if (!usesExports && parsed.subpath !== ".") targets.add(parsed.subpath);
  if (!usesExports && parsed.subpath === ".") {
    for (const target of [
      packageJson.browser,
      packageJson.module,
      packageJson.main,
    ]) {
      if (typeof target === "string") targets.add(target);
    }
    if (targets.size === 0) targets.add("./index.js");
  }
  if (packageJson.browser && typeof packageJson.browser === "object") {
    for (const [key, mapped] of Object.entries(packageJson.browser)
      .sort(([left], [right]) => left.localeCompare(right))) {
      if (key.startsWith(".")) targets.add(key);
      if (typeof mapped === "string") targets.add(mapped);
    }
  }
  const paths = new Set();
  const problems = [];
  for (let target of [...targets].sort()) {
    if (!usesExports && !target.startsWith("./")) target = `./${target}`;
    if (!target.startsWith("./")) {
      problems.push({ unsupported: `${specifier}: unsupported package target ${target}` });
      continue;
    }
    const resolved = resolveFile(
      target,
      packagePath,
      rootReal,
      kind,
      bounds,
      true,
    );
    if (resolved.path && !within(packageRoot, resolved.path)) {
      problems.push({ escape: resolved.path });
    } else if (resolved.path) {
      paths.add(resolved.path);
    } else {
      problems.push(resolved);
    }
  }
  return {
    metadata: [packagePath],
    paths: [...paths].sort(),
    problems,
  };
}

function resolveFile(
  specifier,
  importer,
  rootReal,
  kind = "import",
  bounds = DEFAULT_BOUNDS,
  packageTarget = false,
) {
  const pathname = specifier.split(/[?#]/u, 1)[0];
  let candidate;
  if (BUILTIN_MODULES.has(pathname)) return { builtin: true };
  if (/^file:/iu.test(pathname)) {
    candidate = fileURLToPath(pathname);
  } else if (pathname.startsWith(".") || pathname.startsWith("/") ||
    /^[a-zA-Z]:[\\/]/u.test(pathname)) {
    candidate = pathname.startsWith(".")
      ? resolve(dirname(importer), pathname)
      : resolve(pathname);
  } else if (/^[a-z][a-z\d+.-]*:/iu.test(pathname)) {
    return { unsupported: pathname };
  } else {
    if (packageTarget) return { unsupported: pathname };
    return resolveBarePackage(pathname, importer, rootReal, kind, bounds);
  }
  for (const extension of RESOLVE_EXTENSIONS) {
    const exact = `${candidate}${extension}`;
    const stat = statOrNull(exact);
    if (stat?.isFile()) {
      const real = realpathSync(exact);
      if (!within(rootReal, real)) return { escape: real };
      return { path: real };
    }
  }
  const directory = statOrNull(candidate);
  if (directory?.isDirectory()) {
    for (const extension of RESOLVE_EXTENSIONS.slice(1)) {
      const index = join(candidate, `index${extension}`);
      if (statOrNull(index)?.isFile()) {
        const real = realpathSync(index);
        if (!within(rootReal, real)) return { escape: real };
        return { path: real };
      }
    }
  }
  return { missing: candidate };
}

function loadDefaultIdentities(root) {
  const path = join(root, "reference", "stats", "cards.json");
  if (!statOrNull(path)?.isFile()) return [];
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return (parsed.cards ?? []).flatMap(({ key, name }) => [key, name])
    .filter((value) => typeof value === "string");
}

function enumerateFiles(directory, rootReal, bounds, state, depth = 0) {
  if (depth > bounds.maxDepth) {
    throw new RangeError(`directory depth exceeds ${bounds.maxDepth}`);
  }
  const output = [];
  const entries = readdirSync(directory, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    const path = join(directory, entry.name);
    const info = lstatSync(path);
    if (info.isSymbolicLink()) {
      const real = realpathSync(path);
      if (!within(rootReal, real)) {
        output.push({ escape: real, path });
        continue;
      }
      const realInfo = statSync(real);
      if (realInfo.isDirectory()) {
        output.push(...enumerateFiles(real, rootReal, bounds, state, depth + 1));
      } else if (realInfo.isFile()) {
        output.push({ path: real });
      }
    } else if (info.isDirectory()) {
      output.push(...enumerateFiles(path, rootReal, bounds, state, depth + 1));
    } else if (info.isFile()) {
      output.push({ path });
    }
    state.enumerated += 1;
    if (state.enumerated > bounds.maxFiles) {
      throw new RangeError(`file count exceeds ${bounds.maxFiles}`);
    }
  }
  return output;
}

function canonicalReport(report) {
  const uniqueIssues = [...new Map(report.issues.map((entry) => [
    `${entry.file}\0${entry.code}\0${entry.detail}`,
    entry,
  ])).values()];
  const sortedIssues = uniqueIssues.sort((a, b) =>
    a.file.localeCompare(b.file) || a.code.localeCompare(b.code) ||
    a.detail.localeCompare(b.detail)
  );
  return deepFreeze({
    entries: [...report.entries].sort(),
    files: [...report.files].sort(),
    issues: sortedIssues,
    ok: sortedIssues.length === 0,
    stats: { ...report.stats },
    version: 1,
  });
}

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function referenceFingerprints(rootReal, bounds) {
  const directory = join(rootReal, "reference");
  if (!statOrNull(directory)?.isDirectory()) return [];
  const state = { enumerated: 0 };
  const fingerprints = [];
  for (const entry of enumerateFiles(directory, rootReal, bounds, state)) {
    if (!entry.path) continue;
    const stat = statSync(entry.path);
    const bytes = stat.size <= bounds.maxFileBytes
      ? readFileSync(entry.path)
      : null;
    fingerprints.push({
      bytes: bytes?.length >= 32 ? bytes : null,
      hash: bytes === null
        ? null
        : createHash("sha256").update(bytes).digest("hex"),
      path: slash(relative(rootReal, entry.path)),
      size: stat.size,
    });
  }
  return fingerprints.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Audits the resolvable shipped module graph and complete distributable bytes.
 * It never evaluates application code and never writes to the audited tree.
 */
export function auditShippingIsolation(options = {}) {
  const root = resolve(options.root ?? process.cwd());
  const rootReal = realpathSync(root);
  const bounds = Object.freeze({ ...DEFAULT_BOUNDS, ...(options.bounds ?? {}) });
  const identities = [...new Set(
    (options.protectedIdentities ?? loadDefaultIdentities(root))
      .filter((value) => typeof value === "string" && value.length > 0),
  )].sort((a, b) => a.localeCompare(b));
  const packagePath = join(rootReal, "package.json");
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const entrySpecifiers = options.entries ??
    readPackageEntries(rootReal, packageJson, bounds);
  const corpusFingerprints = referenceFingerprints(rootReal, bounds);
  const entries = [];
  const issues = [];
  const queue = [];
  const visited = new Set();
  const distributable = new Set();
  let totalBytes = 0;
  let dependencyCount = 0;

  const display = (path) => slash(relative(rootReal, path));
  const resolvedPaths = (result) => result.paths ??
    (result.path ? [result.path] : []);
  const resolutionProblems = (result) => result.problems ??
    (resolvedPaths(result).length === 0 &&
        !result.builtin &&
        (result.escape || result.unsupported || result.missing)
      ? [result]
      : []);
  const queueResolution = (result, depth, file, specifier, entry = false) => {
    for (const path of resolvedPaths(result)) {
      queue.push({ depth, path });
      if (entry) entries.push(display(path));
    }
    for (const metadata of result.metadata ?? []) {
      queue.push({ depth, path: metadata });
    }
    for (const problem of resolutionProblems(result)) {
      issues.push(issue(
        problem.escape
          ? (entry ? "ENTRY_ESCAPE" : "MODULE_ESCAPE")
          : problem.unsupported
            ? (entry ? "ENTRY_UNSUPPORTED" : "MODULE_UNSUPPORTED")
            : (entry ? "ENTRY_UNRESOLVED" : "MODULE_UNRESOLVED"),
        file,
        problem.unsupported ?? problem.missing ?? specifier,
      ));
    }
  };
  for (const specifier of [...entrySpecifiers].sort()) {
    if (isReferencePath(specifier)) {
      issues.push(issue("REFERENCE_SPECIFIER", "<package>", specifier));
      continue;
    }
    const result = resolveFile(
      specifier,
      packagePath,
      rootReal,
      "import",
      bounds,
    );
    if (!result.builtin) {
      queueResolution(result, 0, "<package>", specifier, true);
    }
  }

  while (queue.length > 0) {
    queue.sort((a, b) => a.path.localeCompare(b.path));
    const { depth, path } = queue.shift();
    if (visited.has(path)) continue;
    if (depth > bounds.maxDepth) {
      issues.push(issue("DEPTH_LIMIT", display(path), String(bounds.maxDepth)));
      continue;
    }
    if (visited.size >= bounds.maxFiles) {
      issues.push(issue("FILE_LIMIT", display(path), String(bounds.maxFiles)));
      break;
    }
    visited.add(path);
    distributable.add(path);
    const fileSize = statSync(path).size;
    if (fileSize > bounds.maxFileBytes) {
      issues.push(issue("FILE_SIZE_LIMIT", display(path), String(fileSize)));
      continue;
    }
    const bytes = readFileSync(path);
    totalBytes += bytes.length;
    if (!SOURCE_EXTENSIONS.has(extname(path))) {
      continue;
    }
    let analysis;
    try {
      analysis = analyzeSource(bytes.toString("utf8"), bounds.maxTokensPerFile);
    } catch (error) {
      issues.push(issue("SOURCE_PARSE", display(path), error.message));
      continue;
    }
    for (const value of analysis.values) {
      if (isReferencePath(value)) {
        issues.push(issue("REFERENCE_VALUE", display(path), value));
      }
      for (const hit of identityHits(value, identities)) {
        issues.push(issue("PROTECTED_IDENTITY", display(path), hit));
      }
    }
    for (const identifier of analysis.identifiers) {
      for (const hit of embeddedIdentifierHits(identifier, identities)) {
        issues.push(issue("PROTECTED_IDENTITY", display(path), hit));
      }
    }
    for (const dependency of analysis.dependencies) {
      dependencyCount += 1;
      if (dependency.value === null) {
        issues.push(issue(
          "UNRESOLVED_DYNAMIC_SPECIFIER",
          display(path),
          `${dependency.kind}@${dependency.offset}`,
        ));
        continue;
      }
      if (isReferencePath(dependency.value)) {
        issues.push(issue(
          "REFERENCE_SPECIFIER",
          display(path),
          dependency.value,
        ));
        continue;
      }
      const result = resolveFile(
        dependency.value,
        path,
        rootReal,
        dependency.kind,
        bounds,
      );
      if (result.builtin) continue;
      queueResolution(
        result,
        depth + 1,
        display(path),
        dependency.value,
      );
    }
  }

  const enumerationState = { enumerated: 0 };
  for (const name of DISTRIBUTABLE_DIRECTORIES) {
    const directory = join(rootReal, name);
    if (!statOrNull(directory)?.isDirectory()) continue;
    try {
      for (const entry of enumerateFiles(
        directory,
        rootReal,
        bounds,
        enumerationState,
      )) {
        if (entry.escape) {
          issues.push(issue("DISTRIBUTABLE_ESCAPE", slash(relative(
            rootReal,
            entry.path,
          )), slash(relative(rootReal, entry.escape))));
        } else {
          distributable.add(entry.path);
        }
      }
    } catch (error) {
      issues.push(issue("DISTRIBUTABLE_LIMIT", name, error.message));
    }
  }

  let totalDistributableBytes = 0;
  for (const path of [...distributable].sort()) {
    const file = display(path);
    const fileSize = statSync(path).size;
    totalDistributableBytes += fileSize;
    if (fileSize > bounds.maxFileBytes) {
      if (!issues.some((entry) =>
        entry.code === "FILE_SIZE_LIMIT" && entry.file === file)) {
        issues.push(issue("FILE_SIZE_LIMIT", file, String(fileSize)));
      }
      continue;
    }
    const bytes = readFileSync(path);
    const text = bytes.toString("utf8");
    if (isReferencePath(file)) {
      issues.push(issue("REFERENCE_FILE", file, file));
    }
    if (isProbablyText(bytes)) {
      try {
        const analysis = analyzeSource(text, bounds.maxTokensPerFile);
        for (const value of analysis.values) {
          if (isReferencePath(value)) {
            issues.push(issue("REFERENCE_VALUE", file, value));
          }
          for (const hit of identityHits(value, identities)) {
            issues.push(issue("PROTECTED_IDENTITY", file, hit));
          }
          for (const hit of identityHits(value, identities)) {
            issues.push(issue("PROTECTED_BYTES", file, hit));
          }
        }
        for (const identifier of analysis.identifiers) {
          for (const hit of embeddedIdentifierHits(identifier, identities)) {
            issues.push(issue("PROTECTED_IDENTITY", file, hit));
            issues.push(issue("PROTECTED_BYTES", file, hit));
          }
        }
      } catch {
        // Graph parsing already reports source errors; byte scanning still runs.
      }
    }
    const byteHash = createHash("sha256").update(bytes).digest("hex");
    for (const fingerprint of corpusFingerprints) {
      if (
        (bytes.length === fingerprint.size && fingerprint.hash === byteHash) ||
        (fingerprint.bytes !== null && bytes.length > fingerprint.bytes.length &&
          bytes.indexOf(fingerprint.bytes) !== -1)
      ) {
        issues.push(issue("REFERENCE_CONTENT", file, fingerprint.path));
      }
    }
  }
  if (totalDistributableBytes > bounds.maxTotalBytes) {
    issues.push(issue(
      "TOTAL_SIZE_LIMIT",
      "<distributable>",
      String(totalDistributableBytes),
    ));
  }

  return canonicalReport({
    entries,
    files: [...distributable].map(display),
    issues,
    stats: {
      dependencies: dependencyCount,
      distributableFiles: distributable.size,
      graphFiles: visited.size,
      protectedIdentities: identities.length,
      referenceFingerprints: corpusFingerprints.length,
      totalDistributableBytes,
      totalGraphBytes: totalBytes,
    },
  });
}

export function formatShippingIsolationReport(report) {
  return `${JSON.stringify(canonicalReport(report), null, 2)}\n`;
}

const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    const rootArgument = process.argv[2];
    const report = auditShippingIsolation({
      root: rootArgument ? resolve(rootArgument) : process.cwd(),
    });
    process.stdout.write(formatShippingIsolationReport(report));
    if (!report.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`shipping-isolation-guard: ${error.message}\n`);
    process.exitCode = 2;
  }
}
