import { MOON_LABELS, moonPhase } from '../lib/content/bloodmoon-actors.mjs';
export default function BloodmoonPanel({ game }) {
  if (game.scenario !== 'bloodmoon' || game.phase !== 'haunt') return null;
  const alpha = game.heroes[game.bloodmoonCombat.alphaId];
  return (
    <section className="wolf-panel">
      <strong>血月之夜 · 战斗模块试作</strong>
      <p>
        第{game.elapsed + 1}个完整轮次 · {MOON_LABELS[moonPhase(game.elapsed)]}{' '}
        · 无轮数上限
      </p>
      <p>
        {alpha.name} · 初始狼人，由玩家控制；月相改变数值，保持属性标记位置。
      </p>
      <p>初醒：第1～2轮；满月：第3～4轮；血月：第5轮起。</p>
      <p>
        初始狼人主动撕咬实际造成至少3点身体伤害时，感染升1级。感染Ⅱ在英雄回合结束时进行理智3+，失败转化为次级狼人；徽章可阻止感染和升级，解药与净化不撤销已经发生的属性移动。
      </p>
      <p>
        初始狼人普通伤害触及骷髅时保留第1格，下次自己的回合不能主动攻击。银弹绕过不死，7点伤害由狼人分配；存活后力量与速度最高位置永久降至第4格。
      </p>
      {alpha.silverWeakened && <p>银弹永久削弱已生效：力量、速度最高第4格。</p>}
      {alpha.skipNextAttack && <p>下次狼人回合不能主动攻击。</p>}
      {alpha.attackBlockedRound === game.round && (
        <p>本回合狼人不能主动攻击，仍可移动和使用物品。</p>
      )}
    </section>
  );
}
