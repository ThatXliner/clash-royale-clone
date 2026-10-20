import assert from "node:assert/strict";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { basename, extname, join } from "node:path";
import test from "node:test";

import {
  createCardCatalog,
  secondsToTicksExact,
  tilesToMillitilesExact,
  validateCardDefinition,
} from "../src/content/index.js";
import {
  protectedIdentityHits,
  referencePathHits,
} from "./helpers/protected-identity-scan.js";

const ROOT = new URL("../", import.meta.url).pathname;

function combat(overrides = {}) {
  return {
    hitpoints: 640,
    damage: 88,
    hitSpeedTicks: 24,
    firstHitTicks: 10,
    deployTimeTicks: 20,
    rangeMillitiles: 750,
    sightRangeMillitiles: 5_500,
    movementMillitilesPerSecond: 1_000,
    targetMode: "ground",
    count: 1,
    areaDamageRadiusMillitiles: null,
    ...overrides,
  };
}

function card(overrides = {}) {
  return {
    id: "ember-warden",
    displayName: "Ember Warden",
    cost: 4,
    kind: "unit",
    rarity: "special",
    ...combat(),
    components: [],
    ...overrides,
  };
}

function component(overrides = {}) {
  return {
    id: "moss-captain",
    displayName: "Moss Captain",
    kind: "unit",
    role: "primary",
    ...combat({ count: 1 }),
    ...overrides,
  };
}

test("content schema: original unit definitions retain native units and nulls", () => {
  const input = card({
    hitpoints: null,
    damage: null,
    firstHitTicks: 0,
    movementMillitilesPerSecond: null,
    rangeMillitiles: 0,
  });
  const validated = validateCardDefinition(input);

  assert.deepEqual(validated, input);
  assert.equal(validated.hitSpeedTicks, 24);
  assert.equal(validated.rangeMillitiles, 0);
  assert.equal(validated.hitpoints, null);
  assert.equal(validated.damage, null);
  assert.equal(validated.firstHitTicks, 0);
  assert.equal(validated.movementMillitilesPerSecond, null);
  assert.equal("hit_speed_seconds" in validated, false);
  assert.equal("range_tiles" in validated, false);
});

test("content schema: structures and effects use explicit zero/null semantics", () => {
  const structure = validateCardDefinition(card({
    id: "quartz-pylon",
    displayName: "Quartz Pylon",
    kind: "structure",
    movementMillitilesPerSecond: 0,
  }));
  const effect = validateCardDefinition(card({
    id: "luminous-drift",
    displayName: "Luminous Drift",
    kind: "effect",
    hitpoints: null,
    movementMillitilesPerSecond: null,
    damage: 112,
    targetMode: "ground-and-air",
  }));

  assert.equal(structure.movementMillitilesPerSecond, 0);
  assert.equal(effect.hitpoints, null);
  assert.equal(effect.movementMillitilesPerSecond, null);
  assert.equal(effect.damage, 112);
});

test("content schema: mixed initial components expose one matching primary", () => {
  const primary = component();
  const secondary = component({
    id: "moss-scout",
    displayName: "Moss Scout",
    role: "secondary",
    count: 2,
    hitpoints: 240,
    damage: 44,
    hitSpeedTicks: 18,
    firstHitTicks: 8,
    rangeMillitiles: 4_500,
  });
  const spawn = component({
    id: "spore-wisp",
    displayName: "Spore Wisp",
    role: "spawn-over-time",
    count: 3,
    hitpoints: 90,
    damage: 20,
    hitSpeedTicks: 20,
    firstHitTicks: 6,
    movementMillitilesPerSecond: 1_500,
    targetMode: "ground-and-air",
  });
  const mixed = validateCardDefinition(card({
    id: "moss-patrol",
    displayName: "Moss Patrol",
    count: 3,
    components: [primary, secondary, spawn],
  }));

  assert.equal(mixed.components[0].role, "primary");
  assert.equal(mixed.count, 3);
  assert.equal(mixed.hitpoints, mixed.components[0].hitpoints);
  assert.equal(mixed.components[2].count, 3);
});

test("content schema: spawn-only effects need no fictional primary entity", () => {
  const spawned = component({
    id: "cinder-sprite",
    displayName: "Cinder Sprite",
    role: "spawn",
  });
  const definition = card({
    id: "cinder-call",
    displayName: "Cinder Call",
    kind: "effect",
    hitpoints: null,
    movementMillitilesPerSecond: null,
    damage: null,
    hitSpeedTicks: null,
    firstHitTicks: null,
    rangeMillitiles: null,
    sightRangeMillitiles: null,
    targetMode: "none",
    components: [spawned],
  });

  assert.deepEqual(validateCardDefinition(definition).components, [spawned]);
});

test("content schema: mixed counts and primary semantics are strict", () => {
  const primary = component();
  const secondary = component({
    id: "moss-scout",
    displayName: "Moss Scout",
    role: "secondary",
  });

  assert.throws(
    () => validateCardDefinition(card({
      count: 1,
      components: [primary, secondary],
    })),
    /count must equal/,
  );
  assert.throws(
    () => validateCardDefinition(card({
      count: 2,
      damage: 89,
      components: [primary, secondary],
    })),
    /damage must match/,
  );
  assert.throws(
    () => validateCardDefinition(card({
      count: 1,
      components: [secondary],
    })),
    /exactly one primary/,
  );
  assert.throws(
    () => validateCardDefinition(card({
      count: 2,
      components: [
        primary,
        {
          ...primary,
          id: "other-primary",
          displayName: "Other Primary",
          count: 1,
        },
      ],
    })),
    /exactly one primary/,
  );
});

test("content schema: catalog order, identities, and returned values are isolated", () => {
  const first = card();
  const second = card({
    id: "azure-herald",
    displayName: "Azure Herald",
  });
  const catalog = createCardCatalog([first, second]);

  assert.deepEqual(catalog.map(({ id }) => id), [
    "azure-herald",
    "ember-warden",
  ]);
  first.hitpoints = 1;
  second.components.push(component());
  catalog[0].hitpoints = 2;
  catalog[1].components.push(component());

  const fresh = createCardCatalog([
    card(),
    card({ id: "azure-herald", displayName: "Azure Herald" }),
  ]);
  assert.equal(fresh[0].hitpoints, 640);
  assert.deepEqual(fresh[1].components, []);

  assert.throws(
    () => createCardCatalog([card(), card()]),
    /duplicate card id/,
  );
  assert.throws(
    () => createCardCatalog([
      card(),
      card({ id: "other-id", displayName: "ember warden" }),
    ]),
    /duplicate card display name/,
  );
});

test("content schema: component identities are unique within a definition", () => {
  const primary = component();
  assert.throws(
    () => validateCardDefinition(card({
      count: 2,
      components: [
        primary,
        { ...primary, role: "secondary" },
      ],
    })),
    /component ids and display names must be unique/,
  );
  assert.throws(
    () => validateCardDefinition(card({
      count: 2,
      components: [
        primary,
        {
          ...primary,
          id: "another-component",
          displayName: "moss captain",
          role: "secondary",
        },
      ],
    })),
    /component ids and display names must be unique/,
  );
});

test("content schema: exact own-property shapes reject hostile objects safely", () => {
  assert.throws(
    () => validateCardDefinition({ ...card(), surprise: true }),
    /exactly the required own properties/,
  );
  const missing = card();
  delete missing.damage;
  assert.throws(
    () => validateCardDefinition(missing),
    /exactly the required own properties/,
  );
  assert.throws(
    () => validateCardDefinition(Object.create(card())),
    /plain object/,
  );

  let getterRan = false;
  const getter = card();
  Object.defineProperty(getter, "damage", {
    enumerable: true,
    get() {
      getterRan = true;
      return 88;
    },
  });
  assert.throws(
    () => validateCardDefinition(getter),
    /enumerable data property/,
  );
  assert.equal(getterRan, false);

  const symbol = card();
  symbol[Symbol("hidden")] = true;
  assert.throws(
    () => validateCardDefinition(symbol),
    /exactly the required own properties/,
  );

  const nonEnumerable = card();
  Object.defineProperty(nonEnumerable, "damage", {
    enumerable: false,
    value: 88,
  });
  assert.throws(
    () => validateCardDefinition(nonEnumerable),
    /enumerable data property/,
  );
});

test("content schema: arrays must be dense, ordinary, and property-free", () => {
  const sparse = [];
  sparse.length = 1;
  assert.throws(
    () => validateCardDefinition(card({ components: sparse })),
    /dense/,
  );

  const extra = [];
  extra.note = true;
  assert.throws(
    () => validateCardDefinition(card({ components: extra })),
    /extra properties/,
  );

  class ComponentList extends Array {}
  assert.throws(
    () => validateCardDefinition(card({ components: new ComponentList() })),
    /plain array/,
  );
});

test("content schema: integers, enums, identities, and zero semantics are strict", () => {
  const invalid = [
    [card({ cost: 0 }), /between|>= 1/],
    [card({ cost: 11 }), /between 1 and 10/],
    [card({ hitpoints: 0 }), />= 1/],
    [card({ damage: 0 }), />= 1/],
    [card({ hitSpeedTicks: 0 }), />= 1/],
    [card({ sightRangeMillitiles: 0 }), />= 1/],
    [card({ areaDamageRadiusMillitiles: 0 }), />= 1/],
    [card({ count: 0 }), />= 1/],
    [card({ damage: Number.NaN }), /safe integer/],
    [card({ damage: Number.POSITIVE_INFINITY }), /safe integer/],
    [card({ damage: 1.5 }), /safe integer/],
    [card({ damage: Number.MAX_SAFE_INTEGER + 1 }), /safe integer/],
    [card({ id: "Not-Kebab" }), /kebab-case/],
    [card({ displayName: " Padded Name" }), /display name/],
    [card({ kind: "troop" }), /must be one of/],
    [card({ rarity: "legendary" }), /must be one of/],
    [card({ targetMode: "everything" }), /must be one of/],
  ];

  for (const [definition, expected] of invalid) {
    assert.throws(() => validateCardDefinition(definition), expected);
  }
});

test("content schema: kind-specific HP and movement semantics are enforced", () => {
  assert.equal(validateCardDefinition(card({ hitpoints: null })).hitpoints, null);
  assert.equal(
    validateCardDefinition(card({ movementMillitilesPerSecond: null }))
      .movementMillitilesPerSecond,
    null,
  );
  assert.throws(
    () => validateCardDefinition(card({
      kind: "structure",
      movementMillitilesPerSecond: 1,
    })),
    /structure movement/,
  );
  assert.throws(
    () => validateCardDefinition(card({
      kind: "effect",
      movementMillitilesPerSecond: null,
    })),
    /effect hitpoints and movement/,
  );
});

test("content schema: explicit conversion helpers reject inexact source values", () => {
  assert.equal(secondsToTicksExact(1.25), 75);
  assert.equal(secondsToTicksExact(0), 0);
  assert.equal(secondsToTicksExact(999 / 60), 999);
  assert.equal(secondsToTicksExact(1_000 / 60), 1_000);
  assert.equal(secondsToTicksExact(1_000_000 / 60), 1_000_000);
  assert.equal(tilesToMillitilesExact(4.5), 4_500);
  assert.equal(tilesToMillitilesExact(0), 0);

  assert.throws(() => secondsToTicksExact(0.01), /exactly representable/);
  assert.throws(() => secondsToTicksExact(-1), /exactly representable/);
  assert.throws(() => tilesToMillitilesExact(1 / 3), /exactly representable/);
  assert.throws(() => tilesToMillitilesExact(Number.NaN), /exactly representable/);
});

function adjacentNumber(value, direction) {
  if (Number.isNaN(value) || value === direction * Infinity) return value;
  if (value === 0) return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;

  const bits = new BigUint64Array(1);
  const number = new Float64Array(bits.buffer);
  number[0] = value;
  bits[0] += (value > 0) === (direction > 0) ? 1n : -1n;
  return number[0];
}

function localTickOracle(seconds, center, radius = 8) {
  const matches = [];
  const start = Math.max(0, center - radius);
  const end = Math.min(Number.MAX_SAFE_INTEGER, center + radius);
  for (let ticks = start; ticks <= end; ticks += 1) {
    if (ticks / 60 === seconds) matches.push(ticks);
  }
  return matches;
}

function assertMatchesLocalTickOracle(seconds, center, message) {
  const matches = localTickOracle(seconds, center);
  if (matches.length === 1) {
    assert.equal(secondsToTicksExact(seconds), matches[0], message);
  } else {
    assert.throws(
      () => secondsToTicksExact(seconds),
      /round-trip to one non-negative safe integer tick count/,
      message,
    );
  }
}

test("content schema: seconds use a unique safe tick-count round trip", () => {
  const tickCounts = new Set([
    0,
    1,
    2,
    3,
    59,
    60,
    61,
    999,
    1_000,
    1_000_000,
    2 ** 31 - 1,
    2 ** 32,
    2 ** 40,
    2 ** 48,
  ]);
  for (let index = 1; index <= 512; index += 1) {
    tickCounts.add(index * 104_729);
  }

  for (const ticks of tickCounts) {
    const seconds = ticks / 60;
    const aliasesPrevious = ticks > 0 && (ticks - 1) / 60 === seconds;
    const aliasesNext =
      ticks < Number.MAX_SAFE_INTEGER && (ticks + 1) / 60 === seconds;

    if (aliasesPrevious || aliasesNext) {
      assert.throws(
        () => secondsToTicksExact(seconds),
        /round-trip to one non-negative safe integer tick count/,
      );
    } else {
      assert.equal(secondsToTicksExact(seconds), ticks);
    }

    if (ticks > 0 && ticks <= 2 ** 40) {
      assert.throws(
        () => secondsToTicksExact(adjacentNumber(seconds, -1)),
        /round-trip to one non-negative safe integer tick count/,
      );
      assert.throws(
        () => secondsToTicksExact(adjacentNumber(seconds, 1)),
        /round-trip to one non-negative safe integer tick count/,
      );
    }
  }

  assert.throws(
    () => secondsToTicksExact(0.9833333333333334),
    /round-trip to one non-negative safe integer tick count/,
  );
  assert.throws(
    () => secondsToTicksExact(Number.MAX_SAFE_INTEGER),
    /round-trip to one non-negative safe integer tick count/,
  );
  assert.equal(
    secondsToTicksExact(Number.MAX_SAFE_INTEGER / 60),
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    secondsToTicksExact((Number.MAX_SAFE_INTEGER - 1) / 60),
    Number.MAX_SAFE_INTEGER - 1,
  );
  for (const ambiguousTicks of [
    Number.MAX_SAFE_INTEGER - 4,
    Number.MAX_SAFE_INTEGER - 3,
    Number.MAX_SAFE_INTEGER - 2,
  ]) {
    assert.throws(
      () => secondsToTicksExact(ambiguousTicks / 60),
      /round-trip to one non-negative safe integer tick count/,
    );
  }
  for (const invalid of [
    -Number.MIN_VALUE,
    -1,
    Number.NaN,
    Number.NEGATIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    "1",
    null,
    undefined,
  ]) {
    assert.throws(
      () => secondsToTicksExact(invalid),
      /round-trip to one non-negative safe integer tick count/,
    );
  }

  assert.equal(Object.is(secondsToTicksExact(-0), 0), true);
  assert.equal(tilesToMillitilesExact(4.5), 4_500);
  assert.throws(
    () => tilesToMillitilesExact(1 / 3),
    /exactly representable/,
  );
});

test("content schema: seconds conversion survives the 2^52 multiplication boundary", () => {
  const counterexample = 4_503_599_627_270_498;
  const seconds = counterexample / 60;

  assert.equal((counterexample - 1) / 60 === seconds, false);
  assert.equal((counterexample + 1) / 60 === seconds, false);
  assert.equal(Number.isInteger(seconds * 60), false);
  assert.equal(secondsToTicksExact(seconds), counterexample);

  for (let offset = -2_048; offset <= 2_048; offset += 1) {
    const ticks = 2 ** 52 + offset;
    assertMatchesLocalTickOracle(
      ticks / 60,
      ticks,
      `2^52 tick window offset ${offset}`,
    );
  }
});

test("content schema: seconds conversion agrees with a local quotient oracle", () => {
  const windows = [
    [0, 1_024],
    [2 ** 31 - 512, 1_024],
    [2 ** 40 - 512, 1_024],
    [2 ** 48 - 512, 1_024],
    [Number.MAX_SAFE_INTEGER - 1_024, 1_024],
  ];
  for (const [start, width] of windows) {
    for (let offset = 0; offset <= width; offset += 1) {
      const ticks = start + offset;
      const seconds = ticks / 60;
      assertMatchesLocalTickOracle(
        seconds,
        ticks,
        `oracle tick ${ticks}`,
      );
      for (const direction of [-1, 1]) {
        const adjacent = adjacentNumber(seconds, direction);
        assertMatchesLocalTickOracle(
          adjacent,
          ticks,
          `adjacent ${direction} from tick ${ticks}`,
        );
      }
    }
  }

  // Deterministic property samples span the complete safe-integer domain
  // without relying on ambient randomness.
  const domainSize = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
  let state = 0x6a09e667f3bcc909n;
  for (let index = 0; index < 2_048; index += 1) {
    state = (state * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n)
      % domainSize;
    const ticks = Number(state);
    const seconds = ticks / 60;
    assertMatchesLocalTickOracle(
      seconds,
      ticks,
      `property sample ${index} at tick ${ticks}`,
    );
    assertMatchesLocalTickOracle(
      adjacentNumber(seconds, -1),
      ticks,
      `property previous sample ${index} at tick ${ticks}`,
    );
    assertMatchesLocalTickOracle(
      adjacentNumber(seconds, 1),
      ticks,
      `property next sample ${index} at tick ${ticks}`,
    );
  }
});

test("content schema: quotient collisions are rejected across the safe range", () => {
  const collisionCenters = [
    4_503_599_627_270_495,
    2 ** 53 - 32,
    Number.MAX_SAFE_INTEGER - 4,
    Number.MAX_SAFE_INTEGER - 3,
    Number.MAX_SAFE_INTEGER - 2,
  ];
  for (const center of collisionCenters) {
    for (let offset = -8; offset <= 8; offset += 1) {
      const ticks = center + offset;
      if (!Number.isSafeInteger(ticks) || ticks < 0) continue;
      const seconds = ticks / 60;
      const matches = localTickOracle(seconds, ticks);
      if (matches.length > 1) {
        assert.throws(
          () => secondsToTicksExact(seconds),
          /round-trip to one non-negative safe integer tick count/,
          `collision at tick ${ticks}: ${matches.join(", ")}`,
        );
      }
    }
  }
});

function walkFiles(directory, predicate) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory).sort()) {
    const path = join(directory, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      files.push(...walkFiles(path, predicate));
    } else if (predicate(path)) {
      files.push(path);
    }
  }
  return files;
}

function benchmarkIdentityInputs() {
  const benchmarkPath = join(ROOT, "reference/stats/cards.json");
  const benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8"));
  return benchmark.cards.flatMap(({ key, name }) => [key, name]);
}

function unicodeEscape(value) {
  return [...value]
    .map((character) =>
      `\\u${character.codePointAt(0).toString(16).padStart(4, "0")}`
    )
    .join("");
}

function hexEscape(value) {
  return [...value]
    .map((character) =>
      `\\x${character.codePointAt(0).toString(16).padStart(2, "0")}`
    )
    .join("");
}

function mixedEscape(value) {
  return [...value]
    .map((character, index) => {
      const hex = character.codePointAt(0).toString(16);
      if (index % 3 === 0) return `\\u{${hex}}`;
      if (index % 3 === 1) return `\\u${hex.padStart(4, "0")}`;
      return `\\x${hex.padStart(2, "0")}`;
    })
    .join("");
}

function concatenate(value) {
  const first = Math.max(1, Math.floor(value.length / 3));
  const second = Math.max(first + 1, Math.floor(value.length * 2 / 3));
  return [
    JSON.stringify(value.slice(0, first)),
    JSON.stringify(value.slice(first, second)),
    JSON.stringify(value.slice(second)),
  ].join(" /* static */ +\n");
}

function concatenateEscaped(value) {
  const split = Math.max(1, Math.floor(value.length / 2));
  return `"${unicodeEscape(value.slice(0, split))}" + ` +
    `"${mixedEscape(value.slice(split))}"`;
}

test("content schema: shipped runtime is isolated from the benchmark corpus", () => {
  const identities = benchmarkIdentityInputs();
  assert.equal(identities.length, 218, "expected every card key and name");
  const protectedTokens = new Set(identities.map((value) =>
    value.toLowerCase()
  ));

  const shippedRoots = ["src", "dist", "build"].map((name) => join(ROOT, name));
  const shippedFiles = shippedRoots.flatMap((directory) =>
    walkFiles(directory, (path) =>
      [".js", ".mjs", ".cjs", ".json"].includes(extname(path))
    )
  );
  assert.ok(shippedFiles.length > 0, "expected shipped runtime files");

  for (const path of shippedFiles) {
    const source = readFileSync(path, "utf8");
    assert.deepEqual(
      referencePathHits(source),
      [],
      `${path} imports or embeds reference/`,
    );
    assert.deepEqual(
      protectedIdentityHits(source, protectedTokens),
      [],
      `${path} embeds a protected benchmark identity`,
    );
  }

  const configFiles = walkFiles(ROOT, (path) => {
    const name = basename(path);
    return (
      /^package(?:-lock)?\.json$/.test(name) ||
      /^(?:vite|webpack|rollup|esbuild|tsup)\.config\.[cm]?[jt]s$/.test(name)
    );
  }).filter((path) =>
    !path.includes(`${join(ROOT, "reference")}/`) &&
    !path.includes(`${join(ROOT, "node_modules")}/`) &&
    !path.includes(`${join(ROOT, ".git")}/`)
  );
  for (const path of configFiles) {
    assert.deepEqual(
      referencePathHits(readFileSync(path, "utf8")),
      [],
      `${path} configures reference/ for bundling`,
    );
  }

  let detectedInjections = 0;
  for (const identity of identities) {
    const caseVaried = [...identity]
      .map((character, index) =>
        index % 2 === 0 ? character.toUpperCase() : character.toLowerCase()
      )
      .join("");
    const injections = [
      JSON.stringify(identity),
      `'${identity.replaceAll("\\", "\\\\").replaceAll("'", "\\'")}'`,
      `\`${identity.replaceAll("\\", "\\\\").replaceAll("`", "\\`")}\``,
      `"${unicodeEscape(identity)}"`,
      `"${hexEscape(identity)}"`,
      `"${mixedEscape(identity)}"`,
      concatenate(identity),
      concatenateEscaped(identity),
      `((${concatenate(identity)}))`,
      JSON.stringify(caseVaried),
    ];
    for (const injected of injections) {
      assert.equal(
        protectedIdentityHits(injected, protectedTokens).some((hit) =>
          hit.toLowerCase() === identity.toLowerCase()
        ),
        true,
        `the protected-name gate must detect ${identity} in ${injected}`,
      );
      detectedInjections += 1;
    }
  }
  assert.equal(detectedInjections, identities.length * 10);
  console.log(
    `protected identity gate: ${detectedInjections}/${identities.length * 10}` +
    " encoded/static injections detected",
  );

  const benign = [
    '"ember-warden"',
    '"the knightly order"',
    '"not-a-protected-name"',
    '"prefix" + dynamic + "suffix"',
    "`dynamic ${identity}`",
  ];
  for (const source of benign) {
    assert.deepEqual(
      protectedIdentityHits(source, protectedTokens),
      [],
      `the protected-name gate must allow benign source: ${source}`,
    );
  }
});

test("content schema: reference isolation gate decodes static path specifiers", () => {
  const encodedReference = "\\u0072\\x65\\u{66}erence";
  const pathCases = [
    `import value from "../${encodedReference}/stats/cards.json";`,
    `import("../ref" /* split */ + "erence/footage/still.png");`,
    `export { value } from (".." + "/REFERENCE" + "/stats/towers.json");`,
    `require(((".." + "\\\\ref") + "erence\\\\stats\\\\arena.json"));`,
    `{"files":["src", "./${encodedReference}\\\\stats/cards.json"]}`,
    `{"bundle":{"assets":".." + "/ref" + /* join */ "erence/footage"}}`,
    `import /* before */ ( /* inside */ (
      "..\\x2fref" +
      /* between operands */ "erence\\x2fstats/cards.json"
    ));`,
    `const fixture = (((("./safe") + "/../") + "reference") + "/stats");`,
    `const mixedCase = "..\\\\ReFeReNcE/stats/cards.json";`,
    `const rootRelative = "/reference/stats/cards.json";`,
    `const prefixed = prefix + "/reference/stats";`,
    `const spacedFile = "../reference/footage/arena still.png";`,
  ];

  for (const source of pathCases) {
    assert.ok(
      referencePathHits(source).some((hit) =>
        /(?:^|[\\/])reference(?:[\\/]|$)/i.test(hit)
      ),
      `the reference isolation gate must reject ${source}`,
    );
  }

  const benign = [
    `import value from "./reference-copy/cards.js";`,
    `export { value } from "./not-reference/cards.js";`,
    `require("./reference-data.js");`,
    `{"description":"the reference corpus is test-only"}`,
    "const path = `./${directory}/reference/stats`;",
    `const parts = ["ref", dynamic, "erence/stats"];`,
    `// reference/ appears outside a static string`,
    `/* "../reference/stats" appears only inside a comment */`,
  ];
  for (const source of benign) {
    assert.deepEqual(
      referencePathHits(source),
      [],
      `the reference isolation gate must allow ${source}`,
    );
  }
});

test("content schema: reference isolation gate treats query and fragment as path terminators", () => {
  const contexts = [
    (expression) => `import(${expression});`,
    (expression) => `export { value } from ${expression};`,
    (expression) => `require(${expression});`,
    (expression) => `{"files":[${expression}]}`,
  ];
  const suffixes = ["?raw", "#fixture"];
  let hostileCases = 0;

  for (const suffix of suffixes) {
    const encodedSuffix = suffix[0] === "?"
      ? `\\x3f${suffix.slice(1)}`
      : `\\u0023${suffix.slice(1)}`;
    const expressions = [
      JSON.stringify(`../reference${suffix}`),
      JSON.stringify(`..\\ReFeReNcE${suffix}`),
      `"..\\x2f\\u0072\\x65\\u{66}erence${suffix}"`,
      `("../ref" /* split */ + "erence${suffix}")`,
      `(\`..\\\\refer\` + \`ence${suffix}\`)`,
      `"../reference${encodedSuffix}"`,
    ];

    for (const context of contexts) {
      for (const expression of expressions) {
        const source = context(expression);
        assert.ok(
          referencePathHits(source).length > 0,
          `the reference isolation gate must reject ${source}`,
        );
        hostileCases += 1;
      }
    }
  }

  assert.equal(hostileCases, suffixes.length * contexts.length * 6);
  console.log(
    `reference terminal gate: ${hostileCases}/${hostileCases}` +
    " query/fragment terminal injections detected",
  );

  const benignPathnames = [
    "../reference-copy",
    "../not-reference",
    "../myreference",
  ];
  const benignSuffixes = [
    "?target=reference",
    "?target=/reference",
    "?from=../reference/stats",
    "#reference",
    "#/reference/stats",
  ];
  let benignCases = 0;

  for (const pathname of benignPathnames) {
    for (const suffix of suffixes) {
      const source = `import(${JSON.stringify(pathname + suffix)});`;
      assert.deepEqual(
        referencePathHits(source),
        [],
        `the reference isolation gate must allow ${source}`,
      );
      benignCases += 1;
    }
  }
  for (const suffix of benignSuffixes) {
    const source = `require(${JSON.stringify(`../assets${suffix}`)});`;
    assert.deepEqual(
      referencePathHits(source),
      [],
      `the reference isolation gate must ignore query/fragment content: ${source}`,
    );
    benignCases += 1;
  }
  const escapedQuerySource =
    `require("../assets\\x3ftarget=..\\x2freference/stats");`;
  assert.deepEqual(
    referencePathHits(escapedQuerySource),
    [],
    `the reference isolation gate must ignore escaped query content: ${
      escapedQuerySource
    }`,
  );
  benignCases += 1;

  assert.equal(
    benignCases,
    benignPathnames.length * suffixes.length + benignSuffixes.length + 1,
  );
});

test("content schema: this registry piece makes no card/ability parity claim", async () => {
  const contentFiles = walkFiles(join(ROOT, "src/content"), (path) =>
    [".js", ".mjs"].includes(extname(path))
  );
  const exports = await import("../src/content/index.js");

  assert.equal("cards" in exports, false);
  assert.equal("runtimeCards" in exports, false);
  assert.equal("abilities" in exports, false);
  assert.ok(contentFiles.some((path) => path.endsWith("schema.js")));
});
