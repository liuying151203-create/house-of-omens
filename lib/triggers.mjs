import { runTriggers } from './engine/triggers.mjs';
import { contentTriggers } from './content/triggers.mjs';
import { bloodmoonTriggers } from './content/bloodmoon-mechanics.mjs';

function matches(trigger, game, event) {
  const condition = trigger.condition || {};
  return (
    trigger.when === event.when &&
    (!condition.phase || condition.phase === game.phase) &&
    (!condition.scenario || condition.scenario === game.scenario) &&
    (condition.heroId === undefined || condition.heroId === event.heroId) &&
    (condition.enemyId === undefined || condition.enemyId === event.enemyId) &&
    (!condition.cardType || condition.cardType === event.cardType) &&
    (!condition.cardId || condition.cardId === event.cardId) &&
    (!condition.roomId || condition.roomId === event.roomId) &&
    (!condition.fromRoomId || condition.fromRoomId === event.fromRoomId) &&
    (!condition.enterKind || condition.enterKind === event.enterKind) &&
    (!condition.trait || condition.trait === event.trait) &&
    (condition.discovered === undefined ||
      condition.discovered === event.discovered) &&
    (condition.sourceEnemyId === undefined ||
      condition.sourceEnemyId === event.sourceEnemyId) &&
    (!condition.damageType || condition.damageType === event.damageType) &&
    (!condition.checkKind || condition.checkKind === event.checkKind) &&
    (condition.rollKey === undefined || condition.rollKey === event.rollKey) &&
    (condition.success === undefined || condition.success === event.success) &&
    (condition.totalAtLeast === undefined ||
      event.total >= condition.totalAtLeast) &&
    (!condition.causeTag || condition.causeTag === event.causeTag) &&
    (condition.actualDamageAtLeast === undefined ||
      event.actualAmount >= condition.actualDamageAtLeast) &&
    (condition.targetAlive === undefined ||
      condition.targetAlive === !game.heroes[event.heroId]?.dead)
  );
}

export function fireTiming(game, event, handlers, context = {}) {
  const runtime = (game.ruleTriggers || []).filter((trigger) =>
    matches(trigger, game, event),
  );
  return runTriggers(
    game,
    event,
    [
      ...contentTriggers(game, event),
      ...bloodmoonTriggers(game, event),
      ...runtime,
    ],
    handlers,
    context,
  );
}

export function resumeTiming(game, event, triggers, handlers, context = {}) {
  return runTriggers(game, event, triggers || [], handlers, context);
}
