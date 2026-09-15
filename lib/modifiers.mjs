import { resolveModifier } from './engine/modifiers.mjs';
import { contentModifierContributions } from './content/modifiers.mjs';

function matches(entry, game, context) {
  return (
    (!entry.when?.phase || entry.when.phase === game.phase) &&
    (!entry.when?.scenario || entry.when.scenario === game.scenario) &&
    (entry.heroId === undefined || entry.heroId === context.heroId) &&
    (entry.enemyId === undefined || entry.enemyId === context.enemyId) &&
    (entry.roomId === undefined || entry.roomId === context.roomId)
  );
}

export function modifierResult(game, query, context = {}, base = 0) {
  const runtime = (game.ruleModifiers || [])
    .filter((entry) => entry.query === query && matches(entry, game, context))
    .map((entry) => ({ ...entry, sourceId: entry.sourceId || entry.id }));
  return resolveModifier(base, [
    ...contentModifierContributions(game, query, context),
    ...runtime,
  ]);
}

export const modifierValue = (game, query, context = {}, base = 0) =>
  modifierResult(game, query, context, base).value;

export const cureBonus = (game, healer, target) =>
  modifierValue(game, 'healing.cure.bonus', {
    healerId: healer.id,
    targetId: target.id,
  });
