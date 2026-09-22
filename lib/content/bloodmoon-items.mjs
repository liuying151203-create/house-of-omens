// 独立资源池：定义可供规则和素材室查询，但不进入既有剧本的随机牌堆。
export const BLOODMOON_ITEMS = [
  {
    id: 'family-ring',
    title: '家族戒指',
    supply: 'bloodmoon',
    story: '旧戒环里刻着家族的誓言。',
    effect:
      '命运回环：每轮一次，完成自己的骰子检定后，可选择一枚结果为0或2的骰子重掷，必须接受新结果。交付不会刷新次数。可在实验室或锅炉房尝试熔铸为银弹。',
  },
  {
    id: 'saint-badge',
    title: '圣者徽章',
    supply: 'bloodmoon',
    story: '磨损的圣像仍散发着微弱的光。',
    effect:
      '庇护：每轮一次，自己或同室友方即将获得可清除负面状态（包括升级）时，可进行理智4+检定。成功阻止本次状态，失败正常获得；放弃不扣次数。可在实验室或锅炉房熔铸为银弹。',
  },
  {
    id: 'bear-trap',
    title: '捕兽夹',
    supply: 'bloodmoon',
    use: 'placeTrap',
    consumable: true,
    story: '生锈的钢齿在黑暗里合拢。',
    effect:
      '每回合可布置一次，与其他行动独立计次，在当前房间布置。友方可见且免触发；敌方不可见。首名移动进入的敌人承受2点身体伤害并停止本回合移动，随后陷阱销毁。',
  },
  {
    id: 'silver-bullet',
    title: '银色子弹',
    supply: 'bloodmoon',
    deckEligible: false,
    story: '用家族信物熔铸的银弹。',
    effect:
      '由家族戒指或圣者徽章各熔铸一发，整局最多两发。手枪装填与射击将在枪械机制中接入。',
  },
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
