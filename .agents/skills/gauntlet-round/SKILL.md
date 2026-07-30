---
name: gauntlet-round
description: Runs one build-and-critique round on a single piece of the Clash Royale clone — delegating a builder subagent and a separate blind critic subagent, then recording the result. Trigger this for any request to improve, fix, extend, or advance a piece listed in PLAN.md, and re-enter it automatically after each round completes until the piece passes or the human stops the run. Do not trigger for one-off questions, reference-corpus work, or repo setup.
---

# Gauntlet Round

One round = one piece, one builder, one critic, one recorded verdict.
Never merge these roles into a single context.

## 1. Select
Read PLAN.md. Pick the piece with the largest gap between its current
state and the bar. Prefer pieces that block others. Announce the choice
in one line before delegating.

A piece must be small enough that a critic can judge it in isolation and
that its verdict is not a matter of taste. If the piece you picked
cannot be judged that way, split it in PLAN.md first and pick a half.

## 2. Builder subagent
Delegate to one builder. Give it:
- the piece name and its entry in PLAN.md
- the last critic verdict for this piece, if any — this is the brief
- the relevant slice of ./reference and the tests that cover the piece
- the files it owns for this round

Constraints:
- The builder addresses the named gap. It does not redesign adjacent
  pieces or expand scope.
- Never run two builders that touch the same files. Parallel builders
  are allowed only when their file sets are disjoint; when in doubt,
  serialize.
- The builder returns a short summary and a file list, not a transcript.

## 3. Critic subagent
Delegate to one critic with clean context. Do not fork the builder's
context — the critic must not see how the work was made or why the
builder thinks it is good.

Open its prompt with the role boundary, verbatim:

> You are the critic for this round and only the critic. You do not
> build, delegate, or orchestrate. You evaluate the output in front of
> you against the bar and return a verdict.

Give it: the built artifact, the relevant slice of ./reference, and the
command to run the tests. Nothing else.

The critic must:
- **Run it.** Execute the tests, or render the frame, or play the sim.
  A verdict reached by reading source is void.
- **Paste evidence.** Actual failing test output, actual numbers, actual
  rendered image. Not a summary of them.
- **Compare blind where possible.** For visual pieces: render our frame
  to match a reference still, present both unlabeled, and answer which
  one is the real game and what gave it away. For numeric pieces: state
  our value and the reference value side by side.
- **Be harsh.** The default verdict is FAIL. Passing requires the output
  to be indistinguishable from the bar on the dimension being judged,
  not merely close or plausible.
- **Name one gap.** A single sentence describing the biggest remaining
  difference, specific enough to act on. "Movement feels off" is
  useless; "Hog Rider crosses the bridge in 2.1s against 1.6s in the
  reference" is a brief.

Verdict format:

```
PIECE: <name>
VERDICT: PASS | FAIL
EVIDENCE: <pasted output or rendered comparison>
BIGGEST GAP: <one sentence>
```

## 4. Record
Append the verdict to rounds.md. Update the piece's state in PLAN.md.
Rewrite progress.html so it shows, for every piece: current state, test
pass rate, round count, and the gap named in each round so the human can
see the trajectory. Keep it a single self-contained file.

## 5. Loop
FAIL: start the next round on the same piece, with that gap as the brief.
PASS: mark it, then select again.

If a piece fails three rounds on the same gap, stop looping on it. The
piece is wrong-shaped or the bar is wrong — say which you think it is,
record it in PLAN.md, and move to another piece.

Do not stop for approval between rounds.
