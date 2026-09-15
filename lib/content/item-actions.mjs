import { resolveCard } from '../card-rules.mjs';
import { itemInstances, itemInstanceUsed } from '../item-instances.mjs';

const ITEM_USE_DEFINITIONS = {
  movement: {
    targets: () => [null],
    available: ({ hero }) => !hero.stopped,
    unavailableReason: '本回合已停止移动',
    label: ({ card }) => `饮用 · 移动 +${card.useAmount}`,
    effects: ({ card, hero }) => [
      {
        op: 'hero.changeMoves',
        params: { heroId: hero.id, delta: card.useAmount },
      },
    ],
    result: ({ card }) => `本回合移动力 +${card.useAmount}。`,
  },
  healPhysical: {
    targets: () => ['might', 'speed'],
    available: ({ hero, trait }) => hero.stats[trait] < hero.start[trait],
    unavailableReason: '该属性已经达到起始位置',
    label: ({ traitLabel }) => `恢复${traitLabel}`,
    effects: ({ card, hero, trait }) => [
      {
        op: 'hero.restoreTrait',
        params: { heroId: hero.id, trait, amount: card.useAmount },
      },
    ],
    result: ({ traitLabel }) => `恢复${traitLabel}。`,
  },
  healMental: {
    targets: () => ['sanity', 'knowledge'],
    available: ({ hero, trait }) => hero.stats[trait] < hero.start[trait],
    unavailableReason: '该属性已经达到起始位置',
    label: ({ traitLabel }) => `恢复${traitLabel}`,
    effects: ({ card, hero, trait }) => [
      {
        op: 'hero.restoreTrait',
        params: { heroId: hero.id, trait, amount: card.useAmount },
      },
    ],
    result: ({ traitLabel }) => `恢复${traitLabel}。`,
  },
};

export function itemActionViews(game, hero, traitLabels = {}) {
  if (!hero || hero.dead || hero.traitor) return [];
  return itemInstances(hero).flatMap((instance) => {
    const card = resolveCard(game, 'item', instance.definitionId, hero.id),
      definition = ITEM_USE_DEFINITIONS[card?.use];
    if (!definition) return [];
    return definition.targets({ game, hero, card, instance }).map((trait) => {
      const context = {
          game,
          hero,
          card,
          instance,
          trait,
          traitLabel: traitLabels[trait] || trait,
        },
        used = itemInstanceUsed(hero, instance),
        available = !used && definition.available(context);
      return {
        id: `useItem:${instance.instanceId}:${trait || 'self'}`,
        commandType: 'useItem',
        handler: 'item.use',
        surface: 'inventory',
        instanceId: instance.instanceId,
        cardId: card.id,
        trait,
        label: definition.label(context),
        detail: card.effect,
        available,
        unavailableReason: used ? '本轮已经使用' : definition.unavailableReason,
        consume: !!card.consumable,
        effects: definition.effects(context),
        resultText: definition.result(context),
      };
    });
  });
}

export function selectItemAction(game, hero, command, traitLabels = {}) {
  return itemActionViews(game, hero, traitLabels).find(
    (action) =>
      action.available &&
      (command.actionId
        ? action.id === command.actionId
        : command.instanceId
          ? action.instanceId === command.instanceId &&
            action.trait === (command.trait ?? null)
          : action.cardId === command.id &&
            action.trait === (command.trait ?? null)),
  );
}
