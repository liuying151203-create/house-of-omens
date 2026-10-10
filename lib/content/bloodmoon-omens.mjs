// 可由游戏集选入，但不混入经典或通用扩展牌池。
export const BLOODMOON_OMENS = [
  {
    id: 'bite-mark',
    title: '咬痕',
    supply: 'bloodmoon',
    scenarioOnly: 'bloodmoon',
    story: '袖口下的伤口仍在发烫，黑暗里传来一声低吼。',
    effect:
      '获得时遭到虚拟敌人的力量4攻击：攻击方投4枚骰，抽牌者按自己的力量值投防御骰。攻击方胜出时，差值为身体伤害，由抽牌者分配到力量与速度轨道；平局或防御方胜出均无伤，不产生反击。',
    gainAttack: {
      label: '暗处的袭击者',
      count: 4,
      defenseTrait: 'might',
      damageType: 'physical',
      description: '虚拟敌人以力量4攻击，抽牌者以自己的力量防御。',
      outcomes: [
        {
          range: '攻击总点数 > 防御总点数',
          effect: '差值为身体伤害，由抽牌者从力量、速度轨道自行分配。',
        },
        {
          range: '攻击总点数 ≤ 防御总点数',
          effect: '抽牌者未受伤，不产生反击伤害。',
        },
      ],
    },
  },
];
