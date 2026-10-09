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
      <p>初醒：第1～2轮；满月：第3～4轮；血月：第5轮起。感染与嗜血尚未接入。</p>
    </section>
  );
}
