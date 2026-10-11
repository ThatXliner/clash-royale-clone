import { spawnSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import vm from "node:vm";

export const GUARD_LIMITS = Object.freeze({
  maxAstNodes: 100_000,
  maxBindings: 20_000,
  maxFiles: 512,
  maxGraphDepth: 64,
  maxSourceBytes: 512 * 1024,
  maxTotalSourceBytes: 8 * 1024 * 1024,
  maxSyntaxDepth: 128,
});

const FORBIDDEN_MODULES = new Map([
  ["crypto", "ambient randomness"],
  ["node:crypto", "ambient randomness"],
  ["perf_hooks", "wall-clock time"],
  ["node:perf_hooks", "wall-clock time"],
  ["timers", "timers"],
  ["node:timers", "timers"],
  ["timers/promises", "timers"],
  ["node:timers/promises", "timers"],
  ["module", "native module acquisition"],
  ["node:module", "native module acquisition"],
]);

const DIRECT_FORBIDDEN = new Map([
  ["global.Date", "wall-clock time"],
  ["global.performance", "wall-clock time"],
  ["global.setTimeout", "timers"],
  ["global.setInterval", "timers"],
  ["global.setImmediate", "timers"],
  ["global.requestAnimationFrame", "timers"],
  ["global.Math.random", "ambient randomness"],
  ["global.crypto", "ambient randomness"],
  ["global.process.hrtime", "wall-clock time"],
  ["global.process.uptime", "wall-clock time"],
  ["global.process.binding", "native module acquisition"],
  ["global.process._linkedBinding", "native module acquisition"],
  ["global.process.getBuiltinModule", "native module acquisition"],
  ["global.Temporal.Now", "wall-clock time"],
]);

const ACORN_SOURCE_KEY = "internal/deps/acorn/acorn/dist/acorn";
const REPOSITORY_SOURCE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const SIMULATION_GRAPH_ROOT = resolve(REPOSITORY_SOURCE_ROOT, "sim");
const SIMULATION_NEUTRAL_MODULE = resolve(
  REPOSITORY_SOURCE_ROOT,
  "shared/session-troop-projectile-authority.js",
);
const SIMULATION_PROJECTILE_DELIVERY_MODULE = resolve(
  REPOSITORY_SOURCE_ROOT,
  "shared/ordinary-projectile-delivery-authority.js",
);
let parser;

function loadPlatformParser() {
  if (parser !== undefined) return parser;
  // Node ships Acorn for its own module tooling. Loading that exact bundled
  // source avoids a network dependency while still using the parser matching
  // the executing platform.
  const source = process.binding("natives")[ACORN_SOURCE_KEY];
  if (typeof source !== "string") {
    throw new Error("Node's platform JavaScript parser is unavailable");
  }
  const module = { exports: {} };
  Function("exports", "module", source)(module.exports, module);
  parser = module.exports;
  return parser;
}

function errorCode(error) {
  return error && typeof error === "object" && "code" in error
    ? String(error.code)
    : "GUARD_FAILURE";
}

export class NondeterminismGuardError extends Error {
  constructor(message, { code = "NONDETERMINISM_GUARD", violations = [] } = {}) {
    super(message);
    this.name = "NondeterminismGuardError";
    this.code = code;
    this.violations = Object.freeze(violations.map(Object.freeze));
  }
}

function boundedTokens(source, file) {
  if (Buffer.byteLength(source, "utf8") > GUARD_LIMITS.maxSourceBytes) {
    throw new NondeterminismGuardError(
      `${file} exceeds ${GUARD_LIMITS.maxSourceBytes} source bytes`,
      { code: "SOURCE_SIZE_LIMIT" },
    );
  }
  const acorn = loadPlatformParser();
  const tokenizer = acorn.tokenizer(source, {
    allowHashBang: true,
    ecmaVersion: "latest",
    locations: true,
    sourceType: "module",
  });
  let depth = 0;
  for (;;) {
    const token = tokenizer.getToken();
    if (token.type.label === "eof") break;
    if (token.type.label === "(" || token.type.label === "[" ||
        token.type.label === "{") {
      depth += 1;
      if (depth > GUARD_LIMITS.maxSyntaxDepth) {
        throw new NondeterminismGuardError(
          `${file} exceeds syntax depth ${GUARD_LIMITS.maxSyntaxDepth}`,
          { code: "SYNTAX_DEPTH_LIMIT" },
        );
      }
    } else if (
      token.type.label === ")" || token.type.label === "]" ||
      token.type.label === "}"
    ) {
      depth -= 1;
    }
  }
}

function parseModule(source, file) {
  boundedTokens(source, file);
  try {
    return loadPlatformParser().parse(source, {
      allowHashBang: true,
      ecmaVersion: "latest",
      locations: true,
      sourceType: "module",
    });
  } catch (error) {
    throw new NondeterminismGuardError(
      `${file} is not a valid ECMAScript module: ${error.message}`,
      { code: "INVALID_MODULE" },
    );
  }
}

function staticProperty(node) {
  if (!node.computed && (node.property.type === "Identifier" ||
      node.property.type === "PrivateIdentifier")) {
    return node.property.name;
  }
  if (node.computed && node.property.type === "Literal" &&
      (typeof node.property.value === "string" ||
       typeof node.property.value === "number")) {
    return String(node.property.value);
  }
  if (node.computed && node.property.type === "TemplateLiteral" &&
      node.property.expressions.length === 0) {
    return node.property.quasis[0].value.cooked;
  }
  if (node.computed) return staticString(node.property);
  return null;
}

function staticString(node) {
  if (node.type === "Literal" &&
      (typeof node.value === "string" || typeof node.value === "number")) {
    return String(node.value);
  }
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0].value.cooked;
  }
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = staticString(node.left);
    const right = staticString(node.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function locationOf(file, node) {
  return {
    column: node.loc.start.column + 1,
    file,
    line: node.loc.start.line,
  };
}

function canonicalViolations(values) {
  const seen = new Set();
  return values
    .sort((left, right) =>
      left.file.localeCompare(right.file) ||
      left.line - right.line ||
      left.column - right.column ||
      left.capability.localeCompare(right.capability) ||
      left.expression.localeCompare(right.expression)
    )
    .filter((value) => {
      const key = JSON.stringify(value);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function forbiddenCapability(path) {
  if (path === null) return null;
  if (DIRECT_FORBIDDEN.has(path)) return DIRECT_FORBIDDEN.get(path);
  if (path === "global.Math.*") return "ambient randomness";
  if (path === "global.process.*") return "wall-clock time";
  if (path === "global.Temporal.*") return "wall-clock time";
  if (path === "global.*") return "ambient nondeterminism";
  if (path.startsWith("global.Date.")) return "wall-clock time";
  if (path.startsWith("global.performance.")) return "wall-clock time";
  if (path.startsWith("global.Temporal.Now.")) return "wall-clock time";
  if (path.startsWith("global.process.hrtime.")) return "wall-clock time";
  if (path.startsWith("global.process.uptime.")) return "wall-clock time";
  if (path.startsWith("global.process.binding") ||
      path.startsWith("global.process._linkedBinding") ||
      path.startsWith("global.process.getBuiltinModule")) {
    return "native module acquisition";
  }
  if (path.startsWith("global.crypto.")) return "ambient randomness";
  if (path.startsWith("module:crypto.")) return "ambient randomness";
  if (path === "module:crypto") return "ambient randomness";
  if (path.startsWith("module:perf_hooks")) return "wall-clock time";
  if (path.startsWith("module:timers")) return "timers";
  if (path === "module:module" || path.startsWith("module:module.")) {
    return "native module acquisition";
  }
  return null;
}

function expressionLabel(path) {
  return path
    .replace(/^global\./, "")
    .replace(/^module:/, "module ");
}

class Analyzer {
  constructor(file) {
    this.file = file;
    this.scopes = [{ bindings: new Map(), type: "function" }];
    this.violations = [];
    this.nodeCount = 0;
    this.bindingCount = 0;
  }

  pushScope(type = "block") {
    this.scopes.push({ bindings: new Map(), type });
  }

  popScope() {
    this.scopes.pop();
  }

  values(...items) {
    return new Set(items.filter((item) => item !== null));
  }

  merge(...sets) {
    return new Set(sets.flatMap((set) => [...set]));
  }

  strings(value) {
    return [...value]
      .filter((item) => item.startsWith("string:"))
      .map((item) => item.slice("string:".length));
  }

  capabilities(value) {
    return [...value].filter((item) => !item.startsWith("string:"));
  }

  declare(name, value, kind = "lexical") {
    let scope = this.scopes.at(-1);
    if (kind === "var") {
      scope = [...this.scopes].reverse().find((candidate) =>
        candidate.type === "function"
      );
    }
    if (scope.bindings.has(name)) {
      scope.bindings.set(name, this.merge(scope.bindings.get(name), value));
      return;
    }
    this.bindingCount += 1;
    if (this.bindingCount > GUARD_LIMITS.maxBindings) {
      throw new NondeterminismGuardError(
        `${this.file} exceeds ${GUARD_LIMITS.maxBindings} bindings`,
        { code: "BINDING_LIMIT" },
      );
    }
    scope.bindings.set(name, value);
  }

  assign(name, value) {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      const bindings = this.scopes[index].bindings;
      if (bindings.has(name)) {
        bindings.set(name, this.merge(bindings.get(name), value));
        return;
      }
    }
    this.scopes[0].bindings.set(name, value);
  }

  lookup(name) {
    for (let index = this.scopes.length - 1; index >= 0; index -= 1) {
      if (this.scopes[index].bindings.has(name)) {
        return this.scopes[index].bindings.get(name);
      }
    }
    if ([
      "Date", "Math", "Reflect", "Temporal", "crypto", "performance",
      "process", "requestAnimationFrame", "setImmediate", "setInterval",
      "setTimeout",
    ].includes(name)) {
      return this.values(`global.${name}`);
    }
    if (name === "globalThis" || name === "global") return this.values("global");
    if (name === "require") return this.values("loader:require");
    return this.values();
  }

  report(node, value) {
    for (const path of this.capabilities(value)) {
      const capability = forbiddenCapability(path);
      if (capability === null) continue;
      this.violations.push({
        ...locationOf(this.file, node),
        capability,
        expression: expressionLabel(path),
      });
    }
  }

  destructure(pattern, value, node = pattern, kind = "lexical") {
    const resolvedValue = value ?? this.values();
    if (pattern.type === "Identifier") {
      this.declare(pattern.name, resolvedValue, kind);
      this.report(node, resolvedValue);
      return;
    }
    if (pattern.type === "AssignmentPattern") {
      this.destructure(pattern.left, resolvedValue, node, kind);
      this.visit(pattern.right);
      return;
    }
    if (pattern.type === "RestElement") {
      this.destructure(pattern.argument, this.values(), node, kind);
      return;
    }
    if (pattern.type === "ArrayPattern") {
      for (const element of pattern.elements) {
        if (element !== null) {
          this.destructure(element, this.values(), element, kind);
        }
      }
      return;
    }
    if (pattern.type === "ObjectPattern") {
      for (const property of pattern.properties) {
        if (property.type === "RestElement") {
          this.destructure(property.argument, this.values(), property, kind);
          continue;
        }
        if (property.computed) this.visit(property.key);
        const key = property.computed
          ? staticProperty({ computed: true, property: property.key })
          : property.key.name ?? String(property.key.value);
        const child = key === null
          ? this.values()
          : this.values(...this.capabilities(resolvedValue).map((item) => `${item}.${key}`));
        this.destructure(property.value, child, property, kind);
      }
    }
  }

  evaluate(node, { report = true } = {}) {
    if (node === null || node === undefined) return this.values();
    if (node.type === "ChainExpression") {
      return this.evaluate(node.expression, { report });
    }
    if (node.type === "BinaryExpression" && node.operator === "+") {
      const left = this.evaluate(node.left, { report });
      const right = this.evaluate(node.right, { report });
      return this.values(...this.strings(left).flatMap((leftValue) =>
        this.strings(right).map((rightValue) =>
          `string:${leftValue}${rightValue}`
        )
      ));
    }
    if (node.type === "Literal" || node.type === "TemplateLiteral" ||
        node.type === "BinaryExpression") {
      const value = staticString(node);
      if (value !== null) return this.values(`string:${value}`);
      this.visitChildren(node);
      return this.values();
    }
    if (node.type === "Identifier") {
      const value = this.lookup(node.name);
      if (report) this.report(node, value);
      return value;
    }
    if (node.type === "MemberExpression") {
      const base = this.evaluate(node.object, { report: false });
      if (node.computed) this.visit(node.property);
      const key = staticProperty(node);
      const value = this.values();
      for (const item of this.capabilities(base)) {
        const sensitiveDynamicBase = item === "global" ||
          item === "global.Math" ||
          item === "global.process" ||
          item === "global.Temporal" ||
          item === "global.crypto";
        if (key !== null) value.add(`${item}.${key}`);
        else if (sensitiveDynamicBase) value.add(`${item}.*`);
      }
      if (report) this.report(node, value);
      return value;
    }
    if (node.type === "ImportExpression") {
      const source = this.evaluate(node.source);
      const result = this.values();
      for (const moduleName of this.strings(source)) {
        if (FORBIDDEN_MODULES.has(moduleName)) {
          result.add(`module:${moduleName.replace(/^node:/, "")}`);
        }
      }
      this.report(node, result);
      return result;
    }
    if (node.type === "CallExpression" || node.type === "NewExpression") {
      const callee = this.evaluate(node.callee);
      const argumentsValues = node.arguments.map((argument) =>
        this.evaluate(argument.type === "SpreadElement" ? argument.argument : argument)
      );
      const result = this.values();
      if (callee.has("loader:require") && argumentsValues.length === 1) {
        for (const moduleName of this.strings(argumentsValues[0])) {
          if (FORBIDDEN_MODULES.has(moduleName)) {
            result.add(`module:${moduleName.replace(/^node:/, "")}`);
          }
        }
      }

      let reflectArguments = null;
      if (callee.has("global.Reflect.get") && argumentsValues.length >= 2) {
        reflectArguments = [argumentsValues[0], argumentsValues[1]];
      } else if (callee.has("global.Reflect.get.call") &&
                 argumentsValues.length >= 3) {
        reflectArguments = [argumentsValues[1], argumentsValues[2]];
      } else if (callee.has("global.Reflect.get.apply") &&
                 node.arguments.length >= 2 &&
                 node.arguments[1].type === "ArrayExpression" &&
                 node.arguments[1].elements.length >= 2) {
        reflectArguments = [
          this.evaluate(node.arguments[1].elements[0], { report: false }),
          this.evaluate(node.arguments[1].elements[1], { report: false }),
        ];
      } else if (callee.has("global.Reflect.apply") &&
                 node.arguments.length >= 3 &&
                 argumentsValues[0].has("global.Reflect.get") &&
                 node.arguments[2].type === "ArrayExpression" &&
                 node.arguments[2].elements.length >= 2) {
        reflectArguments = [
          this.evaluate(node.arguments[2].elements[0], { report: false }),
          this.evaluate(node.arguments[2].elements[1], { report: false }),
        ];
      } else if (callee.has("global.Reflect.apply.call") &&
                 node.arguments.length >= 4 &&
                 argumentsValues[1].has("global.Reflect.get") &&
                 node.arguments[3].type === "ArrayExpression" &&
                 node.arguments[3].elements.length >= 2) {
        reflectArguments = [
          this.evaluate(node.arguments[3].elements[0], { report: false }),
          this.evaluate(node.arguments[3].elements[1], { report: false }),
        ];
      }
      if (reflectArguments !== null) {
        const [targets, keys] = reflectArguments;
        const staticKeys = this.strings(keys);
        for (const target of this.capabilities(targets)) {
          const sensitive = target === "global" ||
            target === "global.Math" ||
            target === "global.process" ||
            target === "global.Temporal" ||
            target === "global.crypto";
          if (staticKeys.length > 0) {
            for (const key of staticKeys) result.add(`${target}.${key}`);
          } else if (sensitive) {
            result.add(`${target}.*`);
          }
        }
      }
      this.report(node, result);
      return result;
    }
    if (node.type === "ConditionalExpression") {
      this.visit(node.test);
      return this.merge(
        this.evaluate(node.consequent, { report }),
        this.evaluate(node.alternate, { report }),
      );
    }
    if (node.type === "LogicalExpression") {
      return this.merge(
        this.evaluate(node.left, { report }),
        this.evaluate(node.right, { report }),
      );
    }
    if (node.type === "SequenceExpression") {
      for (const expression of node.expressions.slice(0, -1)) {
        this.visit(expression);
      }
      return this.evaluate(node.expressions.at(-1), { report });
    }
    if (node.type === "AwaitExpression" || node.type === "YieldExpression") {
      return this.evaluate(node.argument, { report });
    }
    if (node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression") {
      this.visitFunction(node);
      return this.values();
    }
    if (node.type === "ClassExpression") {
      this.visitClass(node);
      return this.values();
    }
    this.visitChildren(node);
    return this.values();
  }

  predeclare(body) {
    for (const statement of body) {
      if (statement.type === "VariableDeclaration" && statement.kind !== "var") {
        for (const declaration of statement.declarations) {
          this.declarePattern(declaration.id, statement.kind);
        }
      } else if (statement.type === "ClassDeclaration" && statement.id !== null) {
        this.declare(statement.id.name, this.values());
      } else if (statement.type === "FunctionDeclaration" &&
                 statement.id !== null) {
        this.declare(statement.id.name, this.values());
      }
    }
  }

  declarePattern(pattern, kind) {
    if (pattern.type === "Identifier") {
      this.declare(pattern.name, this.values(), kind);
    } else if (pattern.type === "AssignmentPattern") {
      this.declarePattern(pattern.left, kind);
    } else if (pattern.type === "RestElement") {
      this.declarePattern(pattern.argument, kind);
    } else if (pattern.type === "ArrayPattern") {
      for (const element of pattern.elements) {
        if (element !== null) this.declarePattern(element, kind);
      }
    } else if (pattern.type === "ObjectPattern") {
      for (const property of pattern.properties) {
        this.declarePattern(
          property.type === "RestElement" ? property.argument : property.value,
          kind,
        );
      }
    }
  }

  hoistVars(node) {
    if (node === null || typeof node !== "object") return;
    if (node.type === "FunctionDeclaration" ||
        node.type === "FunctionExpression" ||
        node.type === "ArrowFunctionExpression") return;
    if (node.type === "VariableDeclaration" && node.kind === "var") {
      for (const declaration of node.declarations) {
        this.declarePattern(declaration.id, "var");
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      if (Array.isArray(value)) {
        for (const child of value) this.hoistVars(child);
      } else if (value && typeof value === "object") {
        this.hoistVars(value);
      }
    }
  }

  visit(node) {
    if (node === null || node === undefined || typeof node !== "object") return;
    this.nodeCount += 1;
    if (this.nodeCount > GUARD_LIMITS.maxAstNodes) {
      throw new NondeterminismGuardError(
        `${this.file} exceeds ${GUARD_LIMITS.maxAstNodes} AST nodes`,
        { code: "AST_NODE_LIMIT" },
      );
    }
    switch (node.type) {
      case "Program":
      case "BlockStatement":
        if (node.type === "BlockStatement") this.pushScope();
        this.predeclare(node.body);
        if (node.type === "Program") this.hoistVars(node);
        for (const statement of node.body) this.visit(statement);
        if (node.type === "BlockStatement") this.popScope();
        break;
      case "ImportDeclaration": {
        const moduleName = node.source.value;
        const prohibited = FORBIDDEN_MODULES.has(moduleName);
        const modulePath = moduleName.replace(/^node:/, "");
        if (prohibited) this.report(node, `module:${modulePath}`);
        for (const specifier of node.specifiers) {
          let value = null;
          if (prohibited) {
            if (specifier.type === "ImportSpecifier") {
              value = `module:${modulePath}.${specifier.imported.name ??
                specifier.imported.value}`;
            } else {
              value = `module:${modulePath}`;
            }
          }
          this.declare(
            specifier.local.name,
            value === null ? this.values() : this.values(value),
          );
        }
        break;
      }
      case "VariableDeclaration":
        for (const declaration of node.declarations) {
          const value = declaration.init === null
            ? this.values()
            : this.evaluate(declaration.init);
          this.destructure(declaration.id, value, declaration, node.kind);
        }
        break;
      case "AssignmentExpression": {
        const value = this.evaluate(node.right);
        if (node.left.type === "Identifier" && node.operator === "=") {
          this.assign(node.left.name, value);
          this.report(node, value);
        } else if (node.left.type === "ObjectPattern" ||
                   node.left.type === "ArrayPattern") {
          this.destructure(node.left, value, node);
        } else {
          this.visit(node.left);
        }
        break;
      }
      case "FunctionDeclaration":
        this.visitFunction(node);
        break;
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        this.visitFunction(node);
        break;
      case "ClassDeclaration":
      case "ClassExpression":
        this.visitClass(node);
        break;
      case "StaticBlock":
        // A static initialization block owns both its lexical declarations
        // and its `var` declarations; model it as a var-scope boundary.
        this.pushScope("function");
        this.predeclare(node.body);
        this.hoistVars(node);
        for (const statement of node.body) this.visit(statement);
        this.popScope();
        break;
      case "Property":
        if (node.computed) this.visit(node.key);
        this.visit(node.value);
        break;
      case "CatchClause":
        this.pushScope();
        if (node.param !== null) this.destructure(node.param, null);
        this.visit(node.body);
        this.popScope();
        break;
      case "MemberExpression":
      case "ChainExpression":
      case "CallExpression":
      case "NewExpression":
      case "ImportExpression":
      case "Identifier":
        this.evaluate(node);
        break;
      default:
        this.visitChildren(node);
    }
  }

  visitFunction(node) {
    this.pushScope("function");
    if (node.id !== null && node.id !== undefined) {
      this.declare(node.id.name, this.values());
    }
    for (const parameter of node.params) {
      this.declarePattern(parameter, "lexical");
    }
    for (const parameter of node.params) {
      this.destructure(parameter, this.values());
    }
    this.hoistVars(node.body);
    this.visit(node.body);
    this.popScope();
  }

  visitClass(node) {
    if (node.superClass !== null) this.visit(node.superClass);
    this.pushScope();
    if (node.id !== null && node.id !== undefined) {
      this.declare(node.id.name, this.values());
    }
    this.visit(node.body);
    this.popScope();
  }

  visitChildren(node) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end" ||
          key === "type" || key === "range") continue;
      if (Array.isArray(value)) {
        for (const child of value) {
          if (child && typeof child.type === "string") this.visit(child);
        }
      } else if (value && typeof value.type === "string") {
        this.visit(value);
      }
    }
  }
}

export function analyzeModuleSource(source, { file = "<source>" } = {}) {
  if (typeof source !== "string") {
    throw new TypeError("module source must be a string");
  }
  if (typeof file !== "string" || file.length === 0) {
    throw new TypeError("file must be a non-empty string");
  }
  const tree = parseModule(source, file);
  const analyzer = new Analyzer(file);
  analyzer.visit(tree);
  return Object.freeze(canonicalViolations(analyzer.violations).map(Object.freeze));
}

export function assertDeterministicSources(sources) {
  if (!Array.isArray(sources) || sources.length > GUARD_LIMITS.maxFiles) {
    throw new NondeterminismGuardError(
      `source set must contain at most ${GUARD_LIMITS.maxFiles} files`,
      { code: "FILE_COUNT_LIMIT" },
    );
  }
  const violations = [];
  const names = new Set();
  for (const entry of sources) {
    if (entry === null || typeof entry !== "object" ||
        typeof entry.file !== "string" || typeof entry.source !== "string") {
      throw new TypeError("each source must have string file and source fields");
    }
    if (names.has(entry.file)) {
      throw new TypeError(`duplicate source file ${entry.file}`);
    }
    names.add(entry.file);
    violations.push(...analyzeModuleSource(entry.source, { file: entry.file }));
  }
  const canonical = canonicalViolations(violations);
  if (canonical.length !== 0) {
    throw new NondeterminismGuardError(
      `${canonical.length} nondeterministic capability access(es) found`,
      { code: "NONDETERMINISTIC_CAPABILITY", violations: canonical },
    );
  }
  return Object.freeze({
    files: sources.length,
    violations: Object.freeze([]),
  });
}

function commonDirectory(paths) {
  let root = dirname(paths[0]);
  for (const path of paths.slice(1)) {
    while (path !== root && !path.startsWith(`${root}${sep}`)) {
      const parent = dirname(root);
      if (parent === root) break;
      root = parent;
    }
  }
  return realpathSync(root);
}

function graphModuleSpecifiers(tree) {
  const bindings = new Map();
  const resolveString = (node) => {
    if (node?.type === "Identifier") return bindings.get(node.name) ?? null;
    if (node?.type === "BinaryExpression" && node.operator === "+") {
      const left = resolveString(node.left);
      const right = resolveString(node.right);
      return left === null || right === null ? null : left + right;
    }
    return staticString(node);
  };
  for (const statement of tree.body) {
    if (statement.type !== "VariableDeclaration") continue;
    for (const declaration of statement.declarations) {
      if (declaration.id.type !== "Identifier" || declaration.init === null) continue;
      const value = resolveString(declaration.init);
      if (value !== null) bindings.set(declaration.id.name, value);
    }
  }
  const specifiers = [];
  const walk = (node) => {
    if (node === null || typeof node !== "object") return;
    if ((node.type === "ImportDeclaration" ||
         node.type === "ExportNamedDeclaration" ||
         node.type === "ExportAllDeclaration") && node.source !== null) {
      specifiers.push(String(node.source.value));
    } else if (node.type === "ImportExpression") {
      const value = resolveString(node.source);
      if (value !== null) specifiers.push(value);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "start" || key === "end") continue;
      if (Array.isArray(value)) {
        for (const child of value) walk(child);
      } else if (value && typeof value === "object") {
        walk(value);
      }
    }
  };
  walk(tree);
  return specifiers;
}

function graphAllowedPaths(root) {
  if (root === SIMULATION_GRAPH_ROOT) {
    // The simulation may consume these dependency-direction-neutral,
    // deterministic authorities. Do not admit the rest of src/shared: an
    // import escape must remain outside the simulation closure.
    return { directories: [root], files: [SIMULATION_NEUTRAL_MODULE,
      SIMULATION_PROJECTILE_DELIVERY_MODULE] };
  }
  return { directories: [root], files: [] };
}

function collectLocalModuleGraph(
  entryPaths,
  rootPath = commonDirectory(entryPaths),
  allowedPathPolicy = graphAllowedPaths(realpathSync(rootPath)),
) {
  const root = realpathSync(rootPath);
  const allowedDirectories = allowedPathPolicy.directories.map((path) => realpathSync(path));
  const allowedFiles = allowedPathPolicy.files.map((path) => resolve(path));
  const pending = entryPaths.map((path) => ({ depth: 0, path }));
  const sources = [];
  const paths = [];
  const seen = new Set();
  let totalBytes = 0;
  while (pending.length > 0) {
    const { depth, path } = pending.pop();
    if (depth > GUARD_LIMITS.maxGraphDepth) {
      throw new NondeterminismGuardError(
        `${path} exceeds dependency depth ${GUARD_LIMITS.maxGraphDepth}`,
        { code: "GRAPH_DEPTH_LIMIT" },
      );
    }
    const resolvedPath = realpathSync(path);
    const allowed = allowedDirectories.some((allowedDirectory) =>
      resolvedPath === allowedDirectory || resolvedPath.startsWith(`${allowedDirectory}${sep}`)) ||
      allowedFiles.includes(resolvedPath);
    if (!allowed) {
      throw new NondeterminismGuardError(
        `${path} resolves outside module graph root ${root}`,
        { code: "GRAPH_ROOT_ESCAPE" },
      );
    }
    if (seen.has(resolvedPath)) continue;
    seen.add(resolvedPath);
    if (seen.size > GUARD_LIMITS.maxFiles) {
      throw new NondeterminismGuardError(
        `module graph exceeds ${GUARD_LIMITS.maxFiles} files`,
        { code: "FILE_COUNT_LIMIT" },
      );
    }
    const source = readFileSync(resolvedPath, "utf8");
    totalBytes += Buffer.byteLength(source, "utf8");
    if (totalBytes > GUARD_LIMITS.maxTotalSourceBytes) {
      throw new NondeterminismGuardError(
        `module graph exceeds ${GUARD_LIMITS.maxTotalSourceBytes} source bytes`,
        { code: "TOTAL_SOURCE_SIZE_LIMIT" },
      );
    }
    const tree = parseModule(source, resolvedPath);
    paths.push(resolvedPath);
    sources.push({ file: relative(root, resolvedPath), source });
    for (const specifier of graphModuleSpecifiers(tree)) {
      if (!specifier.startsWith(".") && !specifier.startsWith("/")) continue;
      const dependency = resolve(dirname(resolvedPath), specifier);
      pending.push({ depth: depth + 1, path: dependency });
    }
  }
  paths.sort();
  sources.sort((left, right) => left.file.localeCompare(right.file));
  return { paths, root, sources };
}

export async function simulationSourceFiles(directory) {
  const root = await realpath(directory);
  const entries = await readdir(root, { recursive: true });
  const paths = entries
    .filter((entry) => extname(entry) === ".js")
    .map((entry) => join(root, entry))
    .sort();
  if (paths.length > GUARD_LIMITS.maxFiles) {
    throw new NondeterminismGuardError(
      `${root} exceeds ${GUARD_LIMITS.maxFiles} JavaScript files`,
      { code: "FILE_COUNT_LIMIT" },
    );
  }
  return paths;
}

export async function guardSimulationDirectory(directory) {
  const paths = await simulationSourceFiles(directory);
  const directoryPath = directory instanceof URL
    ? fileURLToPath(directory)
    : directory;
  const graph = collectLocalModuleGraph(paths, resolve(directoryPath));
  const result = assertDeterministicSources(graph.sources);
  probeModuleGraph(graph.paths, { audited: true, root: graph.root });
  return Object.freeze({ ...result, runtimeProbed: graph.paths.length });
}

function runtimePayload(paths) {
  return JSON.stringify({ paths });
}

export function probeModuleGraph(paths, { audited = false, root } = {}) {
  if (!Array.isArray(paths) || paths.length === 0 ||
      paths.length > GUARD_LIMITS.maxFiles ||
      paths.some((path) => typeof path !== "string" || !isAbsolute(path))) {
    throw new TypeError("runtime probe paths must be a non-empty bounded list of absolute paths");
  }
  try {
    const graph = collectLocalModuleGraph(paths, root);
    const child = spawnSync(
      process.execPath,
      [
        "--no-warnings",
        "--experimental-vm-modules",
        fileURLToPath(import.meta.url),
        "--probe",
      ],
      {
        encoding: "utf8",
        input: runtimePayload(graph.paths),
        maxBuffer: 1024 * 1024,
        timeout: 10_000,
      },
    );
    if (child.error) throw child.error;
    if (child.status !== 0) {
      throw new Error(child.stderr.trim() || `probe exited ${child.status}`);
    }
    const result = JSON.parse(child.stdout);
    if (result.status !== "ok" || result.modules < graph.paths.length) {
      throw new Error("runtime probe returned an invalid result");
    }
    if (!audited) assertDeterministicSources(graph.sources);
    return Object.freeze(result);
  } catch (error) {
    throw new NondeterminismGuardError(
      `capability-boundary runtime probe failed: ${error.message}`,
      { code: "RUNTIME_CAPABILITY_VIOLATION" },
    );
  }
}

function denied(name) {
  const fail = () => {
    throw new Error(`denied nondeterministic capability: ${name}`);
  };
  return new Proxy(fail, {
    apply: fail,
    construct: fail,
    get: fail,
    getOwnPropertyDescriptor: fail,
    has: fail,
    ownKeys: fail,
    set: fail,
  });
}

function safeMath() {
  const copy = Object.create(null);
  for (const key of Reflect.ownKeys(Math)) {
    const descriptor = Object.getOwnPropertyDescriptor(Math, key);
    if (key === "random") {
      Object.defineProperty(copy, key, {
        configurable: false,
        enumerable: false,
        value: denied("Math.random"),
        writable: false,
      });
    } else {
      Object.defineProperty(copy, key, descriptor);
    }
  }
  return Object.freeze(copy);
}

async function runProbe(paths) {
  const context = vm.createContext({
    Date: denied("Date"),
    Math: safeMath(),
    Temporal: denied("Temporal"),
    TextDecoder,
    TextEncoder,
    crypto: denied("crypto"),
    performance: denied("performance"),
    process: new Proxy(Object.create(null), {
      get(_target, key) {
        if (key === "hrtime" || key === "uptime") {
          throw new Error(`denied nondeterministic capability: process.${String(key)}`);
        }
        return undefined;
      },
    }),
    requestAnimationFrame: denied("requestAnimationFrame"),
    setImmediate: denied("setImmediate"),
    setInterval: denied("setInterval"),
    setTimeout: denied("setTimeout"),
  });
  const modules = new Map();
  async function load(path) {
    const resolvedPath = await realpath(path);
    if (modules.has(resolvedPath)) return modules.get(resolvedPath);
    const source = readFileSync(resolvedPath, "utf8");
    boundedTokens(source, resolvedPath);
    const module = new vm.SourceTextModule(source, {
      context,
      identifier: pathToFileURL(resolvedPath).href,
      initializeImportMeta(meta) {
        meta.url = pathToFileURL(resolvedPath).href;
      },
    });
    modules.set(resolvedPath, module);
    return module;
  }
  const linker = async (specifier, referencingModule) => {
    if (!specifier.startsWith(".")) {
      throw new Error(`runtime probe denies external import ${specifier}`);
    }
    const parent = fileURLToPath(referencingModule.identifier);
    return load(resolve(dirname(parent), specifier));
  };
  for (const path of [...paths].sort()) {
    const module = await load(path);
    if (module.status === "unlinked") await module.link(linker);
    if (module.status === "linked") await module.evaluate({ timeout: 1_000 });
  }
  return { modules: modules.size, status: "ok" };
}

async function probeMain() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const payload = JSON.parse(input);
  const result = await runProbe(payload.paths);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url) &&
    process.argv[2] === "--probe") {
  probeMain().catch((error) => {
    process.stderr.write(`${errorCode(error)}: ${error.message}\n`);
    process.exitCode = 1;
  });
}
