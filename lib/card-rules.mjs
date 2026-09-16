import { EVENTS, ITEMS, OMENS, TRAIT_KEYS, SCENARIOS } from './game-data.mjs';
import { itemInstances } from './item-instances.mjs';

const decks = { event: EVENTS, item: ITEMS, omen: OMENS };
const editable = new Set([
  'title',
  'story',
  'effect',
  'trait',
  'delta',
  'threshold',
  'success',
  'failure',
  'bonus',
  'use',
  'useAmount',
  'consumable',
  'charges',
  'cureBonus',
  'hauntText',
  'hauntRoll',
  'stopsMovement',
]);
const matches = (rule, game, heroId) =>
  (rule.heroId === undefined || rule.heroId === heroId) &&
  (!rule.when?.phase || rule.when.phase === game?.phase) &&
  (!rule.when?.scenario || rule.when.scenario === game?.scenario);

// A single context-dependent definition feeds both the UI and game engine.
// Rules are JSON data, so checkpoints and network snapshots retain overrides.
export function resolveCard(game, type, id, heroId) {
  const base = decks[type]?.find((c) => c.id === id);
  if (!base) return null;
  const card = {
    stopsMovement: true,
    useAmount: 2,
    hauntRoll: type === 'omen' && game?.phase === 'explore',
    cureBonus: 0,
    ...structuredClone(base),
  };
  if (game && game.phase !== 'explore')
    card.hauntText = base.hauntEffects?.[game.scenario] || null;
  for (const rule of [
    ...(base.rules || []),
    ...(game?.cardRules || []).filter(
      (r) => r.cardType === type && r.cardId === id,
    ),
  ]) {
    if (matches(rule, game, heroId))
      Object.assign(card, structuredClone(rule.patch));
  }
  // Haunt rolls belong exclusively to exploration, even with a runtime override.
  card.hauntRoll = !!card.hauntRoll && game?.phase === 'explore';
  card.explorationText = card.hauntRoll ? '获得后进行作祟检定。' : null;
  return card;
}

export function updateCardRule(game, rule) {
  if (game.queue?.[0]?.kind === 'diceRequest')
    throw new Error('请等当前检定结算后再修改卡牌规则。');
  if (
    !rule?.id ||
    typeof rule.id !== 'string' ||
    !decks[rule.cardType]?.some((c) => c.id === rule.cardId) ||
    !rule.patch ||
    typeof rule.patch !== 'object' ||
    Array.isArray(rule.patch) ||
    Object.keys(rule.patch).some((key) => !editable.has(key)) ||
    (rule.heroId !== undefined &&
      !game.heroes.some((h) => h.id === rule.heroId)) ||
    (rule.when?.phase &&
      !['explore', 'haunt', 'over'].includes(rule.when.phase)) ||
    (rule.when?.scenario &&
      !SCENARIOS.some((s) => s.id === rule.when.scenario)) ||
    !validPatch(rule.patch) ||
    (rule.patch.effect !== undefined &&
      (rule.cardType === 'event'
        ? typeof rule.patch.effect === 'string'
        : typeof rule.patch.effect !== 'string'))
  )
    throw new Error('无效的卡牌规则。');
  const next = structuredClone(game);
  next.cardRules = [
    ...(next.cardRules || []).filter((r) => r.id !== rule.id),
    structuredClone(rule),
  ];
  return next;
}

function validPatch(patch) {
  const integer = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  const effect = (value) =>
    value &&
    typeof value === 'object' &&
    typeof value.text === 'string' &&
    (!value.trait ||
      (TRAIT_KEYS.includes(value.trait) && integer(value.delta, -16, 16))) &&
    (!value.damage ||
      (['physical', 'mental'].includes(value.damage) &&
        integer(value.amount, 0, 16)));
  return Object.entries(patch).every(([key, value]) => {
    if (['title', 'story'].includes(key)) return typeof value === 'string';
    if (key === 'hauntText') return value === null || typeof value === 'string';
    if (['consumable', 'hauntRoll', 'stopsMovement'].includes(key))
      return typeof value === 'boolean';
    if (
      ['cureBonus', 'threshold', 'useAmount', 'charges', 'delta'].includes(key)
    )
      return integer(value, key === 'delta' ? -16 : 0, 32);
    if (key === 'trait') return value === null || TRAIT_KEYS.includes(value);
    if (key === 'bonus')
      return (
        value === null ||
        ['all', 'attack', 'event', 'ritual', 'movement', 'mentalWard'].includes(
          value,
        )
      );
    if (key === 'use')
      return (
        value === null ||
        ['movement', 'healPhysical', 'healMental'].includes(value)
      );
    if (key === 'effect') return typeof value === 'string' || effect(value);
    return effect(value);
  });
}

export function removeCardRule(game, id) {
  if (game.queue?.[0]?.kind === 'diceRequest')
    throw new Error('请等当前检定结算后再修改卡牌规则。');
  const next = structuredClone(game);
  next.cardRules = (next.cardRules || []).filter((r) => r.id !== id);
  return next;
}

export function cardCureBonus(game, healer, target) {
  // Same category does not stack across cards or either participant.
  return Math.max(
    0,
    ...[healer, target].flatMap((h) =>
      ['item', 'omen'].flatMap((type) =>
        h[type === 'item' ? 'items' : 'omens'].map(
          (id) => resolveCard(game, type, id, h.id)?.cureBonus || 0,
        ),
      ),
    ),
  );
}

function heldCards(game, hero) {
  return [
    ...itemInstances(hero).map((instance, index) => ({
      type: 'item',
      id: instance.definitionId,
      index,
      instanceId: instance.instanceId,
      card: resolveCard(game, 'item', instance.definitionId, hero.id),
    })),
    ...hero.omens.map((id, index) => ({
      type: 'omen',
      id,
      index,
      card: resolveCard(game, 'omen', id, hero.id),
    })),
  ];
}

export function cardModifierContributions(game, query, context = {}) {
  const hero = game.heroes.find((entry) => entry.id === context.heroId);
  if (query === 'healing.cure.bonus') {
    return [context.healerId, context.targetId]
      .filter((id, index, ids) => id !== undefined && ids.indexOf(id) === index)
      .flatMap((id) => {
        const owner = game.heroes.find((entry) => entry.id === id);
        return owner
          ? heldCards(game, owner)
              .filter(({ card }) => card?.cureBonus)
              .map(({ type, id: cardId, index, instanceId, card }) => ({
                id: `card:${type}:${cardId}:cure`,
                sourceId:
                  type === 'item'
                    ? `item:${instanceId}`
                    : `hero:${owner.id}:${type}:${index}:${cardId}`,
                sourceLabel: card.title,
                stackGroup: 'card.cureBonus',
                strategy: 'max',
                value: card.cureBonus,
              }))
          : [];
      });
  }
  if (!hero) return [];
  return heldCards(game, hero).flatMap(
    ({ type, id, index, instanceId, card }) => {
      let applies = false;
      const group = card?.bonus;
      if (query === 'movement.initial') applies = card?.bonus === 'movement';
      else if (query === 'damage.mental.prevent')
        applies = card?.bonus === 'mentalWard';
      else if (query === 'check.dice')
        applies =
          (card?.bonus === 'all' && context.includeAll !== false) ||
          (['attack', 'ritual'].includes(card?.bonus) &&
            card.bonus === context.checkKind) ||
          (card?.bonus === 'event' &&
            context.checkKind === 'event' &&
            ['sanity', 'knowledge'].includes(context.trait));
      if (!applies) return [];
      return [
        {
          id: `card:${type}:${id}:${query}`,
          sourceId:
            type === 'item'
              ? `item:${instanceId}`
              : `hero:${hero.id}:${type}:${index}:${id}`,
          sourceLabel: card.title,
          stackGroup: `card.${group}`,
          strategy: 'unique',
          value: 1,
        },
      ];
    },
  );
}
