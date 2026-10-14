import assert from 'node:assert/strict';
import { DeckCycle } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/sim/deck.js';
import { GameSession } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/sim/game-session.js';
import { createEditableGameSessionSetup } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/content/editable-deck.js';
import { PLAYABLE_CARD_IDS } from '../cards019k-critic-6cc8656e4f6c967868edac4bd71c87c57c6e7009/src/content/playable-roster.js';
const canonical = (v) => Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v && typeof v === 'object' ? `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v);
const deck = ['kilnkeeper','cinder-host',...PLAYABLE_CARD_IDS.filter(id => id !== 'kilnkeeper' && id !== 'cinder-host').slice(0,6)];
let seed = -1;
for (let candidate = 0; candidate < 10000; candidate++) {
  if (new DeckCycle({deck,seed:`${candidate}:north`}).state.hand.includes('kilnkeeper')) { seed=candidate; break; }
}
assert.ok(seed >= 0, 'north opening hand contains Kilnkeeper');
const setup = JSON.parse(createEditableGameSessionSetup(deck,seed));
setup.legalNorthDeployments = [{cardId:'kilnkeeper',point:{x:3500,y:17500}}];
setup.startingElixir = {north:10,south:10};
setup.thinkIntervalTicks=1;
setup.thinkOffsetTicks=0;
const session = new GameSession(canonical(setup));
const initialHand = session.state.decks.north.hand;
const initialCycle = session.state.decks.north.sequence;
assert.ok(initialHand.includes('kilnkeeper'));
assert.equal(session.state.elixir.sides.north.amount,10);
const events = session.stepMany(1);
const commits = session.replay.filter(({type,side,deployment}) => type === 'session-deployed' && side === 'north' && deployment?.cardId === 'kilnkeeper');
assert.equal(commits.length,1,'one actual AI deployment of Kilnkeeper');
assert.equal(commits[0].spend.cost,5);
assert.equal(commits[0].spend.accepted,true);
assert.equal(session.state.decks.north.sequence,initialCycle+1,'one north cycle advance');
assert.equal(session.state.elixir.sides.north.amount,5);
const result={seed,initialHand,initialCycle,tick:session.state.tick,events,commit:commits[0],northSequence:session.state.decks.north.sequence,northElixir:session.state.elixir.sides.north.amount,northKilnkeeperUnits:session.state.battle.units.filter(({cardId,side})=>cardId==='kilnkeeper'&&side==='north').length};
console.log(JSON.stringify(result,null,2));
