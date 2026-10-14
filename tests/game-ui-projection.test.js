import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import vm from "node:vm";

import { GameSession } from "../src/sim/game-session.js";
import { TOWER_COMBAT_CONFIG } from "../src/sim/towers.js";
import {
  serializeCombatEffectsViewModel,
  restoreCombatEffectsViewModel,
} from "../src/ui/combat-effects.js";
import {
  serializeCombatViewModel,
} from "../src/ui/combat-state.js";
import {
  composeGameUiFrame,
  createGameUiFrame,
  createGameUiOptions,
  mountGameUiProjection,
} from "../src/ui/game-ui-projection.js";
import { getHudMarkup, serializeHudViewModel } from "../src/ui/hud-state.js";
import { serializeMatchFeedbackViewModel } from "../src/ui/match-feedback.js";
import {
  createPlayableRoster,
  createPlayableRosterQuestionRecords,
  PLAYABLE_CARD_IDS,
} from "../src/content/playable-roster.js";
import { createEditableGameSessionSetup } from "../src/content/editable-deck.js";
import { selectBriarRunnerFrame } from "../src/ui/combat-sprite-prototype.js";

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function setup({
  candidates,
  initialWindupTicks = { central: 0, lane: 0 },
  seed = "ui-projection",
  starting = 10,
  think = 1,
} = {}) {
  const roster = createPlayableRoster();
  const questions = createPlayableRosterQuestionRecords();
  const battleSetup = canonical({ initialWindupTicks, questions, roster });
  return canonical({
    battleSetup,
    deck: roster.map(({ id }) => id),
    legalNorthDeployments: candidates ?? [
      { cardId: roster[0].id, point: { x: 3_500, y: 17_500 } },
    ],
    rosterWitness: canonical({ questions, roster }),
    seed,
    startingElixir: { north: starting, south: starting },
    thinkIntervalTicks: think,
    thinkOffsetTicks: 0,
  });
}

function projectionBytes(frame) {
  return canonical({
    combat: serializeCombatViewModel(frame.combat),
    effects: serializeCombatEffectsViewModel(frame.effects),
    feedback: serializeMatchFeedbackViewModel(frame.feedback),
    hud: serializeHudViewModel(frame.hud),
    tick: frame.tick,
  });
}

class Node {
  constructor(ownerDocument, name) {
    this.attributes = new Map();
    this.children = [];
    this.className = "";
    this.dataset = {};
    this.innerHTML = "";
    this.name = name;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.style = { values: new Map(), setProperty: (key, value) => this.style.values.set(key, value) };
    this.textContent = "";
    this.throwAfterReplace = false;
    this.throwOnReplace = false;
  }
  get childNodes() { return this.children; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) {
    if (this.throwOnReplace) { this.throwOnReplace = false; throw new Error("hostile commit"); }
    for (const child of children) child.parentNode = this;
    this.children = children;
    if (this.throwAfterReplace) {
      this.throwAfterReplace = false;
      throw new Error("hostile mutate-then-throw commit");
    }
  }
  setAttribute(key, value) { this.attributes.set(key, value); }
  isEqualNode(other) {
    if (!(other instanceof Node) || this.name !== other.name ||
        this.className !== other.className || this.innerHTML !== other.innerHTML ||
        this.textContent !== other.textContent ||
        JSON.stringify([...this.attributes].sort()) !== JSON.stringify([...other.attributes].sort()) ||
        JSON.stringify(Object.entries(this.dataset).sort()) !== JSON.stringify(Object.entries(other.dataset).sort()) ||
        JSON.stringify([...this.style.values].sort()) !== JSON.stringify([...other.style.values].sort()) ||
        this.children.length !== other.children.length) return false;
    return this.children.every((child, index) => child.isEqualNode(other.children[index]));
  }
}

function fixture() {
  const document = {
    createElement(name) { return new Node(document, name); },
    createElementNS(_namespace, name) { return new Node(document, name); },
  };
  return {
    document,
    layers: Object.fromEntries(["combat", "effects", "feedback", "hud"]
      .map((name) => [name, new Node(document, name)])),
  };
}

class TreeNode {
  constructor(ownerDocument, name, nodeType = 1, nodeValue = null) {
    this.ownerDocument = ownerDocument;
    this.nodeType = nodeType;
    this.nodeName = nodeType === 3 ? "#text" : name.toUpperCase();
    this.name = name;
    this.nodeValue = nodeValue;
    this.parentNode = null;
    this.childNodes = [];
    this.attributes = new Map();
    this._dataset = {};
    this.dataset = new Proxy(this._dataset, {
      set: (target, key, value) => {
        const result = Reflect.set(target, key, String(value));
        this.setAttribute(`data-${String(key).replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`,
          String(value));
        return result;
      },
      deleteProperty: (target, key) => {
        const result = Reflect.deleteProperty(target, key);
        this.removeAttribute(`data-${String(key).replace(/[A-Z]/gu, match => `-${match.toLowerCase()}`)}`);
        return result;
      },
    });
    this.style = {
      values: new Map(),
      setProperty: (key, value) => {
        this.style.values.set(key, String(value));
        this.attributes.set("style", [...this.style.values]
          .map(([name, property]) => `${name}: ${property};`).join(" "));
      },
    };
    this.throwAfterSetAttribute = null;
    this.throwAfterAppendChild = false;
    this.throwAfterRemoveChild = false;
    this.throwAfterReplaceChild = false;
    this.throwAfterReplace = false;
    this.throwOnReplace = false;
  }
  get children() { return this.childNodes; }
  get className() { return this.getAttribute("class") ?? ""; }
  set className(value) { this.setAttribute("class", value); }
  get innerHTML() {
    if (this.nodeType !== 1) return undefined;
    return this.childNodes.map((child) => child.outerHTML).join("");
  }
  set innerHTML(markup) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    const stack = [this];
    const tokens = String(markup).match(/<!--[\s\S]*?-->|<\/?[a-zA-Z][^>]*>|[^<]+/gu) ?? [];
    for (const token of tokens) {
      if (token.startsWith("<!--")) continue;
      if (token.startsWith("</")) {
        if (stack.length > 1) stack.pop();
        continue;
      }
      if (token.startsWith("<")) {
        const tag = /^<([a-zA-Z][\w:-]*)/u.exec(token)?.[1];
        if (!tag) continue;
        const element = this.ownerDocument.createElement(tag);
        const attrSource = token.slice(tag.length + 1, token.length - 1);
        const attrPattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s/>]+)))?/gu;
        for (const match of attrSource.matchAll(attrPattern)) {
          const [, name, doubleQuoted, singleQuoted, bare] = match;
          element.setAttribute(name, decodeFixtureHtml(doubleQuoted ?? singleQuoted ?? bare ?? ""));
        }
        stack.at(-1).appendChild(element);
        if (!token.endsWith("/>") && !["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"].includes(tag.toLowerCase())) {
          stack.push(element);
        }
        continue;
      }
      stack.at(-1).appendChild(this.ownerDocument.createTextNode(decodeFixtureHtml(token)));
    }
  }
  get textContent() {
    if (this.nodeType === 3) return this.nodeValue ?? "";
    return this.childNodes.map((child) => child.textContent).join("");
  }
  set textContent(value) {
    if (this.nodeType === 3) { this.nodeValue = String(value); return; }
    this.replaceChildren(this.ownerDocument.createTextNode(String(value)));
  }
  get outerHTML() {
    if (this.nodeType === 3) return escapeFixtureHtml(this.nodeValue ?? "");
    const attrs = [...this.attributes].map(([name, value]) => ` ${name}="${escapeFixtureHtml(value)}"`).join("");
    return `<${this.name}${attrs}>${this.innerHTML}</${this.name}>`;
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  cloneNode(deep = false) {
    if (this.nodeType === 3) return this.ownerDocument.createTextNode(this.nodeValue ?? "");
    const clone = this.ownerDocument.createElement(this.name);
    for (const [name, value] of this.attributes) clone.setAttribute(name, value);
    if (deep) {
      for (const child of this.childNodes) clone.appendChild(child.cloneNode(true));
    }
    return clone;
  }
  setAttribute(name, value) {
    value = String(value);
    this.attributes.set(name, value);
    if (name === "class") this._className = value;
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      this._dataset[key] = value;
    }
    if (name === "style") {
      this.style.values.clear();
      for (const declaration of value.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator >= 0) this.style.values.set(declaration.slice(0, separator).trim(), declaration.slice(separator + 1).trim());
      }
    }
    if (this.throwAfterSetAttribute === name) {
      this.throwAfterSetAttribute = null;
      throw new Error("hostile mutate-then-throw attribute");
    }
  }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "class") this._className = "";
    if (name.startsWith("data-")) {
      const key = name.slice(5).replace(/-([a-z])/gu, (_match, letter) => letter.toUpperCase());
      delete this._dataset[key];
    }
    if (name === "style") this.style.values.clear();
  }
  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    if (this.throwAfterAppendChild) {
      this.throwAfterAppendChild = false;
      throw new Error("hostile mutate-then-throw appendChild");
    }
    return child;
  }
  insertBefore(child, reference) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    const index = reference === null ? -1 : this.childNodes.indexOf(reference);
    if (index < 0) this.childNodes.push(child);
    else this.childNodes.splice(index, 0, child);
    return child;
  }
  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error("node is not a child");
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    if (this.throwAfterRemoveChild) {
      this.throwAfterRemoveChild = false;
      throw new Error("hostile mutate-then-throw removeChild");
    }
    return child;
  }
  replaceChild(next, prior) {
    const index = this.childNodes.indexOf(prior);
    if (index < 0) throw new Error("node is not a child");
    if (next.parentNode) next.parentNode.removeChild(next);
    next.parentNode = this;
    this.childNodes[index] = next;
    prior.parentNode = null;
    if (this.throwAfterReplaceChild) {
      this.throwAfterReplaceChild = false;
      throw new Error("hostile mutate-then-throw replaceChild");
    }
    return prior;
  }
  replaceChildren(...children) {
    if (this.throwOnReplace) { this.throwOnReplace = false; throw new Error("hostile commit"); }
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    for (const child of children) this.appendChild(child);
    if (this.throwAfterReplace) {
      this.throwAfterReplace = false;
      throw new Error("hostile mutate-then-throw commit");
    }
  }
  get nextSibling() {
    if (!this.parentNode) return null;
    return this.parentNode.childNodes[this.parentNode.childNodes.indexOf(this) + 1] ?? null;
  }
  isEqualNode(other) {
    return other instanceof TreeNode && this.nodeType === other.nodeType &&
      this.nodeName === other.nodeName && this.nodeValue === other.nodeValue &&
      JSON.stringify([...this.attributes].sort()) === JSON.stringify([...other.attributes].sort()) &&
      this.childNodes.length === other.childNodes.length &&
      this.childNodes.every((child, index) => child.isEqualNode(other.childNodes[index]));
  }
}

function decodeFixtureHtml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|#39);/gu, (entity) => ({
    "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'",
  })[entity]);
}

function escapeFixtureHtml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;",
  })[character]);
}

function treeFixture() {
  const document = {
    createElement(name) { return new TreeNode(document, name); },
    createElementNS(_namespace, name) { return new TreeNode(document, name); },
    createTextNode(value) { return new TreeNode(document, "#text", 3, String(value)); },
  };
  const layers = Object.fromEntries(["combat", "effects", "feedback", "hud"]
    .map((name) => [name, new TreeNode(document, "div")]));
  return { document, layers };
}

function findTreeNode(root, predicate) {
  if (predicate(root)) return root;
  for (const child of root.childNodes ?? []) {
    const found = findTreeNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function hudTree(root) {
  const projection = findTreeNode(root, (node) => node.dataset?.ui === "hud-projection");
  const hand = findTreeNode(root, (node) => node.dataset?.ui === "hud-hand");
  const cards = hand.childNodes.filter((node) => node.className === "hud-card");
  return { projection, hand, cards };
}

function nodeBytes(node) {
  return JSON.stringify({
    attributes: [...node.attributes].sort(),
    children: node.children.map(nodeBytes),
    className: node.className,
    dataset: Object.entries(node.dataset).sort(),
    innerHTML: node.innerHTML,
    name: node.name,
    style: [...node.style.values].sort(),
    textContent: node.textContent,
  });
}

function allBytes(layers) {
  return canonical(Object.fromEntries(Object.entries(layers)
    .map(([name, layer]) => [name, nodeBytes(layer)])));
}

function layerChildren(layers) {
  return Object.fromEntries(Object.entries(layers)
    .map(([name, layer]) => [name, [...layer.children]]));
}

function assertSameLayerChildren(layers, prior) {
  for (const name of Object.keys(prior)) {
    assert.equal(layers[name].children.length, prior[name].length, name);
    for (const [index, child] of prior[name].entries()) {
      assert.strictEqual(layers[name].children[index], child, `${name}[${index}]`);
    }
  }
}

function treeIdentitySnapshot(layers) {
  const snapshot = [];
  const visit = (node) => {
    snapshot.push({ node, parent: node.parentNode, children: [...node.childNodes] });
    for (const child of node.childNodes) visit(child);
  };
  for (const layer of Object.values(layers)) visit(layer);
  return snapshot;
}

function assertSameTreeIdentities(layers, prior) {
  const current = treeIdentitySnapshot(layers);
  assert.equal(current.length, prior.length, "live DOM has the same node count");
  for (const [index, expected] of prior.entries()) {
    const actual = current[index];
    assert.strictEqual(actual.node, expected.node, `node identity ${index}`);
    assert.strictEqual(actual.parent, expected.parent, `parent identity ${index}`);
    assert.equal(actual.children.length, expected.children.length, `child count ${index}`);
    for (const [childIndex, child] of expected.children.entries()) {
      assert.strictEqual(actual.children[childIndex], child, `child identity ${index}.${childIndex}`);
    }
  }
}

function installHostileCommit(layer, behavior) {
  const normal = layer.replaceChildren.bind(layer);
  let first = true;
  layer.replaceChildren = (...candidate) => {
    if (!first) return normal(...candidate);
    first = false;
    if (behavior === "before") throw new Error("hostile throw before mutation");
    if (behavior === "one") {
      if (candidate.length > 0) {
        candidate[0].parentNode = layer;
        if (layer.children.length === 0) layer.children.push(candidate[0]);
        else layer.children[0] = candidate[0];
      }
      throw new Error("hostile mutate one child then throw");
    }
    if (behavior === "all") {
      for (const child of candidate) child.parentNode = layer;
      layer.children = candidate;
      throw new Error("hostile replace all then throw");
    }
    if (behavior === "empty") {
      layer.children = [];
      throw new Error("hostile candidate empty then throw");
    }
    throw new TypeError(`unknown hostile commit behavior: ${behavior}`);
  };
}

function installRestorationFailure(layer) {
  const normal = layer.replaceChildren.bind(layer);
  let calls = 0;
  layer.replaceChildren = (...candidate) => {
    calls += 1;
    if (calls === 1) {
      for (const child of candidate) child.parentNode = layer;
      layer.children = candidate;
      throw new Error("hostile commit before restoration failure");
    }
    if (calls === 2) throw new Error("hostile restoration");
    return normal(...candidate);
  };
  return () => calls;
}

function mutableProjectionSnapshot(session, originalSnapshot) {
  const originalFreeze = Object.freeze;
  Object.freeze = (value) => {
    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort();
      if (keys.length === 9 &&
          keys.join(",") === "combatEffectFeed,hudFeedback,matchFeedback,replay,sequence,setup,source,state,version") {
        return value;
      }
    }
    return originalFreeze(value);
  };
  try {
    return originalSnapshot.call(session);
  } finally {
    Object.freeze = originalFreeze;
  }
}

test("game UI projection: one authentic session frame commits all four matching ticks", () => {
  const session = new GameSession(setup());
  const initial = createGameUiFrame(session);
  assert.deepEqual([
    initial.tick, initial.hud.tick, initial.combat.tick,
    initial.effects.tick, initial.feedback.tick,
  ], [0, 0, 0, 0, 0]);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  assert.equal(mounted.canHandoff(), true);
  assert.equal(mounted.project(initial), initial);
  assert.equal(layers.combat.children[0].dataset.tick, "0");
  assert.equal(layers.effects.children[0].dataset.tick, "0");
  assert.equal(layers.feedback.children[0].dataset.tick, "0");
  assert.equal(layers.hud.children[0].dataset.tick, "0");

  session.step();
  const next = createGameUiFrame(session);
  mounted.project(next);
  assert.ok(next.combat.entities.length > 0);
  for (const name of ["combat", "effects", "feedback", "hud"]) {
    assert.equal(layers[name].children[0].dataset.tick, "1", name);
  }
});

test("game UI projection: an identical frame keeps every committed DOM node", () => {
  const session = new GameSession(setup());
  const first = createGameUiFrame(session);
  const sameState = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(first);
  const prior = layerChildren(layers);

  mounted.project(sameState);

  assertSameLayerChildren(layers, prior);
});

test("game UI projection: HUD tick metadata advances without replacing same-painted nodes", () => {
  const session = new GameSession(setup({ starting: 10 }));
  session.stepMany(24);
  const checkpoint = session.serialize();
  const beforeFrame = createGameUiFrame(session);
  const { layers } = treeFixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(beforeFrame);

  const priorRoot = layers.hud.childNodes[0];
  const priorTree = hudTree(priorRoot);
  const priorCards = [...priorTree.cards];
  const priorCardParents = priorCards.map((card) => card.parentNode);
  const priorTimer = findTreeNode(priorRoot, (node) => node.dataset?.ui === "hud-timer");
  const priorTimerText = priorTimer.textContent;
  const priorRootStyle = [...priorRoot.style.values];
  session.step();
  const nextFrame = createGameUiFrame(session);
  const beforeMarkup = getHudMarkup(beforeFrame.hud);
  const nextMarkup = getHudMarkup(nextFrame.hud);
  assert.equal(nextMarkup.replace('data-tick="25"', 'data-tick="24"'), beforeMarkup,
    "the HUD body changes only its tick metadata between these frames");

  mounted.project(nextFrame);

  assert.strictEqual(layers.hud.childNodes[0], priorRoot);
  assert.strictEqual(priorRoot.dataset.tick, "25");
  const nextTree = hudTree(priorRoot);
  assert.strictEqual(nextTree.projection.dataset.tick, "25");
  assert.strictEqual(nextTree.hand, priorTree.hand);
  assert.deepEqual(nextTree.cards, priorCards);
  assert.deepEqual(nextTree.cards.map((card) => card.parentNode), priorCardParents);
  assert.deepEqual([...priorRoot.style.values], priorRootStyle);

  session.stepMany(35);
  mounted.project(createGameUiFrame(session));
  assert.strictEqual(layers.hud.childNodes[0], priorRoot);
  assert.strictEqual(findTreeNode(priorRoot, (node) => node.dataset?.ui === "hud-timer"), priorTimer);
  assert.notEqual(priorTimer.textContent, priorTimerText,
    "a changed timer is written into its retained text node");
  assert.deepEqual(hudTree(priorRoot).cards, priorCards);
  assert.deepEqual(hudTree(priorRoot).cards.map((card) => card.parentNode), priorCardParents);

  const restored = GameSession.restore(checkpoint);
  mounted.handoff(createGameUiFrame(restored));
  assert.strictEqual(layers.hud.childNodes[0], priorRoot);
  assert.strictEqual(priorRoot.dataset.tick, "24");
  assert.strictEqual(hudTree(priorRoot).projection.dataset.tick, "24");
  assert.deepEqual(hudTree(priorRoot).cards, priorCards);
  assert.deepEqual(hudTree(priorRoot).cards.map((card) => card.parentNode), priorCardParents);
  assert.equal(priorTimer.textContent, priorTimerText);
  assert.equal(mounted.cleanup(), true);
  assert.equal(layers.hud.childNodes.length, 0);
  assert.equal(priorRoot.parentNode, null);
});

test("game UI projection: changed HUD attributes keep slot nodes and roll back transactionally", () => {
  const session = new GameSession(setup());
  const { layers } = treeFixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(createGameUiFrame(session));
  const root = layers.hud.childNodes[0];
  const priorBytes = allBytes(layers);
  const priorTree = hudTree(root);
  const selectedCard = priorTree.cards[0];
  const selectedId = selectedCard.dataset.cardId;
  const selectedFrame = createGameUiFrame(session, createGameUiOptions("south", selectedId));

  selectedCard.throwAfterSetAttribute = "data-selected";
  assert.throws(() => mounted.project(selectedFrame), /mutate-then-throw attribute/u);
  assert.equal(allBytes(layers), priorBytes,
    "a mutate-then-throw in-place HUD patch rolls back earlier layers and HUD attributes");
  assert.strictEqual(layers.hud.childNodes[0], root);
  assert.strictEqual(hudTree(root).cards[0], selectedCard);
  assert.equal(selectedCard.dataset.selected, "false");

  mounted.project(selectedFrame);
  const selectedTree = hudTree(root);
  assert.strictEqual(layers.hud.childNodes[0], root);
  assert.deepEqual(selectedTree.cards, priorTree.cards);
  assert.deepEqual(selectedTree.cards.map((card) => card.parentNode), priorTree.cards.map((card) => card.parentNode));
  assert.equal(selectedTree.cards[0].dataset.selected, "true");
  assert.equal(mounted.cleanup(), true);
  for (const layer of Object.values(layers)) assert.equal(layer.childNodes.length, 0);
});

for (const operation of ["appendChild", "removeChild", "replaceChild"]) {
  test(`game UI projection: HUD ${operation} mutate-then-throw restores exact live identities`, () => {
    const session = new GameSession(setup());
    const initial = createGameUiFrame(session);
    const { document, layers } = treeFixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(initial);
    const root = layers.hud.childNodes[0];
    const { hand, cards } = hudTree(root);
    const expectedCardCount = cards.length;
    let hostileParent;
    let failureFlag;

    if (operation === "appendChild") {
      hostileParent = hand;
      failureFlag = "throwAfterAppendChild";
      hand.removeChild(cards.at(-1));
    } else if (operation === "removeChild") {
      hostileParent = hand;
      failureFlag = "throwAfterRemoveChild";
      hand.appendChild(document.createTextNode("hostile extra child"));
    } else {
      const name = findTreeNode(cards[0], (node) => node.className === "hud-card__name");
      assert.ok(name);
      const replacement = document.createElement("em");
      replacement.className = name.className;
      replacement.textContent = name.textContent;
      hostileParent = name.parentNode;
      hostileParent.replaceChild(replacement, name);
      failureFlag = "throwAfterReplaceChild";
    }

    const beforeBytes = allBytes(layers);
    const beforeIdentities = treeIdentitySnapshot(layers);
    hostileParent[failureFlag] = true;
    session.step();
    const next = createGameUiFrame(session);

    assert.throws(() => mounted.project(next), new RegExp(`mutate-then-throw ${operation}`, "u"));
    assert.equal(allBytes(layers), beforeBytes,
      `${operation} failure restores the complete prior serialized tree`);
    assertSameTreeIdentities(layers, beforeIdentities);
    assert.equal(mounted.canHandoff(), true, "a successful rollback keeps the mount usable");

    mounted.project(next);
    const nextHud = hudTree(layers.hud.childNodes[0]);
    assert.equal(layers.hud.childNodes[0].dataset.tick, "1");
    assert.equal(nextHud.cards.length, expectedCardCount);
    if (operation === "replaceChild") {
      assert.equal(findTreeNode(nextHud.cards[0], (node) => node.className === "hud-card__name").nodeName, "SPAN");
    }
    assert.equal(mounted.cleanup(), true);
    for (const layer of Object.values(layers)) assert.equal(layer.childNodes.length, 0);
  });
}

test("game UI projection: candidate clone failure rolls back earlier HUD edits and recovers", () => {
  const session = new GameSession(setup());
  const { document, layers } = treeFixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(createGameUiFrame(session));
  const root = layers.hud.childNodes[0];
  const { hand, cards } = hudTree(root);
  hand.removeChild(cards.at(-1));
  const beforeBytes = allBytes(layers);
  const beforeIdentities = treeIdentitySnapshot(layers);
  const createElement = document.createElement.bind(document);
  document.createElement = (name) => {
    const node = createElement(name);
    if (name === "span") {
      const clone = node.cloneNode.bind(node);
      node.cloneNode = function hostileClone(deep = false) {
        if (this.className === "hud-card") throw new Error("hostile candidate clone");
        return clone(deep);
      };
    }
    return node;
  };
  session.step();
  const next = createGameUiFrame(session);

  assert.throws(() => mounted.project(next), /hostile candidate clone/u);
  assert.equal(allBytes(layers), beforeBytes);
  assertSameTreeIdentities(layers, beforeIdentities);
  assert.equal(mounted.canHandoff(), true);

  document.createElement = createElement;
  mounted.project(next);
  assert.equal(layers.hud.childNodes[0].dataset.tick, "1");
  assert.equal(hudTree(layers.hud.childNodes[0]).cards.length, cards.length);
  assert.equal(mounted.cleanup(), true);
  for (const layer of Object.values(layers)) assert.equal(layer.childNodes.length, 0);
});

test("game UI projection: restore handoff retains identical DOM and admits the new session", () => {
  const source = new GameSession(setup());
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(createGameUiFrame(source));
  const prior = layerChildren(layers);

  const restored = GameSession.restore(source.serialize());
  const restoredFrame = createGameUiFrame(restored);
  assert.notStrictEqual(restoredFrame.source, createGameUiFrame(source).source);
  mounted.handoff(restoredFrame);
  assertSameLayerChildren(layers, prior);

  restored.step();
  const advanced = createGameUiFrame(restored);
  mounted.project(advanced);
  for (const layer of Object.values(layers)) {
    assert.equal(layer.children[0].dataset.tick, "1");
  }
  assert.equal(mounted.cleanup(), true);
});

test("game UI projection: restore handoff rewinds the HUD without replacing its slot hierarchy", () => {
  const source = new GameSession(setup());
  const checkpoint = source.serialize();
  const { layers } = treeFixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(createGameUiFrame(source));

  source.stepMany(3);
  mounted.project(createGameUiFrame(source));
  for (const layer of Object.values(layers)) {
    assert.equal(layer.children[0].dataset.tick, "3");
  }
  const laterChildren = layerChildren(layers);
  const laterHud = hudTree(laterChildren.hud[0]);
  const laterCards = [...laterHud.cards];
  const laterParents = laterCards.map((card) => card.parentNode);

  const restored = GameSession.restore(checkpoint);
  mounted.handoff(createGameUiFrame(restored));

  for (const [name, layer] of Object.entries(layers)) {
    assert.equal(layer.children[0].dataset.tick, "0", `${name} restored tick`);
    if (name === "hud") {
      assert.strictEqual(layer.children[0], laterChildren[name][0],
        "the HUD frame can be updated in place across a rewind");
    } else {
      assert.notStrictEqual(layer.children[0], laterChildren[name][0],
        `${name} changed content after rewind`);
    }
  }
  const restoredHud = hudTree(layers.hud.children[0]);
  assert.equal(restoredHud.projection.dataset.tick, "0");
  assert.deepEqual(restoredHud.cards, laterCards);
  assert.deepEqual(restoredHud.cards.map((card) => card.parentNode), laterParents);
  assert.equal(mounted.cleanup(), true);
});

test("game UI projection: mismatched and backward canonical frames preserve every DOM byte", () => {
  const session = new GameSession(setup());
  const zero = createGameUiFrame(session);
  session.step();
  const one = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(one);
  const before = allBytes(layers);
  const otherSession = new GameSession(setup());
  otherSession.step();
  const other = createGameUiFrame(otherSession);
  assert.throws(() => mounted.project(other), /different session/u);
  assert.equal(allBytes(layers), before);
  assert.throws(() => mounted.project(zero), /backward/u);
  assert.equal(allBytes(layers), before);
});

test("game UI projection: hostile frames and accessors execute nothing and write nothing", () => {
  const session = new GameSession(setup());
  const frame = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(frame);
  const before = allBytes(layers);
  let calls = 0;
  const proxy = new Proxy({}, { get() { calls += 1; throw new Error("executed"); } });
  assert.throws(() => mounted.project(proxy), /canonical session frame/u);
  assert.throws(() => createGameUiFrame(proxy), /authentic GameSession/u);
  const accessor = {};
  Object.defineProperty(accessor, "tick", {
    enumerable: true,
    get() { calls += 1; throw new Error("executed"); },
  });
  assert.throws(() => composeGameUiFrame(accessor), /minted by this module/u);
  assert.equal(calls, 0);
  assert.equal(allBytes(layers), before);
});

test("game UI projection: staging and commit failures roll back all live layers", () => {
  const session = new GameSession(setup());
  const frame = createGameUiFrame(session);
  const first = fixture();
  const mounted = mountGameUiProjection(first.layers);
  mounted.project(frame);
  const before = allBytes(first.layers);
  session.step();
  const next = createGameUiFrame(session);
  const originalCreate = first.document.createElement.bind(first.document);
  let creates = 0;
  first.document.createElement = (name) => {
    if (++creates === 4) throw new Error("hostile staging");
    return originalCreate(name);
  };
  assert.throws(() => mounted.project(next), /hostile staging/u);
  assert.equal(allBytes(first.layers), before);
  first.document.createElement = originalCreate;

});

for (const failingLayer of ["combat", "effects", "feedback", "hud"]) {
  test(`game UI projection: ${failingLayer} mutate-then-throw rolls back itself and prior layers`, () => {
    const session = new GameSession(setup());
    const zero = createGameUiFrame(session);
    session.step();
    const one = createGameUiFrame(session);
    const { layers } = fixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(zero);
    const before = allBytes(layers);
    layers[failingLayer].throwAfterReplace = true;
    assert.throws(() => mounted.project(one), /mutate-then-throw/u);
    assert.equal(allBytes(layers), before);
  });
}

for (const behavior of ["before", "one", "all", "empty"]) {
  test(`game UI projection: ${behavior} host failure restores exact child identities and recovers`, () => {
    const session = new GameSession(setup());
    const zero = createGameUiFrame(session);
    session.step();
    const one = createGameUiFrame(session);
    session.step();
    const two = createGameUiFrame(session);
    const { document, layers } = fixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(zero);
    if (behavior === "one") {
      const unrelated = new Node(document, "unrelated");
      unrelated.textContent = "preserve me";
      layers.combat.appendChild(unrelated);
    }
    const prior = layerChildren(layers);
    const before = allBytes(layers);
    installHostileCommit(layers.effects, behavior);

    assert.throws(() => mounted.project(one), /hostile/u);
    assert.equal(allBytes(layers), before);
    assertSameLayerChildren(layers, prior);
    for (const name of Object.keys(layers)) {
      assert.equal(layers[name].children[0].dataset.tick, "0", name);
    }

    mounted.project(two);
    for (const name of Object.keys(layers)) {
      assert.equal(layers[name].children[0].dataset.tick, "2", name);
    }
  });
}

test("game UI projection: an empty prior DOM rolls back and accepts a later update", () => {
  const session = new GameSession(setup());
  const zero = createGameUiFrame(session);
  session.step();
  const one = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  installHostileCommit(layers.effects, "empty");
  const before = allBytes(layers);
  assert.throws(() => mounted.project(zero), /hostile/u);
  assert.equal(allBytes(layers), before);
  for (const layer of Object.values(layers)) assert.equal(layer.children.length, 0);
  mounted.project(one);
  for (const name of Object.keys(layers)) {
    assert.equal(layers[name].children[0].dataset.tick, "1", name);
  }
});

test("game UI projection: restoration failure poisons the mount without later writes", () => {
  const session = new GameSession(setup());
  const zero = createGameUiFrame(session);
  session.step();
  const one = createGameUiFrame(session);
  session.step();
  const two = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(zero);
  const calls = installRestorationFailure(layers.effects);
  assert.equal(mounted.canHandoff(), true);
  assert.throws(() => mounted.project(one), /poisoned/u);
  assert.equal(mounted.canHandoff(), false);
  const afterFailure = allBytes(layers);
  assert.equal(calls(), 2);
  assert.throws(() => mounted.project(two), /poisoned/u);
  assert.equal(calls(), 2);
  assert.equal(allBytes(layers), afterFailure);
  assert.equal(mounted.cleanup(), true);
  assert.equal(mounted.canHandoff(), false);
  assert.equal(allBytes(layers), afterFailure);
  assert.equal(mounted.cleanup(), false);
});

test("game UI projection: composition rejects every hostile proxy class without callbacks", () => {
  let callbacks = 0;
  const handler = new Proxy({}, {
    get(_target, _key) {
      return () => { callbacks += 1; throw new Error("proxy trap executed"); };
    },
  });
  const objectProxy = new Proxy({}, handler);
  const callableProxy = new Proxy(() => {}, handler);
  const revoked = Proxy.revocable({}, handler);
  revoked.revoke();
  const crossRealmProxy = vm.runInNewContext(
    "new Proxy({}, {get(){ bump(); throw new Error('cross-realm trap executed') }, getPrototypeOf(){ bump(); throw new Error('cross-realm trap executed') }, ownKeys(){ bump(); throw new Error('cross-realm trap executed') }})",
    { bump() { callbacks += 1; } },
  );
  const accessorTarget = {};
  Object.defineProperty(accessorTarget, "tick", {
    enumerable: true,
    get() { callbacks += 1; throw new Error("accessor executed"); },
  });
  const accessorProxy = new Proxy(accessorTarget, handler);
  for (const hostile of [objectProxy, callableProxy, revoked.proxy, crossRealmProxy, accessorProxy]) {
    assert.throws(() => composeGameUiFrame(hostile), /minted by this module/u);
  }
  assert.equal(callbacks, 0);
});

test("game UI projection: options reject every hostile proxy class without callbacks", () => {
  const session = new GameSession(setup());
  let callbacks = 0;
  const handler = new Proxy({}, {
    get() { return () => { callbacks += 1; throw new Error("options trap executed"); }; },
  });
  const objectProxy = new Proxy({}, handler);
  const callableProxy = new Proxy(() => {}, handler);
  const revoked = Proxy.revocable({}, handler);
  revoked.revoke();
  const crossRealmProxy = vm.runInNewContext(
    "new Proxy({}, {get(){ bump(); throw new Error('options trap') }, getPrototypeOf(){ bump(); throw new Error('options trap') }, ownKeys(){ bump(); throw new Error('options trap') }})",
    { bump() { callbacks += 1; } },
  );
  const accessorTarget = {};
  Object.defineProperty(accessorTarget, "localSide", {
    enumerable: true,
    get() { callbacks += 1; throw new Error("options accessor executed"); },
  });
  const accessorProxy = new Proxy(accessorTarget, handler);
  for (const hostile of [objectProxy, callableProxy, revoked.proxy, crossRealmProxy, accessorProxy]) {
    assert.throws(() => createGameUiFrame(session, hostile), /minted by this module/u);
  }
  assert.equal(callbacks, 0);
});

test("game UI projection: frame creation mints once and performs zero session restores", () => {
  const session = new GameSession(setup());
  const originalRestore = GameSession.restore;
  const originalSnapshot = GameSession.prototype.projectionSnapshot;
  let restores = 0;
  let snapshots = 0;
  GameSession.restore = (...args) => { restores += 1; return originalRestore(...args); };
  GameSession.prototype.projectionSnapshot = function projectionSnapshotProbe(...args) {
    snapshots += 1;
    return originalSnapshot.call(this, ...args);
  };
  try {
    const frame = createGameUiFrame(session);
    assert.equal(frame.tick, 0);
  } finally {
    GameSession.restore = originalRestore;
    GameSession.prototype.projectionSnapshot = originalSnapshot;
  }
  assert.equal(snapshots, 1);
  assert.equal(restores, 0);
});

test("game UI projection: combat frame and mount never read raw replay authorities", () => {
  const session = new GameSession(setup());
  const originalSnapshot = GameSession.prototype.projectionSnapshot;
  const originalReplay = Object.getOwnPropertyDescriptor(GameSession.prototype, "replay");
  const originalReplayBytes = GameSession.prototype.replayBytes;
  const snapshots = [mutableProjectionSnapshot(session, originalSnapshot)];
  session.step();
  snapshots.push(mutableProjectionSnapshot(session, originalSnapshot));
  let snapshotGetterHits = 0;
  let producerGetterHits = 0;
  for (const snapshot of snapshots) {
    Object.defineProperty(snapshot, "replay", {
      configurable: true,
      enumerable: true,
      get() {
        snapshotGetterHits += 1;
        throw new Error("CRITIC: snapshot.replay was read");
      },
    });
  }
  Object.defineProperty(GameSession.prototype, "replay", {
    configurable: true,
    enumerable: false,
    get() {
      producerGetterHits += 1;
      throw new Error("CRITIC: producer replay was read");
    },
  });
  GameSession.prototype.replayBytes = function replayBytesProbe() {
    producerGetterHits += 1;
    throw new Error("CRITIC: producer replay bytes were read");
  };
  let index = 0;
  GameSession.prototype.projectionSnapshot = function hostileSnapshot() {
    return snapshots[index++];
  };
  try {
    const zero = createGameUiFrame(session);
    const one = createGameUiFrame(session);
    assert.equal(projectionBytes(zero), projectionBytes(zero));
    assert.equal(projectionBytes(one), projectionBytes(one));
    const { layers } = fixture();
    const mounted = mountGameUiProjection(layers);
    mounted.project(zero);
    mounted.project(one);
  } finally {
    GameSession.prototype.projectionSnapshot = originalSnapshot;
    if (originalReplay) Object.defineProperty(GameSession.prototype, "replay", originalReplay);
    else delete GameSession.prototype.replay;
    GameSession.prototype.replayBytes = originalReplayBytes;
  }
  assert.equal(snapshotGetterHits, 0);
  assert.equal(producerGetterHits, 0);
});

test("game UI projection: terminal feedback never reads raw producer authorities", () => {
  const configured = setup({
    candidates: [{ cardId: "coilblade", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 2,
  });
  const session = new GameSession(configured);
  session.submitPlayerCommand(canonical({
    cardId: "coilblade",
    commandId: 0,
    point: { x: 14_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("coilblade"),
    tick: 105,
    type: "deploy",
  }));
  session.stepMany(3_000);
  assert.equal(session.state.tick, 1_590);

  const names = ["events", "replay", "replayBytes", "state"];
  const descriptors = new Map(names.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(GameSession.prototype, name),
  ]));
  const hits = Object.fromEntries(names.map((name) => [name, 0]));
  for (const name of names) {
    Object.defineProperty(GameSession.prototype, name, {
      configurable: true,
      get() {
        hits[name] += 1;
        throw new Error(`FORBIDDEN producer ${name}`);
      },
    });
  }
  try {
    const frame = createGameUiFrame(session);
    assert.equal(frame.feedback.overlay.reason, "central_destroyed");
    const { layers } = fixture();
    mountGameUiProjection(layers).project(frame);
    assert.equal(layers.feedback.children[0].dataset.tick, "1590");
  } finally {
    for (const name of names) {
      const descriptor = descriptors.get(name);
      if (descriptor) Object.defineProperty(GameSession.prototype, name, descriptor);
      else delete GameSession.prototype[name];
    }
  }
  assert.deepEqual(hits, { events: 0, replay: 0, replayBytes: 0, state: 0 });
});

test("game UI projection: tower health denominators come from the authoritative snapshot", () => {
  const session = new GameSession(setup({
    initialWindupTicks: { central: 37, lane: 19 },
  }));
  const originalSnapshot = GameSession.prototype.projectionSnapshot;
  let capturedSnapshot;
  GameSession.prototype.projectionSnapshot = function projectionSnapshotCapture(...args) {
    capturedSnapshot = originalSnapshot.call(this, ...args);
    return capturedSnapshot;
  };
  let frame;
  try {
    frame = createGameUiFrame(session);
  } finally {
    GameSession.prototype.projectionSnapshot = originalSnapshot;
  }

  const projectionTowers = new Map(capturedSnapshot.state.battle.towers
    .map((tower) => [tower.id, tower]));
  for (const tower of frame.combat.towers) {
    const projected = projectionTowers.get(tower.id);
    assert.equal(tower.healthDenominator, projected.maxHitpoints);
    assert.equal(projected.maxHitpoints, TOWER_COMBAT_CONFIG[projected.role].hitpoints);
  }
});

test("game UI projection: tick-120 live replay normalizes identically across chunks and restore", () => {
  const configured = setup();
  const direct = new GameSession(configured);
  direct.stepMany(120);
  const directFrame = createGameUiFrame(direct);
  assert.equal(directFrame.tick, 120);
  assert.ok(directFrame.effects.events.some((event) =>
    event.phase === "damage" && event.tick === 79 && event.payload.targetId > 0));

  const chunked = new GameSession(configured);
  for (const count of [1, 17, 3, 41, 58]) chunked.stepMany(count);
  assert.equal(projectionBytes(createGameUiFrame(chunked)), projectionBytes(directFrame));

  const restored = GameSession.restore(direct.serialize());
  assert.equal(projectionBytes(createGameUiFrame(restored)), projectionBytes(directFrame));
});

test("game UI projection: authentic projectile lifecycle keeps exact IDs, ticks, and order", () => {
  const configured = setup({
    candidates: [{ cardId: "copperskiff", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 3,
  });
  const session = new GameSession(configured);
  session.submitPlayerCommand(canonical({
    cardId: "copperskiff",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("copperskiff"),
    tick: 0,
    type: "deploy",
  }));
  session.stepMany(320);
  const frame = createGameUiFrame(session);
  const feed = session.projectionSnapshot().combatEffectFeed;
  assert.deepEqual(frame.effects.events, feed.records);
  const phases = new Set(frame.effects.events.map(({ phase }) => phase));
  for (const phase of ["open", "contact", "damage", "close"]) {
    assert.equal(phases.has(phase), true, phase);
  }
  const launches = frame.effects.events.filter(({ phase }) => phase === "open");
  assert.ok(launches.length > 0);
  assert.ok(launches.every(({ payload }) => payload.projectileId !== null));
  assert.ok(frame.combat.events.some(({ type }) => type === "target"));
});

test("game UI projection: an actual Briar melee record selects the attack frame and restores exactly", () => {
  const deck = ["briar-band", "mossguard",
    ...PLAYABLE_CARD_IDS.filter((id) => id !== "briar-band" && id !== "mossguard").slice(0, 6)];
  const configured = JSON.parse(createEditableGameSessionSetup(deck, 2));
  configured.legalNorthDeployments = [
    { cardId: "mossguard", point: { x: 3_500, y: 17_500 } },
  ];
  configured.thinkIntervalTicks = 3_600;
  configured.thinkOffsetTicks = 0;
  const session = new GameSession(canonical(configured));
  const slot = session.state.decks.south.hand.indexOf("briar-band");
  assert.notEqual(slot, -1, "the legal Briar card is in the real player's hand");
  session.submitPlayerCommand(canonical({
    cardId: "briar-band",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));

  let witness = null;
  for (let step = 0; step < 600 && witness === null; step += 1) {
    const events = session.step();
    const units = new Map(session.state.battle.units.map((unit) => [unit.id, unit]));
    const attack = events.find((event) => event.type === "attack" &&
      units.get(event.attackerId)?.archetypeId === "briar-runner");
    if (!attack) continue;
    const attacker = units.get(attack.attackerId);
    const damage = events.find((event) => event.type === "damage" &&
      event.attackerId === attack.attackerId && event.targetId === attack.targetId &&
      event.delivery === "melee" && event.tick === attack.tick);
    if (!damage) continue;
    witness = { attack, attacker, damage };
  }
  assert.ok(witness, "the actual deployed Briar lands a primary melee attack within 600 ticks");
  const { attack, attacker, damage } = witness;
  const sourceTick = attacker.spawnedAt + attacker.attack.nextAttackTick -
    attacker.attack.config.hitSpeedTicks;
  assert.equal(attacker.delivery, "melee");
  assert.equal(attack.sequence, attacker.attack.attackSequence);
  assert.equal(attack.targetId, attacker.attack.targetId);
  assert.equal(attack.tick, sourceTick,
    "the rendered contact tick joins the actual attack record to the unit attack cycle");
  assert.equal(damage.attackerId, attack.attackerId);
  assert.equal(damage.currentHealthAfter, damage.currentHealthBefore - damage.amount);

  const checkpoint = session.serialize();
  const frame = createGameUiFrame(session);
  const attackAge = frame.tick - attack.tick;
  assert.equal(attackAge, 1,
    "the genuine primary contact is rendered at its first aged simulation boundary");
  assert.ok(attackAge < 4,
    "the source strike is still in the motion projection's primary attack pose");
  const originalLayers = fixture().layers;
  mountGameUiProjection(originalLayers).project(frame);
  const markerFor = (layers, id) => layers.combat.children[0].children.find((node) =>
    node.dataset.combatId === String(id));
  const artFor = (layers, id) => markerFor(layers, id).children.find((node) =>
    node.dataset.artId === "briar-runner");
  const attackArt = artFor(originalLayers, attack.attackerId);
  assert.equal(attackArt.dataset.spriteAction, "attack");
  assert.equal(attackArt.dataset.attackSourceId, String(attack.attackerId));
  assert.equal(attackArt.dataset.attackSourceSequence, String(attack.sequence));
  assert.equal(attackArt.dataset.attackSourceTick, String(attack.tick));
  assert.equal(attackArt.dataset.attackSourceClass, "melee");
  assert.equal(attackArt.dataset.simulationTick, String(frame.tick));
  assert.equal(attackArt.dataset.attackAnimationAge, String(attackAge));
  assert.equal(attackArt.dataset.spriteFrame, selectBriarRunnerFrame({
    action: "attack",
    direction: attackArt.dataset.spriteDirection,
    tick: attackAge,
  }).id);

  const restored = GameSession.restore(checkpoint);
  const restoredFrame = createGameUiFrame(restored);
  const restoredLayers = fixture().layers;
  mountGameUiProjection(restoredLayers).project(restoredFrame);
  assert.equal(allBytes(restoredLayers), allBytes(originalLayers),
    "the true attack frame and source identity restore to identical DOM bytes");

  session.stepMany(2);
  const agedFrame = createGameUiFrame(session);
  const agedLayers = fixture().layers;
  mountGameUiProjection(agedLayers).project(agedFrame);
  const agedArt = artFor(agedLayers, attack.attackerId);
  const agedAttackAge = agedFrame.tick - attack.tick;
  assert.equal(agedAttackAge, 3);
  assert.equal(agedArt.dataset.spriteAction, "attack");
  assert.equal(agedArt.dataset.attackSourceTick, String(attack.tick));
  assert.equal(agedArt.dataset.simulationTick, String(agedFrame.tick));
  assert.equal(agedArt.dataset.attackAnimationAge, String(agedAttackAge));
  assert.equal(agedArt.dataset.spriteFrame, selectBriarRunnerFrame({
    action: "attack",
    direction: agedArt.dataset.spriteDirection,
    tick: agedAttackAge,
  }).id);
  assert.notEqual(agedArt.dataset.spriteFrame, attackArt.dataset.spriteFrame,
    "real simulation age advances the primary attack atlas frame before recoil");

  session.step();
  const recovered = createGameUiFrame(session);
  const recoveredLayers = fixture().layers;
  mountGameUiProjection(recoveredLayers).project(recovered);
  const recoveredArt = artFor(recoveredLayers, attack.attackerId);
  assert.equal(recoveredArt.dataset.spriteAction, "walk",
    "the attack frame ends as soon as the canonical strike pose ages into recoil");
  assert.equal(recoveredArt.dataset.attackSourceTick, undefined);
});

test("game UI projection: non-Briar play output matches the accepted 5ed parent modules", {
  skip: process.env.ART004_PARENT_ROOT ? false : "set ART004_PARENT_ROOT to the accepted 5ed checkout",
}, async () => {
  const parentRoot = resolve(process.env.ART004_PARENT_ROOT);
  const parentSha = execFileSync("git", ["-C", parentRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  assert.equal(parentSha, "5ed9d7c76a7bf3b4b3c6fe6a98102921e078f146",
    "projection comparison must execute the exact accepted parent source");
  const parentStatus = execFileSync("git", ["-C", parentRoot, "status", "--porcelain=v1",
    "--untracked-files=no", "--", "src", "public", "tests", "package.json", "package-lock.json"], {
    encoding: "utf8",
  });
  assert.equal(parentStatus, "", "the accepted parent's source, assets, tests, and manifest are clean");
  assert.equal(createHash("sha256").update(readFileSync(resolve(parentRoot, "package-lock.json")))
    .digest("hex"), "d707c780097d5e60bd33d03a60a35087c04c789f2f44717bb6812913bf933bf4",
  "the accepted parent lockfile matches the Round 476 source fence");
  const parentModule = (path) => import(pathToFileURL(resolve(parentRoot, path)).href);
  const [parentSessionModule, parentProjection] = await Promise.all([
    parentModule("src/sim/game-session.js"),
    parentModule("src/ui/game-ui-projection.js"),
  ]);

  const setupBytes = setup({
    candidates: [{ cardId: "mossguard", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 0,
    think: 3_600,
  });
  const current = new GameSession(setupBytes);
  const parent = new parentSessionModule.GameSession(setupBytes);
  const command = (session) => {
    const slot = session.state.decks.south.hand.indexOf("mossguard");
    assert.notEqual(slot, -1, "the parent and candidate both start with Mossguard in hand");
    return canonical({
      cardId: "mossguard",
      commandId: 0,
      point: { x: 3_500, y: 14_500 },
      slot,
      tick: session.state.tick,
      type: "deploy",
    });
  };
  current.submitPlayerCommand(command(current));
  parent.submitPlayerCommand(command(parent));

  const output = (session, projector) => {
    const layers = treeFixture().layers;
    projector.mountGameUiProjection(layers).project(projector.createGameUiFrame(session));
    return allBytes(layers);
  };
  const frames = [0, 1, 8, 32];
  for (const tick of frames) {
    if (tick > current.state.tick) {
      current.stepMany(tick - current.state.tick);
      parent.stepMany(tick - parent.state.tick);
    }
    assert.equal(current.serialize(), parent.serialize(),
      `the deterministic non-Briar session state agrees at tick ${tick}`);
    assert.equal(output(current, { createGameUiFrame, mountGameUiProjection }),
      output(parent, parentProjection),
      `the complete non-Briar combat, effects, feedback, and HUD tree agrees at tick ${tick}`);
  }
});

test("game UI projection: seed-2 live terminal clears dead targets and is chunk/restore exact", () => {
  const configured = setup({
    candidates: [{ cardId: "coilblade", point: { x: 3_500, y: 17_500 } }],
    initialWindupTicks: { central: 10_000, lane: 10_000 },
    seed: 2,
  });
  const admit = (session) => session.submitPlayerCommand(canonical({
    cardId: "coilblade",
    commandId: 0,
    point: { x: 14_500, y: 14_500 },
    slot: session.state.decks.south.hand.indexOf("coilblade"),
    tick: 105,
    type: "deploy",
  }));

  const direct = new GameSession(configured);
  admit(direct);
  direct.stepMany(3_000);
  const directFrame = createGameUiFrame(direct);
  assert.equal(directFrame.tick, 1_590);
  assert.equal(directFrame.feedback.overlay.reason, "central_destroyed");

  const chunked = new GameSession(configured);
  admit(chunked);
  for (const count of [317, 500, 2, 770, 1_412]) chunked.stepMany(count);
  assert.equal(projectionBytes(createGameUiFrame(chunked)), projectionBytes(directFrame));

  const restored = GameSession.restore(direct.serialize());
  assert.equal(projectionBytes(createGameUiFrame(restored)), projectionBytes(directFrame));
});

test("game UI projection: stale same-tick frame cannot replace newer selected-card bytes", () => {
  const session = new GameSession(setup());
  const stale = createGameUiFrame(session);
  const selected = session.state.decks.south.hand[0];
  const current = createGameUiFrame(session, createGameUiOptions("south", selected));
  assert.equal(stale.tick, current.tick);
  assert.notEqual(stale.sequence, current.sequence);
  assert.notDeepEqual(stale.hud, current.hud);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(current);
  const before = allBytes(layers);
  assert.throws(() => mounted.project(stale), /sequence must advance strictly/u);
  assert.equal(allBytes(layers), before);
});

test("game UI projection: cleanup is idempotent and rejects later projection", () => {
  const session = new GameSession(setup());
  const frame = createGameUiFrame(session);
  const { layers } = fixture();
  const mounted = mountGameUiProjection(layers);
  mounted.project(frame);
  assert.equal(mounted.cleanup(), true);
  const empty = allBytes(layers);
  assert.equal(mounted.cleanup(), false);
  assert.equal(allBytes(layers), empty);
  assert.throws(() => mounted.project(frame), /cleaned up/u);
  assert.equal(allBytes(layers), empty);
});

test("game UI projection: a real terminal session drives the match overlay at tick 18000", () => {
  const configured = JSON.parse(setup());
  configured.legalNorthDeployments = [];
  configured.startingElixir = { north: 0, south: 0 };
  configured.thinkIntervalTicks = 3_600;
  const session = new GameSession(canonical(configured));
  session.stepMany(18_000);
  const frame = createGameUiFrame(session);
  assert.equal(frame.tick, 18_000);
  assert.notEqual(frame.feedback.overlay, null);
  const { layers } = fixture();
  mountGameUiProjection(layers).project(frame);
  assert.equal(layers.feedback.children[0].dataset.tick, "18000");
  assert.ok(layers.feedback.children[0].children.some((node) =>
    node.className === "match-feedback__overlay"));
});

test("Kilnkeeper UI projectile follows the authenticated live position through restore", () => {
  const deck = ["kilnkeeper", "cinder-host",
    ...PLAYABLE_CARD_IDS.filter((id) => id !== "kilnkeeper" && id !== "cinder-host").slice(0, 6)];
  const configured = JSON.parse(createEditableGameSessionSetup(deck, 2));
  configured.legalNorthDeployments = [
    { cardId: "cinder-host", point: { x: 3_500, y: 21_000 } },
  ];
  configured.startingElixir = { north: 10, south: 10 };
  configured.thinkIntervalTicks = 3_600;
  const session = new GameSession(canonical(configured));
  const slot = session.state.decks.south.hand.indexOf("kilnkeeper");
  assert.notEqual(slot, -1);
  session.submitPlayerCommand(canonical({
    cardId: "kilnkeeper",
    commandId: 0,
    point: { x: 3_500, y: 14_500 },
    slot,
    tick: session.state.tick,
    type: "deploy",
  }));
  session.stepMany(121);
  let projectile = session.state.battle.projectiles.find(({ splashProfile }) =>
    splashProfile?.homing === true);
  assert.ok(projectile, "the actual shared host has a pending Kilnkeeper projectile");
  const launch = session.replay.find(({ projectile: record, type }) =>
    type === "projectile-launch" && record?.id === projectile.id);
  assert.ok(launch);
  for (let attempt = 0; attempt < 12 &&
      projectile.position.x === launch.projectile.origin.x &&
      projectile.position.y === launch.projectile.origin.y; attempt += 1) {
    session.step();
    projectile = session.state.battle.projectiles.find(({ id }) => id === projectile.id);
  }
  assert.ok(projectile, "the pending projectile remains live while it pursues its target");
  assert.notDeepEqual(projectile.position, launch.projectile.origin,
    "the actual homing runtime has moved the pending projectile");

  const checkpoint = session.serialize();
  const originalReplay = session.replayBytes();
  const frame = createGameUiFrame(session);
  const root = frame.effects.events.find((event) => event.phase === "open" &&
    event.payload.direction === projectile.direction &&
    event.payload.sourceId === projectile.sourceId &&
    event.payload.sequence === projectile.attackSequence &&
    event.payload.projectileId === projectile.projectileId);
  assert.ok(root, "the effect root retains direction, typed source, attack sequence, and projectile id");
  const visual = frame.effects.projectiles.find(({ key }) => key === root.rootId);
  assert.ok(visual, "the pending projectile remains visible after its provisional contact tick");
  assert.deepEqual(visual.point, {
    denominator: "1",
    xNumerator: String(projectile.position.x),
    yNumerator: String(projectile.position.y),
  }, "the arena projection uses the current source position rather than interpolating to launch aim");
  const effectsBytes = serializeCombatEffectsViewModel(frame.effects);
  assert.equal(serializeCombatEffectsViewModel(restoreCombatEffectsViewModel(
    effectsBytes,
    session.state.battle.projectiles,
  )), effectsBytes);

  const restored = GameSession.restore(checkpoint);
  const forked = GameSession.restore(checkpoint);
  assert.equal(restored.serialize(), checkpoint);
  assert.equal(forked.serialize(), checkpoint);
  assert.equal(restored.replayBytes(), originalReplay);
  const restoredFrame = createGameUiFrame(restored);
  const forkedFrame = createGameUiFrame(forked);
  assert.equal(serializeCombatEffectsViewModel(restoredFrame.effects), effectsBytes);
  assert.equal(serializeCombatEffectsViewModel(forkedFrame.effects), effectsBytes);
  assert.equal(projectionBytes(restoredFrame), projectionBytes(frame));
  assert.equal(projectionBytes(forkedFrame), projectionBytes(frame));

  const originalLayers = fixture().layers;
  const restoredLayers = fixture().layers;
  mountGameUiProjection(originalLayers).project(frame);
  mountGameUiProjection(restoredLayers).project(restoredFrame);
  assert.equal(allBytes(restoredLayers), allBytes(originalLayers),
    "the actual combat and effect DOM bytes match after session restore");

  const hasContact = (candidate) => candidate.replay.some((event) =>
    event.type === "projectile-impact" && event.status === "contact" &&
    JSON.stringify(event.projectileIdentity) === JSON.stringify(projectile.projectileIdentity));
  let contactSteps = 0;
  while (!hasContact(session) && contactSteps < 128) {
    session.step();
    restored.step();
    forked.step();
    contactSteps += 1;
  }
  assert.ok(contactSteps > 0 && hasContact(session),
    "the actual ordinary splash projectile reaches its target on the shared host");
  assert.equal(session.serialize(), restored.serialize());
  assert.equal(session.serialize(), forked.serialize());

  const warmContact = createGameUiFrame(session);
  const coldBranch = GameSession.restore(checkpoint);
  coldBranch.stepMany(contactSteps);
  const coldContact = createGameUiFrame(coldBranch);
  const rootId = root.rootId;
  const warmBursts = warmContact.effects.areas.filter(({ key }) =>
    key.startsWith(`${rootId}:splash:`));
  const coldBursts = coldContact.effects.areas.filter(({ key }) =>
    key.startsWith(`${rootId}:splash:`));
  assert.equal(warmBursts.length, 1,
    "the real impact produces one visible burst even though its primary contact has repeated feed records");
  assert.deepEqual(coldBursts, warmBursts,
    "a cold restored branch rebuilds the same geometry for the same full projectile identity");
  assert.equal(projectionBytes(coldContact), projectionBytes(warmContact),
    "warm and cold derivation agree across a restored branch with the same history length");
  assert.equal(projectionBytes(createGameUiFrame(restored)), projectionBytes(warmContact));
  assert.equal(projectionBytes(createGameUiFrame(forked)), projectionBytes(warmContact));
});
