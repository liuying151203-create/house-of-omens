import { isAlpha, isBloodmoon } from './bloodmoon-actors.mjs';

export const INFECTION_ID = 'bloodmoon-infection';
export const infectionOf = (hero) =>
  hero?.statuses?.find((status) => status.id === INFECTION_ID);

export function infectionStatus(level) {
  return {
    id: INFECTION_ID,
    label: level === 2 ? '感染Ⅱ' : '感染Ⅰ',
    level,
    negative: true,
    removable: true,
  };
}

export function infectionTriggers(game, event) {
  if (!isBloodmoon(game)) return [];
  const hero = game.heroes[event.heroId];
  if (!hero || hero.dead || hero.faction !== 'heroes') return [];
  if (
    event.when === 'AfterDamage' &&
    event.causeTag === 'actorAttack' &&
    event.damageType === 'physical' &&
    event.actualAmount >= 3 &&
    isAlpha(game, game.heroes[event.sourceHeroId]) &&
    (infectionOf(hero)?.level || 0) < 2
  )
    return [
      {
        id: 'bloodmoon.infection.gain',
        sourceId: `bloodmoon:infection:${hero.id}`,
        sourceLabel: '撕咬感染',
        when: event.when,
        oncePerRoot: true,
        priority: 20,
        effects: [
          {
            op: 'status.gain',
            params: {
              heroId: hero.id,
              status: infectionStatus((infectionOf(hero)?.level || 0) + 1),
            },
          },
        ],
      },
    ];
  if (event.when === 'TurnEnding' && infectionOf(hero)?.level === 2)
    return [
      {
        id: 'bloodmoon.infection.check',
        sourceId: `bloodmoon:infection-check:${hero.id}`,
        sourceLabel: '感染Ⅱ',
        when: event.when,
        oncePerRoot: true,
        // 净化优先；真正发起检定时再次检查状态，降级后无需投骰。
        priority: 0,
        effects: [
          {
            op: 'bloodmoon.flow',
            params: { kind: 'infectionCheck', heroId: hero.id },
          },
        ],
      },
    ];
  return [];
}

export function commitInfection(game, hero, status, context) {
  if (!isBloodmoon(game) || status.id !== INFECTION_ID) return;
  let text = `${hero.name}获得${status.label}。`;
  if (status.level === 2) {
    for (const [trait, delta] of [
      ['might', 2],
      ['speed', 2],
      ['sanity', -1],
    ])
      context.changeTrait(hero, trait, delta);
    text +=
      '进入感染Ⅱ：力量、速度右移2格，理智左移1格；清除感染不撤销这些移动。';
  }
  context.record('InfectionGained', {
    heroId: hero.id,
    level: status.level,
    text,
  });
  context.log(text);
}

export function infectionCheckRequest(game, hero, count) {
  if (hero.dead || hero.faction !== 'heroes' || infectionOf(hero)?.level !== 2)
    return null;
  return {
    kind: 'diceRequest',
    heroId: hero.id,
    title: '感染Ⅱ · 抵抗狼化',
    text: `${hero.name}已结束本回合行动，以当前理智值投${count}枚骰子进行理智3+检定。解药可清除感染，消毒杀菌室可降级；已经发生的属性移动不会撤销。`,
    threshold: 3,
    outcomes: [
      { range: '3+', effect: '维持感染Ⅱ，保留英雄阵营。' },
      {
        range: '低于3',
        effect:
          '转化为次级狼人，保留原角色轨道和座位；无法用解药恢复英雄身份。',
      },
    ],
    rolls: [{ heroId: hero.id, count, label: `${hero.name} · 理智抵抗狼化` }],
  };
}

export function resolveInfectionCheck(game, hero, total, context) {
  if (
    total >= 3 ||
    hero.dead ||
    hero.faction !== 'heroes' ||
    infectionOf(hero)?.level !== 2
  )
    return;
  hero.statuses = hero.statuses.filter((status) => status.id !== INFECTION_ID);
  hero.faction = 'wolves';
  hero.combatRole = 'wolf';
  hero.role = '次级狼人';
  const text = `${hero.name}抵抗狼化失败，已转化为次级狼人；保留原角色属性轨道，由原玩家继续控制，不具有不死、嗜血、月相强化或感染传播能力，解药不能逆转。`;
  context.record('HeroConverted', { heroId: hero.id, text });
  context.log(text);
}
