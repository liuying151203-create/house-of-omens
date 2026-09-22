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

// 展示和运行时规则校验共用同一份能力定义，避免新增能力时漏改白名单。
export function itemUseDefinition(id) {
  return Object.hasOwn(ITEM_USE_DEFINITIONS, id)
    ? ITEM_USE_DEFINITIONS[id]
    : undefined;
}
