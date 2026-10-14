import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createEditableGameSessionSetup } from '../src/content/editable-deck.js';
import { GameSession } from '../src/sim/game-session.js';
import { clientPointToArenaPoint } from '../src/ui/input-controller.js';
import { createGameUiFrame, mountGameUiProjection } from '../src/ui/game-ui-projection.js';
import { createCombatMotionView } from '../src/ui/combat-motion.js';

const ROOT = '/private/tmp/frame-restore-round3-checkbase';
const OUTPUT = '/private/tmp/frame-restore-round3-builder/artifacts/frame-restore-round3/builder/legacy-095-guard-proof';
const DECK = ['skymaul','brassbolt','reedsting','briar-band','cinderlings','coilblade','mossguard','copperskiff'];

class Node {
  constructor(ownerDocument, name = 'node') {
    this.ownerDocument = ownerDocument; this.name = name; this.children = [];
    this.dataset = {}; this.attributes = new Map(); this.className = '';
    this.innerHTML = ''; this.textContent = '';
    this.style = { setProperty() {} };
  }
  get childNodes() { return this.children; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  replaceChildren(...children) { for (const child of children) child.parentNode = this; this.children = children; }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
}
let reducedMotion = false;
const document = {
  defaultView: { matchMedia: () => ({ matches: reducedMotion }) },
  createElement(name) { return new Node(document, name); },
  createElementNS(_namespace, name) { return new Node(document, name); },
};
const layers = Object.fromEntries(['combat','effects','feedback','hud']
  .map((name) => [name, new Node(document, name)]));

const commit = execFileSync('git',['-C',ROOT,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
if (commit !== '095a8c55a6721c74f7555939a9ce21182bec3f2a') throw new Error(`unexpected source commit ${commit}`);
const setup = createEditableGameSessionSetup(DECK, 0);
const session = new GameSession(setup);
const before = JSON.parse(session.serialize());
const hand = session.state.decks.south.hand;
const slot = hand.indexOf('briar-band');
if (slot < 0) throw new Error(`Briar Band not in initial hand: ${JSON.stringify(hand)}`);
const arenaRect = { left: 90, top: 108, width: 540, height: 960 };
const clientPoint = { clientX: 90 + 540 / 2, clientY: 108 + 960 * 0.54 };
const point = clientPointToArenaPoint(arenaRect, clientPoint);
const command = { cardId:'briar-band', commandId:1, point, slot, tick:0, type:'deploy' };
const admission = session.submitPlayerCommand(JSON.stringify(command));
const projection = mountGameUiProjection(layers);
const sourceIds = [];
let found = null;
for (let count = 0; count < 600 && found === null; count += 1) {
  const events = session.stepMany(1);
  const attack = events.find((event) => event.type === 'attack' &&
    before.setup.battleSetup && event.tick >= 0);
  const actual = attack && events.find((event) => event.type === 'damage' &&
    event.attackerId === attack.attackerId && event.targetId === attack.targetId &&
    event.delivery === 'melee' && event.tick === attack.tick);
  if (attack && actual) {
    const state = session.state;
    const source = state.battle.units.find((unit) => unit.id === attack.attackerId);
    if (source?.archetypeId === 'briar-runner' && source.side === 'south') {
      found = { attack, damage: actual, sessionTick: state.tick, source };
    }
  }
}
if (!found) throw new Error('no Briar Runner melee contact within 600 ticks');

function sample(label) {
  const snapshot = session.projectionSnapshot();
  const frame = createGameUiFrame(session);
  const motion = createCombatMotionView(snapshot);
  projection.project(frame);
  const combatFrame = layers.combat.children[0];
  const marker = combatFrame.children.find((node) => node.dataset.combatId === String(found.source.id));
  const art = marker?.children.find((node) => node.attributes.get('class') === 'combat-art');
  const currentSource = snapshot.state.battle.units.find((unit) => unit.id === found.source.id);
  const relatedEvents = frame.combat.events.filter((event) => event.entityId === found.source.id);
  const motionPose = motion.poses.find((pose) => pose.id === found.source.id);
  const currentTargetId = currentSource?.attack.targetId ?? null;
  const currentTarget = [...snapshot.state.battle.units, ...snapshot.state.battle.towers]
    .find((unit) => unit.id === currentTargetId) ?? null;
  return {
    label,
    sessionTick: session.state.tick,
    sourceAttackTick: found.attack.tick,
    ageSinceAttack: session.state.tick - found.attack.tick,
    sourceId: found.source.id,
    entity: currentSource ? { alive: currentSource.alive, hitpoints: currentSource.hitpoints,
      targetId: currentTargetId, targetPresent: currentTarget !== null, targetHitpoints: currentTarget?.hitpoints ?? null,
      attackSequence: currentSource.attack.attackSequence, phase: currentSource.attack.phase,
      statusWork: currentSource.attack.statusWork, nextTick: currentSource.attack.nextTick,
      nextAttackTick: currentSource.attack.nextAttackTick,
      ticksUntilNextAttack: currentSource.attack.nextAttackTick - currentSource.attack.nextTick,
      lastStrikeTick: currentSource.spawnedAt + currentSource.attack.nextAttackTick - currentSource.attack.config.hitSpeedTicks } : null,
    sourceProjectionEvents: relatedEvents,
    projectedAction: art?.dataset.spriteAction ?? null,
    projectedPose: marker?.dataset.pose ?? null,
    projectedTick: Number(art?.dataset.simulationTick),
    projectedReducedMotion: art?.dataset.reducedMotion ?? null,
    computedMotionPose: motionPose ?? null,
    hasAttackAgeAttribute: art ? Object.hasOwn(art.dataset,'attackAnimationAge') : false,
    frameSequence: frame.sequence,
    frameSourceMatchesSession: frame.source === snapshot.source,
  };
}

const phases = [];
phases.push(sample('source-event-170-render-171'));
session.stepMany(2);
reducedMotion = true;
phases.push(sample('source-event-170-render-173'));
session.stepMany(6);
phases.push(sample('source-event-170-render-179'));
projection.cleanup();
const files = ['src/content/editable-deck.js','src/sim/game-session.js','src/ui/input-controller.js','src/ui/game-ui-projection.js','src/ui/combat-motion.js','src/ui/combat-state.js','src/sim/battle-continuation-kernel.js'];
const hashes = {};
for (const file of files) hashes[file] = createHash('sha256').update(await readFile(resolve(ROOT,file))).digest('hex');
const evidence = {
  diagnostic:'FRAME-RESTORE-001 accepted 095 nonbrowser guard proof',
  commit,
  privateCheckout:ROOT,
  setupSha256:createHash('sha256').update(setup).digest('hex'),
  serializedSetup:JSON.parse(setup),
  initialHand:hand,
  selectedSlot:slot,
  arenaRect,
  clientPoint,
  projectedDeploymentPoint:point,
  command,
  commandAdmission:admission,
  attack:{ attack:found.attack, damage:found.damage,
    sessionTick:found.sessionTick,
    source:{id:found.source.id,side:found.source.side,archetypeId:found.source.archetypeId,
      attackSequence:found.source.attack.attackSequence,phase:found.source.attack.phase,
      nextAttackTick:found.source.attack.nextAttackTick,
      lastStrikeTick:found.source.spawnedAt + found.source.attack.nextAttackTick - found.source.attack.config.hitSpeedTicks} },
  phases,
  sourceHashes:hashes,
  sourceDerivedExpectations:{
    action:'walk',
    actionReason:'game-ui-projection maps only effect-feed phase=contact to combat event type=target; accepted melee attack path emitted no source contact record for this direct melee profile, so Briar action selection receives no target reaction. The mounted view must report walk at ticks 171 and 173.',
    poseAt171:'attack',
    poseAt171Reason:'createCombatMotionView computes strikeAge=171-170=1, and sets attack for cycling units while strikeAge<8; recoil begins only at strikeAge>=4.',
    poseAt173:'idle',
    poseAt173Reason:'the actual session is in attack phase winding at tick 173, so the cycling-only attack branch is false; the source motion function sets anticipate only when nextAttackTick-nextTick is in [0,10), and the measured source values are outside that interval. The mounted and computed pose are idle.',
    attackAgeDataAttribute:'absent in accepted 095; age belongs to motion derivation, not DOM data attribute.'
  }
};
await mkdir(OUTPUT,{recursive:true});
await writeFile(resolve(OUTPUT,'legacy-095-guard-proof.json'),JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({status:'guard-proof-written',commit,attackTick:found.attack.tick,sessionTick:found.sessionTick,selectedSlot:slot,point,phases:phases.map(({label,sessionTick,projectedAction,projectedPose,projectedTick,hasAttackAgeAttribute,sourceProjectionEvents,computedMotionPose})=>({label,sessionTick,projectedAction,projectedPose,projectedTick,hasAttackAgeAttribute,sourceProjectionEvents,computedMotionPose})),output:resolve(OUTPUT,'legacy-095-guard-proof.json')}));
