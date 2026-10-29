import { itemUseDefinition } from './item-abilities.mjs';
import { resolveCard } from '../card-rules.mjs';
import {
  itemInstances,
  itemInstanceCharges,
  itemInstanceUsed,
} from '../item-instances.mjs';
import { traitRuleView } from '../rule-views.mjs';

export function itemActionViews(game, hero, traitLabels = {}) {
  if (!hero || hero.dead || hero.traitor) return [];
  return itemInstances(hero).flatMap((instance) => {
    const card = resolveCard(game, 'item', instance.definitionId, hero.id),
      definition = itemUseDefinition(card?.use);
    if (!definition) return [];
    return definition
      .targets({ game, hero, card, instance })
      .map((target) => {
        const trait = typeof target === 'string' ? target : null;
        const targetHeroId = target?.targetHeroId;
        const traitView = trait ? traitRuleView(game, hero, trait) : null;
        return {
          trait,
          traitView,
          targetHeroId,
          targetRoomId: target?.targetRoomId,
          allocation: target?.allocation,
        };
      })
      .filter(({ traitView }) => !traitView || traitView.exists)
      .map(({ trait, traitView, targetHeroId, targetRoomId, allocation }) => {
        const context = {
            game,
            hero,
            card,
            instance,
            trait,
            traitView,
            allocation,
            targetHero:
              targetHeroId === undefined ? hero : game.heroes[targetHeroId],
            targetRoom: game.rooms.find((room) => room.id === targetRoomId),
            traitLabel: traitView?.label || traitLabels[trait] || trait,
          },
          targetKey = allocation
            ? `allocation:${allocation.might}:${allocation.speed}`
            : targetRoomId !== undefined
              ? `room:${targetRoomId}`
              : targetHeroId === undefined
                ? trait || 'self'
                : `hero:${targetHeroId}`,
          targetCommand = allocation
            ? {
                allocationMight: allocation.might,
                allocationSpeed: allocation.speed,
              }
            : targetRoomId !== undefined
              ? { targetRoomId }
              : targetHeroId === undefined
                ? {}
                : { targetHeroId },
          used = itemInstanceUsed(hero, instance),
          charges = itemInstanceCharges(instance, card),
          available = !used && charges !== 0 && definition.available(context);
        return {
          id: `useItem:${instance.instanceId}:${targetKey}`,
          command: {
            type: 'useItem',
            actionId: `useItem:${instance.instanceId}:${targetKey}`,
            id: card.id,
            instanceId: instance.instanceId,
            ...(trait ? { trait } : {}),
            ...targetCommand,
          },
          commandAliases: [
            ...(allocation && (!allocation.might || !allocation.speed)
              ? [
                  {
                    type: 'useItem',
                    id: card.id,
                    trait: allocation.might ? 'might' : 'speed',
                  },
                  {
                    type: 'useItem',
                    instanceId: instance.instanceId,
                    trait: allocation.might ? 'might' : 'speed',
                  },
                ]
              : []),
            {
              type: 'useItem',
              instanceId: instance.instanceId,
              ...(trait ? { trait } : {}),
              ...targetCommand,
            },
            {
              type: 'useItem',
              id: card.id,
              ...(trait ? { trait } : {}),
              ...targetCommand,
            },
          ],
          commandType: 'useItem',
          handler: definition.handler || 'item.use',
          surface: 'inventory',
          instanceId: instance.instanceId,
          cardId: card.id,
          trait,
          ...targetCommand,
          label: definition.label(context),
          detail: definition.detail?.(context) || card.effect,
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
      (action.command.allocationMight === undefined ||
        command.actionId === action.id ||
        (command.allocationMight === action.command.allocationMight &&
          command.allocationSpeed === action.command.allocationSpeed) ||
        (command.trait === 'might' && action.command.allocationSpeed === 0) ||
        (command.trait === 'speed' && action.command.allocationMight === 0)) &&
      (action.targetHeroId === undefined ||
        action.targetHeroId === command.targetHeroId ||
        !!command.actionId) &&
      (action.targetRoomId === undefined ||
        action.targetRoomId === command.targetRoomId ||
        !!command.actionId) &&
      (command.actionId
        ? action.id === command.actionId
        : command.instanceId
          ? action.instanceId === command.instanceId &&
            (action.command.allocationMight !== undefined ||
              action.trait === (command.trait ?? null))
          : action.cardId === command.id &&
            (action.command.allocationMight !== undefined ||
              action.trait === (command.trait ?? null))),
  );
}
