function isHexDigit(character) {
  return character !== undefined && /^[0-9a-f]$/i.test(character);
}

function decodeEscape(source, index) {
  const escaped = source[index + 1];
  if (escaped === undefined) return null;

  const simple = {
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
    v: "\v",
    0: "\0",
  };
  if (Object.hasOwn(simple, escaped)) {
    if (escaped === "0" && /[0-9]/.test(source[index + 2] ?? "")) {
      return null;
    }
    return { value: simple[escaped], next: index + 2 };
  }

  if (escaped === "\n") {
    return { value: "", next: index + 2 };
  }
  if (escaped === "\r") {
    return {
      value: "",
      next: source[index + 2] === "\n" ? index + 3 : index + 2,
    };
  }

  if (escaped === "x") {
    const digits = source.slice(index + 2, index + 4);
    if (digits.length !== 2 || ![...digits].every(isHexDigit)) return null;
    return {
      value: String.fromCharCode(Number.parseInt(digits, 16)),
      next: index + 4,
    };
  }

  if (escaped === "u") {
    if (source[index + 2] === "{") {
      const close = source.indexOf("}", index + 3);
      if (close === -1) return null;
      const digits = source.slice(index + 3, close);
      if (
        digits.length < 1 ||
        digits.length > 6 ||
        ![...digits].every(isHexDigit)
      ) {
        return null;
      }
      const codePoint = Number.parseInt(digits, 16);
      if (codePoint > 0x10ffff) return null;
      return {
        value: String.fromCodePoint(codePoint),
        next: close + 1,
      };
    }

    const digits = source.slice(index + 2, index + 6);
    if (digits.length !== 4 || ![...digits].every(isHexDigit)) return null;
    return {
      value: String.fromCharCode(Number.parseInt(digits, 16)),
      next: index + 6,
    };
  }

  // JavaScript identity escapes such as \-, \', \", \`, and \\ evaluate to
  // the escaped character. This also covers JSON's delimiter escapes.
  return { value: escaped, next: index + 2 };
}

function readString(source, start) {
  const quote = source[start];
  let value = "";
  let index = start + 1;

  while (index < source.length) {
    const character = source[index];
    if (character === quote) {
      return { value, next: index + 1 };
    }
    if (character === "\\") {
      const decoded = decodeEscape(source, index);
      if (decoded === null) return null;
      value += decoded.value;
      index = decoded.next;
      continue;
    }
    if (
      (quote === "'" || quote === '"') &&
      (character === "\n" || character === "\r")
    ) {
      return null;
    }
    if (
      quote === "`" &&
      character === "$" &&
      source[index + 1] === "{"
    ) {
      return null;
    }
    value += character;
    index += 1;
  }
  return null;
}

function skipIgnored(source, start) {
  let index = start;
  while (index < source.length) {
    if (/\s/.test(source[index])) {
      index += 1;
      continue;
    }
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline + 1;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      index = close === -1 ? source.length : close + 2;
      continue;
    }
    break;
  }
  return index;
}

function parsePrimary(source, start) {
  const index = skipIgnored(source, start);
  if (source[index] === "'" || source[index] === '"' || source[index] === "`") {
    return readString(source, index);
  }
  if (source[index] !== "(") return null;

  const expression = parseStaticStringExpression(source, index + 1);
  if (expression === null) return null;
  const close = skipIgnored(source, expression.next);
  if (source[close] !== ")") return null;
  return { value: expression.value, next: close + 1 };
}

function parseStaticStringExpression(source, start) {
  const first = parsePrimary(source, start);
  if (first === null) return null;

  let value = first.value;
  let next = first.next;
  while (true) {
    const plus = skipIgnored(source, next);
    if (source[plus] !== "+") break;
    const right = parsePrimary(source, plus + 1);
    if (right === null) break;
    value += right.value;
    next = right.next;
  }
  return { value, next };
}

/**
 * Collects values that can be proven to be static strings without evaluating
 * scanned source. This intentionally understands only string literals,
 * literal-only concatenation, parentheses, whitespace, and comments.
 */
export function staticStringValues(source) {
  if (typeof source !== "string") {
    throw new TypeError("source must be a string");
  }

  const values = [];
  for (let index = 0; index < source.length; index += 1) {
    if (source.startsWith("//", index)) {
      const newline = source.indexOf("\n", index + 2);
      index = newline === -1 ? source.length : newline;
      continue;
    }
    if (source.startsWith("/*", index)) {
      const close = source.indexOf("*/", index + 2);
      index = close === -1 ? source.length : close + 1;
      continue;
    }
    const character = source[index];
    if (
      character !== "'" &&
      character !== '"' &&
      character !== "`" &&
      character !== "("
    ) {
      continue;
    }
    const expression = parseStaticStringExpression(source, index);
    if (expression !== null) {
      values.push(expression.value);
      index = expression.next - 1;
    }
  }
  return values;
}

/**
 * Finds static strings containing a path segment named `reference`.
 *
 * Both slash styles are normalized because specifiers can be authored in
 * JavaScript, JSON, and cross-platform build configuration. Matching is
 * case-insensitive and segment-aware, so names such as `reference-copy` and
 * `not-reference` remain benign.
 */
export function referencePathHits(source) {
  return staticStringValues(source).filter((value) => {
    const normalized = value.replaceAll("\\", "/");
    const suffix = normalized.search(/[?#]/);
    const pathname = suffix === -1 ? normalized : normalized.slice(0, suffix);
    return /(?:^|\/)reference(?:\/|$)/i.test(pathname);
  });
}

/**
 * Finds exact protected identities in JavaScript/JSON static string values.
 *
 * The scanner is deliberately an interpreter for string literal syntax only:
 * it never evaluates or imports scanned source. Literal-only + expressions and
 * parentheses are folded, while interpolation, identifiers, calls, and other
 * executable constructs are ignored.
 */
export function protectedIdentityHits(source, protectedTokens) {
  if (!(protectedTokens instanceof Set)) {
    throw new TypeError("protectedTokens must be a Set");
  }

  return staticStringValues(source).filter((value) =>
    protectedTokens.has(value.toLowerCase())
  );
}
