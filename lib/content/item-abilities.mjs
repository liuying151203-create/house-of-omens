import { cleanseableStatuses } from '../status-rules.mjs';

const ITEM_USE_DEFINITIONS = {
  placeTrap: {
    handler: 'item.placeTrap',
    targets: () => [null],
    available: ({ game, hero }) => hero.bloodmoonActions?.trap !== game.round,
    unavailableReason: '本回合已经布置过捕兽夹',
    label: () => '布置捕兽夹',
    effects: () => [],
    result: () => '在当前房间布置捕兽夹。',
  },
  boostTrait: {
    targets: ({ card }) => [card.useTrait],
    available: ({ traitView }) => !!traitView?.changeable,
    unavailableReason: '当前属性不可改变',
    label: ({ traitLabel, card }) =>
      `饮用 · ${traitLabel} +${card.useAmount}格`,
    effects: ({ game, card, hero, trait, traitLabel, instance }) => [
      {
        op: 'hero.changeTrait',
        params: { heroId: hero.id, trait, delta: card.useAmount },
      },
      {
        op: 'status.add',
        params: {
          heroId: hero.id,
          status: {
            id: 'trait-boost',
            label: `${card.title}增益`,
            description: `持续1回合，使用者下次回合开始时到期，${traitLabel}回退1格，最低保留在骷髅前一格，不致死。`,
            negative: false,
            removable: false,
            trait,
            expiresRound: game.round + 1,
            sourceCardId: card.id,
            sourceInstanceId: instance.instanceId,
          },
        },
      },
    ],
    result: ({ traitLabel }) =>
      `${traitLabel}上升，最多到轨道最右格；药剂增益持续到自己下次回合开始，届时回退1格且不致死。`,
  },
  cleanse: {
    handler: 'item.cleanse',
    targets: ({ game, hero }) =>
      game.heroes
        .filter(
          (target) =>
            !target.dead && !target.traitor && target.pos === hero.pos,
        )
        .map((target) => ({ targetHeroId: target.id })),
    available: ({ targetHero }) => cleanseableStatuses(targetHero).length > 0,
    unavailableReason: '目标没有可清除的负面状态',
    label: ({ targetHero }) => `解药 · ${targetHero.name}`,
    effects: () => [],
    result: () => '清除所选负面状态。',
  },
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

// 展示和运行时规则校验共用同一份能力定义，避免新增能力时漏改白名单。
export function itemUseDefinition(id) {
  return Object.hasOwn(ITEM_USE_DEFINITIONS, id)
    ? ITEM_USE_DEFINITIONS[id]
    : undefined;
}
