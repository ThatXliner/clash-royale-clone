import { createEditableGameSessionSetup } from "../aether-well-core-builder-950/src/content/editable-deck.js";
import { GAME_SESSION_MAX_BATCH_TICKS, GameSession } from "../aether-well-core-builder-950/src/sim/game-session.js";
const deck = ["aether-well", "mossguard", "copperskiff", "skymaul", "brassbolt", "reedsting", "briar-band", "cinderlings"];
function canonical(value) { if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`; if (value !== null && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(",")}}`; return JSON.stringify(value); }
function stepWithPattern(session, total, pattern) { let remaining = total, i = 0; while (remaining > 0) { const n = Math.min(remaining, GAME_SESSION_MAX_BATCH_TICKS, pattern[i % pattern.length]); session.stepMany(n); remaining -= n; i++; } }
const session = new GameSession(createEditableGameSessionSetup(deck, 2));
const slot = session.state.decks.south.hand.indexOf("aether-well");
session.submitPlayerCommand(canonical({ cardId:"aether-well", commandId:0, point:{x:3500,y:14500}, slot, tick:0, type:"deploy" }));
session.stepMany(1);
stepWithPattern(session, 3897, [GAME_SESSION_MAX_BATCH_TICKS]);
const checkpoint=session.serialize();
const restored=GameSession.restore(checkpoint);
const continuation=restored.stepMany(3);
const directContinuation=session.stepMany(3);
const replay=session.replay;
const deployed=replay.filter(({materialization,type}) => type==="session-structure-deployed" && materialization?.cardId==="aether-well");
const structures=replay.filter(({cardId,type}) => type==="structure-materialized" && cardId==="aether-well");
const southId=structures.find(({side})=>side==="south")?.structureId;
const northId=structures.find(({side})=>side==="north")?.structureId;
const grants=replay.filter(({type})=>type==="building-resource-granted").map(({amountAfter,amountGranted,amountRequested,buildingId,side,tick})=>({amountAfter,amountGranted,amountRequested,buildingId,side,tick}));
const result={tick:session.state.tick,deployments:deployed.map(({side,spend})=>({side,cost:spend.cost,amountAfter:spend.amountAfter})),southDeath:replay.filter(({buildingId,cause,type})=>buildingId===southId&&cause==="combat-damage"&&type==="structure-destroyed").map(({tick,cause,reason})=>({tick,cause,reason})),northCadenceTicks:replay.filter(({buildingId,type})=>buildingId===northId&&type==="building-resource-cadence-triggered").map(({tick})=>tick),northExpiry:replay.filter(({buildingId,cause,type})=>buildingId===northId&&cause==="expiry"&&type==="structure-destroyed").map(({tick,cause,reason})=>({tick,cause,reason})),grants,maxAmountAfter:Math.max(...grants.map(({amountAfter})=>amountAfter)),restoreForkEqual:canonical(continuation)===canonical(directContinuation)&&restored.serialize()===session.serialize()};
console.log(JSON.stringify(result,null,2));
