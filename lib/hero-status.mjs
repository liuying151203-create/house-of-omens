import { statusOf } from './werewolf.mjs';

export function heroStatuses(game, hero) {
  if (hero.dead || hero.traitor) return [];
  const result = [],
    infection = statusOf(hero, 'infection'),
    immunity = statusOf(hero, 'immunity');
  if (infection)
    result.push({
      id: 'infection',
      label: '狼毒',
      count: infection.turns,
      description: `剩余 ${infection.turns} 轮后转化为狼人。自己或同室队友可花一次互动进行知识 3+ 治疗；失败后累积 +1 治疗加值。重复感染不会重置倒计时。${infection.attempts ? '已累积治疗加值 +' + infection.attempts + '。' : ''}`,
    });
  if (immunity?.until > game.elapsed)
    result.push({
      id: 'immunity',
      label: '净血保护',
      description: `暂时免疫狼毒感染，但仍会受到攻击伤害。还可保护 ${Math.max(0, immunity.until - game.elapsed - 1)} 次接下来的敌人阶段，在到期敌人阶段开始时失效。`,
    });
  return result;
}
