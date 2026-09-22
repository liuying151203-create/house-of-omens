// 独立资源池：定义可供规则和素材室查询，但不进入既有剧本的随机牌堆。
export const BLOODMOON_ITEMS = [
  ...[
    ['might-potion', '力量药剂', 'might', '力量'],
    ['speed-potion', '速度药剂', 'speed', '速度'],
    ['sanity-potion', '神智药剂', 'sanity', '理智'],
  ].map(([id, title, useTrait, traitLabel]) => ({
    id,
    title,
    story: '实验室制备的药剂，标签上注明了它的用途。',
    effect: `自己的回合自由使用：获得持续1回合的${traitLabel}药剂增益，${traitLabel}立即向右移动2格，最多到轨道最右格。使用者下次回合开始时增益到期，对应属性回退1格，最低保留在骷髅前一格，不致死。使用后销毁，不消耗攻击、互动或休整机会。`,
    use: 'boostTrait',
    useTrait,
    useAmount: 2,
    consumable: true,
    supply: 'bloodmoon',
  })),
  {
    id: 'antidote',
    title: '解药',
    story: '密封的小瓶中装着澄清的药液。',
    effect:
      '一次性：对自己或同室探险者使用，选择清除最多2个可清除负面状态。清除感染不撤销已经发生的属性变化，也不能逆转狼人化。确认前可以取消。',
    use: 'cleanse',
    consumable: true,
    supply: 'bloodmoon',
  },
];
