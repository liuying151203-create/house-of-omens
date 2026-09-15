import { runTriggers } from './engine/triggers.mjs';
import { contentTriggers } from './content/triggers.mjs';

function matches(trigger, game, event) {
  const condition = trigger.condition || {};
  return (
    trigger.when === event.when &&
    (!condition.phase || condition.phase === game.phase) &&
    (!condition.scenario || condition.scenario === game.scenario) &&
    (condition.heroId === undefined || condition.heroId === event.heroId) &&
    (condition.enemyId === undefined || condition.enemyId === event.enemyId) &&
    (condition.sourceEnemyId === undefined ||
      condition.sourceEnemyId === event.sourceEnemyId) &&
    (!condition.damageType || condition.damageType === event.damageType) &&
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
    [...contentTriggers(game, event), ...runtime],
    handlers,
    context,
  );
}
