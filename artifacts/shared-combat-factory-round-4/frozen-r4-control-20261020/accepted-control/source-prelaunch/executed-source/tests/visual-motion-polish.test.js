import assert from 'node:assert/strict';
import test from 'node:test';
import { MatchClock } from '../src/sim/match.js';
import { MatchFeedbackProjector, bindMatchFeedback, getMatchFeedbackStyleText } from '../src/ui/match-feedback.js';
import { GameSession } from '../src/sim/game-session.js';
import { createShippedGameSessionSetup } from '../src/ui/game-browser-entry.js';
import { createGameUiFrame, mountGameUiProjection } from '../src/ui/game-ui-projection.js';

function dom() {
  const doc = { createElement(name) { return { name, ownerDocument: doc, children: [], dataset: {}, className: '', style: { setProperty(k,v) { this[k] = v; } }, setAttribute(k,v) { this[k] = v; }, appendChild(n) { this.children.push(n); }, replaceChildren(...nodes) { this.children = nodes; } }; }, createElementNS(ns,name) { return this.createElement(name); } };
  return doc.createElement('div');
}
const bytes = node => JSON.stringify(node, (key,value) => key === 'ownerDocument' ? undefined : value);
function frame(session) {
  const layers = Object.fromEntries(['combat','effects','feedback','hud'].map(key => [key,dom()]));
  mountGameUiProjection(layers).project(createGameUiFrame(session));
  return bytes(layers);
}
const ids = ['north:central','north:lane:left','north:lane:right','south:central','south:lane:left','south:lane:right'];
function towerMatch() {
  const initialTowers = ids.map(id => ({ id, hitpoints: id.endsWith('central') ? 4824 : 3052 }));
  const match = new MatchClock({ initialTowers });
  match.scheduleTowerEvidence(10, { towers: initialTowers.map(t => ({...t, hitpoints:t.id === 'north:lane:left' ? 0:t.hitpoints})), destroyedTowerIds:['north:lane:left'] });
  return match;
}
function feedback(match) {
  const projector = new MatchFeedbackProjector();
  const view = projector.project(match.state,match.eventLog,{replayBytes:match.replayBytes(),snapshot:match.serialize()});
  const node = dom();bindMatchFeedback(node,view);return node;
}
test('motion polish: collapse, crown credit and persistent rubble follow canonical destruction age', () => {
  const match=towerMatch();match.runToTick(11);
  let node=feedback(match);let field=node.children[0].children.find(n=>n.className==='match-feedback__field');
  assert.equal(field.children[0].dataset.stage,'collapse');
  assert.equal(field.children[0].dataset.tick,'10');
  assert.equal(field.children[0].children.at(-1).dataset.scorer,'south');
  match.runToTick(70);node=feedback(match);field=node.children[0].children.find(n=>n.className==='match-feedback__field');
  assert.equal(field.children[0].dataset.stage,'rubble');
  assert.equal(field.children[0].children.length,5);
  assert.equal(bytes(feedback(MatchClock.restore(match.serialize()))),bytes(node));
});
test('motion polish: opening, combat and HUD frames are identical across chunks, restore and fresh restart', () => {
  const setup=createShippedGameSessionSetup(2);
  const direct=new GameSession(setup),chunked=new GameSession(setup);
  const initial=frame(direct);
  for(const tick of [12,24,414,438]) {
    direct.stepMany(tick-direct.state.tick);
    while(chunked.state.tick<tick) chunked.stepMany(Math.min(31,tick-chunked.state.tick));
    assert.equal(frame(direct),frame(chunked));
    assert.equal(frame(direct),frame(GameSession.restore(direct.serialize())));
  }
  assert.equal(frame(new GameSession(setup)),initial);
});
test('motion polish: reduced motion preserves feedback without moving silhouettes or crowns', () => {
  const style=getMatchFeedbackStyleText();
  assert.match(style,/prefers-reduced-motion:reduce/);
  assert.match(style,/\.match-feedback__crown-flight\{transform:none;opacity:1\}/);
  assert.match(style,/data-arrival-slot/);
  assert.doesNotMatch(style,/@keyframes|animation:/);
});

test('motion polish: accepted local card visibly arrives in its vacated slot and settles after 18 ticks', () => {
  const session=new GameSession(createShippedGameSessionSetup('hud-feedback'));
  const cardId=session.state.decks.south.hand[0];
  session.submitPlayerCommand(JSON.stringify({cardId,commandId:0,point:{x:3500,y:14500},slot:0,tick:0,type:'deploy'}));
  session.step();
  const receipt=session.projectionSnapshot().hudFeedback.lastCardPlay.south;
  assert.ok(receipt);
  const before=frame(session);
  assert.match(before,/arrivalSlot.*0/);
  assert.match(before,/--arrival-offset/);
  assert.equal(before,frame(GameSession.restore(session.serialize())));
  session.stepMany(18);
  assert.match(frame(session),/--arrival-offset.*0px/);
});
