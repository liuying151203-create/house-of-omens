import { resolveCard } from '../card-rules.mjs';
import {
  itemInstances,
  itemInstanceCharges,
  itemInstanceUsed,
} from '../item-instances.mjs';
import { traitRuleView } from '../rule-views.mjs';

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
    available: ({ traitView }) =>
      traitView.changeable && traitView.current < traitView.start,
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
    available: ({ traitView }) =>
      traitView.changeable && traitView.current < traitView.start,
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
    return definition
      .targets({ game, hero, card, instance })
      .map((trait) => {
        const traitView = trait ? traitRuleView(game, hero, trait) : null;
        return { trait, traitView };
      })
      .filter(({ traitView }) => !traitView || traitView.exists)
      .map(({ trait, traitView }) => {
        const context = {
            game,
            hero,
            card,
            instance,
            trait,
            traitView,
            traitLabel: traitView?.label || traitLabels[trait] || trait,
          },
          used = itemInstanceUsed(hero, instance),
          charges = itemInstanceCharges(instance, card),
          available = !used && charges !== 0 && definition.available(context);
        return {
          id: `useItem:${instance.instanceId}:${trait || 'self'}`,
          command: {
            type: 'useItem',
            actionId: `useItem:${instance.instanceId}:${trait || 'self'}`,
            id: card.id,
            instanceId: instance.instanceId,
            ...(trait ? { trait } : {}),
          },
          commandAliases: [
            {
              type: 'useItem',
              instanceId: instance.instanceId,
              ...(trait ? { trait } : {}),
            },
            {
              type: 'useItem',
              id: card.id,
              ...(trait ? { trait } : {}),
            },
          ],
          commandType: 'useItem',
          handler: 'item.use',
          surface: 'inventory',
          instanceId: instance.instanceId,
          cardId: card.id,
          trait,
          label: definition.label(context),
          detail: card.effect,
          available,
          unavailableReason: used
            ? '本轮已经使用'
            : charges === 0
              ? '次数已经耗尽'
              : definition.unavailableReason,
          charges,
          maxCharges: Number.isInteger(card.charges) ? card.charges : null,
          consume: !!card.consumable,
          effects: definition.effects(context),
          resultText: definition.result(context),
        };
      });
  });
}

export function itemManagementActionViews(game, hero) {
  if (!hero || hero.dead || hero.traitor) return [];
  return itemInstances(hero).flatMap((instance) => {
    const card = resolveCard(game, 'item', instance.definitionId, hero.id),
      actions = [
        {
          id: `dropItem:${instance.instanceId}`,
          command: { type: 'dropItem', instanceId: instance.instanceId },
          commandType: 'dropItem',
          handler: 'item.drop',
          surface: 'inventory',
          instanceId: instance.instanceId,
          cardId: card.id,
          label: '放在当前房间',
          detail: '其他人物之后可以拾取',
          available: true,
        },
      ];
    for (const target of game.heroes.filter(
      (candidate) =>
        candidate.id !== hero.id &&
        !candidate.dead &&
        !candidate.traitor &&
        candidate.pos === hero.pos,
    ))
      actions.push({
        id: `transferItem:${instance.instanceId}:${target.id}`,
        command: {
          type: 'transferItem',
          instanceId: instance.instanceId,
          targetHeroId: target.id,
        },
        commandType: 'transferItem',
        handler: 'item.transfer',
        surface: 'inventory',
        instanceId: instance.instanceId,
        cardId: card.id,
        targetHeroId: target.id,
        label: '交给' + target.name,
        detail: '仅能交给同室的存活队友',
        available: true,
      });
    return actions;
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
