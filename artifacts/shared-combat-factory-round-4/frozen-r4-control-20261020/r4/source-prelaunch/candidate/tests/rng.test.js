import assert from "node:assert/strict";
import test from "node:test";

import {
  RNG_ALGORITHM,
  SeededRandom,
} from "../src/sim/rng.js";

function draw(rng, count) {
  return Array.from({ length: count }, () => rng.nextUint32());
}

test("rng: algorithm and seed vectors are pinned for replay compatibility", () => {
  assert.equal(RNG_ALGORITHM, "pcg32-xsh-rr-v1");

  const vectors = [
    {
      expected: [
        914318559, 3640653623, 3621767766, 3195629436, 38046904,
        2988422544, 3430847990, 192785989, 2767942809, 3021732133,
      ],
      seed: 0,
    },
    {
      expected: [
        2707186564, 952047674, 411441153, 3722962821, 1668375123,
        2350096699, 2806319730, 1308305343, 1678302655, 3751668270,
      ],
      seed: 1,
    },
    {
      expected: [
        155746168, 551512846, 824308268, 108633569, 2601182384,
        2617871957, 3600506527, 2102100619, 14381429, 2334732174,
      ],
      seed: "arena-match-42",
    },
    {
      expected: [
        3325287646, 4287056834, 972903136, 4162826308, 1117232259,
        3948662560, 2519688147, 563656264, 1302052138, 810730079,
      ],
      seed: "",
    },
  ];

  for (const { expected, seed } of vectors) {
    assert.deepEqual(draw(new SeededRandom(seed), expected.length), expected);
  }
});

test("rng: bounded integers stay in range and use pinned selections", () => {
  const rng = new SeededRandom("bounds");
  const bounds = [1, 2, 3, 7, 10, 255, 65537, 0x1_0000_0000];
  assert.deepEqual(
    bounds.map((bound) => rng.int(bound)),
    [0, 0, 2, 3, 6, 1, 16694, 1997998483],
  );

  const distribution = new SeededRandom("bounded-distribution");
  const counts = Array(7).fill(0);
  for (let index = 0; index < 70_000; index += 1) {
    const selected = distribution.int(counts.length);
    assert.ok(selected >= 0 && selected < counts.length);
    counts[selected] += 1;
  }

  // A deliberately loose deterministic smoke check catches catastrophically
  // broken bounds without making the suite probabilistic.
  assert.ok(Math.max(...counts) - Math.min(...counts) < 700, `${counts}`);
});

test("rng: named child streams ignore draws and fork call order", () => {
  const cleanRoot = new SeededRandom("match");
  const cleanLeft = cleanRoot.fork("left");
  const expectedLeft = [
    304967888, 357756371, 271723048, 4063417775, 1682829086,
    3905899471, 1353495302, 1383341687,
  ];
  assert.deepEqual(draw(cleanLeft, expectedLeft.length), expectedLeft);
  assert.deepEqual(draw(cleanRoot.fork("right"), 8), [
    2793911552, 2447200273, 2102949863, 466446402, 4192548441,
    1463753076, 1168908166, 951901533,
  ]);
  assert.deepEqual(draw(cleanRoot.fork("left").fork("spawns"), 5), [
    2080427978, 891625962, 2979940605, 4041813309, 1816683835,
  ]);

  const noisyRoot = new SeededRandom("match");
  draw(noisyRoot, 100);
  draw(noisyRoot.fork("right"), 50);
  assert.deepEqual(draw(noisyRoot.fork("left"), 8), expectedLeft);
  assert.deepEqual(draw(noisyRoot.fork("left"), 8), expectedLeft);

  assert.notDeepEqual(
    draw(new SeededRandom("match").fork("Left"), 8),
    expectedLeft,
    "fork names must remain exact and case-sensitive",
  );
});

test("rng: JSON round-trip restores every stream and fork state", () => {
  const uninterrupted = new SeededRandom("snapshot");
  draw(uninterrupted, 3);
  const snapshot = uninterrupted.serialize();

  assert.deepEqual(snapshot, {
    algorithm: "pcg32-xsh-rr-v1",
    forkKey: "88a3f9ba7ab9eef2",
    increment: "20eede310879fc6f",
    state: "e1ed4a81c23b7973",
    version: 1,
  });
  assert.deepEqual(JSON.parse(JSON.stringify(snapshot)), snapshot);

  const expected = draw(uninterrupted, 5);
  assert.deepEqual(expected, [
    3672503587, 3776512969, 1252880653, 4146358837, 630047739,
  ]);
  assert.deepEqual(
    draw(SeededRandom.restore(JSON.parse(JSON.stringify(snapshot))), 5),
    expected,
  );
  assert.deepEqual(
    draw(SeededRandom.restore(JSON.stringify(snapshot)), 5),
    expected,
  );

  const restored = SeededRandom.restore(snapshot);
  assert.deepEqual(
    draw(restored.fork("future-child"), 20),
    draw(uninterrupted.fork("future-child"), 20),
  );
});

test("rng: 10,000 fresh runs reproduce draws, bounds, forks, and snapshots", () => {
  for (let run = 0; run < 10_000; run += 1) {
    const seed = `repro-${run}`;
    const left = new SeededRandom(seed);
    const right = new SeededRandom(seed);

    for (let index = 0; index < 12; index += 1) {
      assert.equal(left.nextUint32(), right.nextUint32());
      const bound = (run * 17 + index * 31) % 65_536 + 1;
      assert.equal(left.int(bound), right.int(bound));
    }

    assert.deepEqual(
      draw(left.fork(`lane-${run % 3}`), 4),
      draw(right.fork(`lane-${run % 3}`), 4),
    );
    assert.deepEqual(left.serialize(), right.serialize());
  }
});

test("rng: invalid implicit seeds, bounds, names, and snapshots fail closed", () => {
  for (const seed of [
    undefined,
    null,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    1.5,
    Number.MAX_SAFE_INTEGER + 1,
    {},
  ]) {
    assert.throws(() => new SeededRandom(seed), /seed/);
  }

  const rng = new SeededRandom(0);
  for (const bound of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    0x1_0000_0001,
  ]) {
    assert.throws(() => rng.int(bound), /maxExclusive/);
  }
  for (const name of ["", null, 1]) {
    assert.throws(() => rng.fork(name), /fork name/);
  }

  assert.throws(() => SeededRandom.restore("{"), /valid JSON/);
  assert.throws(() => SeededRandom.restore(null), /invalid shape/);
  assert.throws(
    () =>
      SeededRandom.restore({
        ...rng.serialize(),
        algorithm: "future-algorithm",
      }),
    /invalid shape/,
  );
  assert.throws(
    () => SeededRandom.restore({ ...rng.serialize(), extra: true }),
    /invalid shape/,
  );
  assert.throws(
    () => SeededRandom.restore({ ...rng.serialize(), state: "not-hex" }),
    /snapshot state/,
  );
  assert.throws(
    () =>
      SeededRandom.restore({
        ...rng.serialize(),
        increment: "0000000000000000",
      }),
    /increment must be odd/,
  );
});
