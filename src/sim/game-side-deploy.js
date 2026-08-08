import { DeckCycle } from "./deck.js";
import { ElixirMatch } from "./elixir.js";
import { LiveBattle } from "./live-battle.js";
import { evaluateDeployment } from "./deployment.js";
import { SessionCardRuntime, isAuthenticSessionCardRuntime } from "./session-card-runtime.js";

/**
 * Shared staging boundary for either side of a unified match.
 *
 * The caller owns transactionality and advances elixir/battle exactly once
 * after all same-tick sides have staged. This helper owns no runtime state.
 */
export function stageSideDeployment({ battle, cardCosts, command, deck, elixir,
  deploymentSequence, sessionCards }) {
  const hasSessionCards = isAuthenticSessionCardRuntime(sessionCards) &&
    Object.getPrototypeOf(sessionCards) === SessionCardRuntime.prototype;
  if (Object.getPrototypeOf(battle) !== LiveBattle.prototype ||
      Object.getPrototypeOf(deck) !== DeckCycle.prototype ||
      Object.getPrototypeOf(elixir) !== ElixirMatch.prototype ||
      !(cardCosts instanceof Map) || (sessionCards !== undefined && !hasSessionCards)) {
    throw new TypeError("side deployment requires exact session systems");
  }
  const { cardId, commandId, point, side, slot, tick } = command;
  if (!Number.isSafeInteger(commandId) || commandId < 0 ||
      !Number.isSafeInteger(slot) || slot < 0 || slot > 3 ||
      !Number.isSafeInteger(tick) || tick !== battle.state.tick ||
      !["north", "south"].includes(side) ||
      typeof cardId !== "string" || point === null || typeof point !== "object" ||
      !Number.isSafeInteger(point.x) || !Number.isSafeInteger(point.y) ||
      !Number.isSafeInteger(deploymentSequence) || deploymentSequence < 0) {
    throw new TypeError("side deployment command is invalid or stale");
  }
  const cost = cardCosts.get(cardId);
  if (!Number.isSafeInteger(cost) || cost < 1 || cost > 10) {
    throw new TypeError("side deployment card is not in the admitted roster");
  }
  if (deck.state.hand[slot] !== cardId) {
    throw new RangeError("side deployment card does not match its hand slot");
  }
  const admittedCard = hasSessionCards ? sessionCards.card(cardId) :
    { kind: "unit", placementClass: "ground_entity" };
  const placement = evaluateDeployment({ destroyedOpposingLaneTowers: [],
    placementClass: admittedCard.placementClass, point, side });
  if (!placement.legal) throw new RangeError(`side deployment is illegal: ${placement.reason}`);
  const spendSequence = elixir.scheduleSpend(tick, side, cost);
  const cycle = deck.play(cardId);
  if (!cycle.accepted || cycle.slot !== slot) {
    throw new Error("prevalidated side deployment failed to cycle its deck");
  }
  const route = hasSessionCards ? sessionCards.route(JSON.stringify({ cardId, commandId, point,
    sequence: deploymentSequence, side, tick })) : null;
  if (admittedCard.kind === "unit") {
    battle.scheduleDeploy({ cardId, point, sequence: deploymentSequence, side, tick });
  }
  const legacy = { cardId, commandId, cost, cycle: Object.freeze(cycle),
    deploymentSequence, point: Object.freeze({ ...point }), side, spendSequence,
    tick, type: "side-deployment-staged" };
  if (!hasSessionCards) return Object.freeze(legacy);
  return Object.freeze({ cardId, commandId, cost, cycle: Object.freeze(cycle),
    deploymentSequence, kind: admittedCard.kind, point: Object.freeze({ ...point }), route,
    side, spendSequence, tick, type: "side-deployment-staged" });
}
