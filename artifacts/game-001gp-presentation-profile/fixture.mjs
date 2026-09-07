import {createPlayableRoster,createPlayableRosterQuestionRecords} from '../../src/content/playable-roster.js';
import {GameSession} from '../../src/sim/game-session.js';
import {readFileSync,writeFileSync} from 'node:fs';
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const ROSTER = createPlayableRoster();
const DECK = ROSTER.map(({ id }) => id);
const COSTS = new Map(ROSTER.map(({ cost, id }) => [id, cost]));
const DEFENSIVE_PROFILE = new Map(ROSTER.map((card) => [card.id, {
  airPressure: card.entities.filter(({ targetMode }) => targetMode === "ground-and-air")
    .reduce((total, entity) => total + entity.count * entity.damage * 1_000 /
      entity.hitSpeedTicks, 0),
  durability: card.entities.reduce((total, entity) => total + entity.count * entity.hitpoints, 0),
  groundPressure: card.entities.reduce((total, entity) => total + entity.count * entity.damage * 1_000 /
    entity.hitSpeedTicks, 0),
  range: Math.max(...card.entities.map(({ rangeMillitiles }) => rangeMillitiles)),
  speed: card.entities.reduce((total, entity) =>
    total + entity.count * entity.movementMillitilesPerSecond, 0),
}]));

/** Exact GAME-001GH seed-zero setup; this is not the shipped short profile. */
function exactGhSetup() {
  const questions = createPlayableRosterQuestionRecords();
  const roster = createPlayableRoster();
  const battleSetup = canonical({ initialWindupTicks: { central: 0, lane: 0 },
    questions, roster });
  const legalNorthDeployments = DECK.flatMap((cardId) => [
    { cardId, point: { x: 3_500, y: 17_500 } },
    { cardId, point: { x: 14_500, y: 17_500 } },
  ]).sort((left, right) => left.cardId.localeCompare(right.cardId) ||
    left.point.x - right.point.x);
  return canonical({ battleSetup, deck: DECK, legalNorthDeployments,
    rosterWitness: canonical({ questions, roster }), seed: 0,
    startingElixir: { north: 10, south: 10 }, thinkIntervalTicks: 1,
    thinkOffsetTicks: 0 });
}

const telemetry=JSON.parse(readFileSync(new URL('../game-001gp-browser-endurance/continuation-9600-failure.json',import.meta.url)));
const session=new GameSession(exactGhSetup());
const commands=new Map(telemetry.transportIdNormalization.filter(x=>x.normalized).map(x=>[x.tick,x]));
for(let tick=0;tick<9600;tick+=300){ const x=commands.get(tick);if(x)session.submitPlayerCommand(canonical({...x.normalized,commandId:x.acceptedBrowserCommandId,type:'deploy'}));session.stepMany(300); }
writeFileSync(new URL('fixture.json',import.meta.url),session.serialize());console.log('saved',session.state.tick);
