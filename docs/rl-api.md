# RL environment API

`src/rl/environment.js` exports `RLEnvironment`, `createRLEnvironment`, and
the action-count and default timing constants. It is a browser-compatible ESM
module and imports the repository's real `GameSession`; it does not replace or
change simulation rules.

```js
import { createRLEnvironment } from "../src/rl/environment.js";

const env = createRLEnvironment({
  seed: 42,
  strideTicks: 30,
  horizonTicks: 900,
});
const observation = env.reset(); // Reset also returns the initial observation.
const transition = env.step(0); // Action 0 waits.
```

The current editable card set has 17 troops, Squall Orb, and Ember Basin.
Supply exactly eight distinct admitted card IDs to select a deck; a mixed
deck must include Squall Orb or Ember Basin. The same deck is used by both
sides, with independent cycles. For example, this eight-card mix deploys
Ember Basin while keeping Squall Orb available in the shared cycle:

```js
import { createRLEnvironment, RLEnvironment } from "../src/rl/environment.js";

const deck = [
  "ember-basin", "squall-orb", "coilblade", "mossguard",
  "copperskiff", "skymaul", "brassbolt", "reedsting",
];
const env = createRLEnvironment({ deck, seed: 1, strideTicks: 1, horizonTicks: 120 });
const initial = env.reset();
const space = env.actionSpace();
if (initial.version !== 2 || space.version !== 2 || space.actionCount !== 2_305 ||
    initial.actionMask.length !== space.actionCount) {
  throw new Error("unexpected RL schema or action space");
}
const slot = initial.hand.indexOf("ember-basin");
const action = space.actions.find((candidate) =>
  candidate.slot === slot && candidate.point.x === 3_500 && candidate.point.y === 14_500);
if (slot < 0 || !action || !initial.actionMask[action.id]) {
  throw new Error("Ember Basin is not currently deployable");
}

const transition = env.step(action.id);
if (transition.reward !== 0 || transition.terminated || transition.truncated) {
  throw new Error("unexpected nonterminal transition result");
}
const basin = transition.observation.structures.find((structure) =>
  structure.cardId === "ember-basin");
console.log({
  hitpoints: basin.hitpoints,
  lifetime: basin.lifetime,
  attackState: basin.attackState,
  policy: basin.policy,
});

const checkpoint = env.serialize();
const restored = RLEnvironment.restore(checkpoint);
const next = env.step(0);
const replay = restored.step(0);
if (JSON.stringify(next) !== JSON.stringify(replay)) {
  throw new Error("restored continuation diverged");
}

const versionOne = JSON.stringify({ ...JSON.parse(checkpoint), version: 1 });
try {
  RLEnvironment.restore(versionOne);
  throw new Error("version-1 checkpoint unexpectedly restored");
} catch (error) {
  if (error.message !== "serialized environment has an invalid shape or version") throw error;
}
```

An observation and `actionSpace()` report schema version `2`. Version 2 adds a
`structures` array without adding action IDs or changing the existing mask
legality checks and sparse reward rules. The example's deployment action uses
the same mask and action ID formula described below. Its reward is zero because
the engine has not reported a result.

The accepted reset options are `seed`, `deck`, `strideTicks`, and
`horizonTicks`. Defaults are seed `0`, the standard shared eight-card deck,
stride `30` ticks, and horizon `18,000` ticks. A tick is one fixed simulation
step; the engine uses 60 ticks per second. `reset(options)` starts a fresh match
and returns its observation. A reset with no options reuses the current seed,
deck, stride, and horizon; a partial reset changes only the fields supplied.
`observe()` returns the current observation.

The south side is controlled by the caller. The north side uses the existing
seeded opponent controller. Both sides draw from the same configured eight
card deck, with independent deck-cycle state and seeds. This wrapper does not
provide independent decks, two policies, self-play, or a learned opponent.
Different seeds reproduce different seeded deck cycles and north-controller
choices; the same seed and action sequence reproduce the same session.

`actionSpace()` returns a detached JSON catalogue with 2,305 entries. Action
`0` waits. The other actions use this formula:

```text
actionId = 1 + slot * 576 + row * 18 + column
```

`slot` is `0` through `3` in the current south hand. Rows run from arena y=0 to
y=31 and columns run from x=0 to x=17. Each point is the center of a 1×1 tile,
in thousandths of a tile: `(column*1000+500, row*1000+500)`. The catalogue
includes every slot and every center, including illegal placements; consult
the observation's `actionMask` before choosing. Mask index equals action ID.
The wait action is available while a match is running. Deployment entries are
available only when the current slot has enough elixir and the real engine's
`evaluateDeployment` accepts that center for the card's placement class. The
mask uses the engine's current south-side rule with
`destroyedOpposingLaneTowers: []`; it does not probe or mutate a live session.
Finished observations have an all-false mask.

An observation is detached, JSON-safe data with `version`, `status`, `tick`,
and `phase`, plus public `units`, `towers`, `structures`, and `crowns`; the
south `hand`, `next` card, and `elixir`; and `actionMask`. Structure records
are sorted by numeric entity ID and are emitted from the engine's structure
list without filtering on `alive`; when a dead record remains in that list it
includes `alive: false` and its `deathCause`. Each record exposes `id`,
`cardId`, `owner`, `position`, `layer`, `alive`, `deathCause`, `hitpoints`,
`maxHitpoints`, `targetable`, `targetKey`, and `targetMode`. Its `lifetime`
contains elapsed, remaining, and total ticks plus the exact source QUESTION
receipt. Its nullable `attackState` contains the attack-cycle `phase`,
`nextAttackTick`, `sequence`, and `targetId`; `policy` preserves the admitted
building profile's source-confidence receipt. QUESTION and unverified values
remain questions and are not historical authority. Unit and tower records
also contain only public fields. Opponent deck, north elixir, seed,
random-generator state, pending commands, engine transcript, and raw engine
state are not in the policy observation. `status` is `running`, `terminated`,
or `truncated`; `phase` is the engine phase while running and `terminal` after
a natural match result.

`step(actionId)` validates the current mask, submits a deploy action at the
current engine tick when needed, then advances by
`min(strideTicks, remaining horizon ticks)`. It returns
`{ observation, reward, terminated, truncated, info }`. A wait submits no
command. Rewards are sparse: `+1` for a south win, `-1` for a north win, and
`0` for a draw or every nonterminal transition. Natural engine results set
`terminated`; reaching the caller's horizon without an engine result sets
`truncated`. Both make later `step` calls fail. A rejected action throws before
the session or deployment command counter changes. The deployment command
counter advances only after its action and fixed stride complete successfully.

`serialize()` and `RLEnvironment.restore(bytes)` save and restore a privileged
version-2 checkpoint containing configuration and the engine's own snapshot.
It includes seed, shared deck configuration, opponent/controller state, and
transcript data needed for causal restoration. Treat it as trusted storage,
not policy input or an observation. Restore validates the checkpoint against
the real `GameSession` setup and deployment counter, so a restored environment
continues with the same observation, reward, done status, structures, and
future actions. Restore rejects version-1 checkpoints with a `TypeError`
(`serialized environment has an invalid shape or version`); no migration is
implemented. Paused engine sessions and sessions with an unprocessed player
command are also rejected because this wrapper cannot produce or resume those
states.

The wrapper inherits the simulation's current supported-card admission and
approximation limits. Its tile centers use the current estimated placement
mask; repository provenance classifies exact arena coordinates and some
placement boundaries as low-to-medium confidence. An admitted card can still
be rejected by the engine when its mechanic remains an explicit QUESTION.
This API makes no claim that current simulation behavior is complete or
mechanically at parity with the historical comparison target.
