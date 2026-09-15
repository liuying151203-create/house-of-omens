import { runTriggers } from './engine/triggers.mjs';
import { contentTriggers } from './content/triggers.mjs';

function matches(trigger, game, event) {
  return (
    trigger.when === event.when &&
    (!trigger.condition?.phase || trigger.condition.phase === game.phase) &&
    (!trigger.condition?.scenario ||
      trigger.condition.scenario === game.scenario) &&
    (trigger.condition?.heroId === undefined ||
      trigger.condition.heroId === event.heroId) &&
    (trigger.condition?.enemyId === undefined ||
      trigger.condition.enemyId === event.enemyId)
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
