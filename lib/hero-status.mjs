import { statusOf } from './werewolf.mjs';
import { isAlpha } from './content/bloodmoon-actors.mjs';
import {
  isWounded,
  isIsolated,
  pursuitAvailable,
} from './content/bloodmoon-pursuit.mjs';

export function heroStatuses(game, hero) {
  if (hero.dead || hero.traitor) return [];
  const result = [],
    infection = statusOf(hero, 'infection'),
    immunity = statusOf(hero, 'immunity');
  const attackBlocked = hero.attackBlockedRound === game.round && !hero.ended;
  if (isAlpha(game, hero) && (hero.skipNextAttack || attackBlocked))
    result.push({
      id: 'bloodmoon-knockdown',
      label: '虚弱',
      tone: 'negative',
      description:
        '普通肉体伤害须先扣减仍可下降的身体轨道；力量和速度都到第1格后，多余伤害才因不死失效。' +
        (attackBlocked
          ? '本回合不能主动攻击，行动结束后此限制解除。'
          : '下次自己的回合不能主动攻击，该回合行动结束后解除。') +
        (attackBlocked && hero.skipNextAttack
          ? '本回合再次陷入虚弱，下次自己的回合也不能主动攻击。'
          : '') +
        '虚弱本身不限制移动、使用物品、防御和反击；解药不能清除此限制。',
    });
  if (isWounded(game, hero))
    result.push({
      id: 'bloodmoon-wounded',
      label: '残血',
      description:
        '当前力量或速度数值低于作祟开始时的对应数值。恢复到基准或以上后不再残血；狼人靠近时可使用追猎移动。',
    });
  if (game.phase === 'haunt' && isIsolated(game, hero))
    result.push({
      id: 'bloodmoon-isolated',
      label: '落单',
      description:
        '同室及通过双向门直接连通的邻房均无其他存活英雄。初始狼人主动撕咬时最终攻击点数加1，不增加攻击骰数量；次级狼人不享受此加值。',
    });
  if (pursuitAvailable(game, hero))
    result.push({
      id: 'bloodmoon-pursuit',
      label: '追猎',
      description:
        '本回合还有1点额外移动，仅在该步缩短到存活残血英雄的连通路径时使用。速度移动值加1，不右移速度标记、不增加速度检定骰数。普通移动点优先消耗，不可用于探索、电梯或传送。',
    });
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
  for (const status of hero.statuses || []) {
    if (['infection', 'immunity'].includes(status.id) || !status.label)
      continue;
    result.push({
      id: status.instanceId || status.id,
      label: status.label,
      description:
        (status.level ? `当前等级 ${status.level}。` : '') +
        (status.description ||
          (status.id === 'bloodmoon-infection'
            ? game.scenario === 'bloodmoon'
              ? `${status.level === 2 ? '每次自己回合行动结束后进行理智3+检定，失败转化为次级狼人，无法用解药逆转。每次进入感染Ⅱ使力量、速度右移2格，理智左移1格。' : '暂时不改变属性；再次被初始狼人主动撕咬实际造成至少3点身体伤害，升级为感染Ⅱ。'}可用解药清除，或在消毒杀菌室结束回合时先降低1级。清除或降级不会撤销已经发生的属性移动。`
              : '可通过解药清除，或在消毒杀菌室结束回合时降低1级；清除不会撤销已经发生的属性轨道移动。当前是机关测试状态，不会自动升级或转化。'
            : status.removable
              ? '可以通过解药清除。'
              : '持续状态。')),
    });
  }
  return result;
}
