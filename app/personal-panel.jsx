import { Check, Footprints } from 'lucide-react';
import {
  personalHero,
  locationLabel,
  enemyHero,
  canInspectHero,
} from '../lib/game-view.mjs';
import { statusOf, wolfMight } from '../lib/werewolf.mjs';
import HeroInventory from './hero-inventory';

export default function PersonalPanel({
  game,
  net,
  send,
  waiting,
  moving,
  Traits,
  changes,
  onActions,
}) {
  const hero = personalHero(game, net.room);
  if (!hero)
    return (
      <aside className="personal-panel" aria-label="我的人物">
        <strong>当前以旁观者身份查看</strong>
        <p>可从全员栏查看公开状态。</p>
      </aside>
    );
  const active = hero.id === game.active;
  const disabled =
    !active ||
    waiting ||
    net.busy ||
    moving ||
    !!game.queue.length ||
    hero.ended ||
    hero.dead ||
    hero.traitor ||
    game.phase === 'over';
  const enemy = game.enemies.find((e) => enemyHero(game, e)?.id === hero.id);
  const infection = statusOf(hero, 'infection');
  return (
    <aside className="personal-panel" aria-label="当前控制人物的状态与物品">
      <div className="personal-heading">
        <span style={{ color: hero.color }}>{hero.mark}</span>
        <div>
          <small>
            {net.room ? '我的人物' : '当前人物'}
            {active ? ' · 当前行动' : ' · 等待行动'}
          </small>
          <strong>{hero.name}</strong>
        </div>
      </div>
      <div className="personal-condition">
        <span>
          {hero.dead
            ? '已死亡'
            : hero.traitor
              ? '已加入敌方阵营'
              : hero.stopped
                ? '本回合停止移动'
                : hero.moves + ' 点移动力'}
        </span>
        {infection && <b>狼毒 · {infection.turns} 轮后转化</b>}
        {statusOf(hero, 'immunity') && <b>净血保护中</b>}
      </div>
      <span className="personal-location">
        {locationLabel(game, enemy?.pos || hero.pos)}
      </span>
      {canInspectHero(game, hero, net.room) ? (
        <>
          <Traits
            hero={hero}
            compact={false}
            changes={changes.filter((c) => c.heroId === hero.id)}
          />
          <small className="track-legend">
            亮色格：当前数值 · 下划线：起始格 · ☠：死亡
          </small>
        </>
      ) : (
        enemy && (
          <div className="enemy-public-stats">
            <span>
              生命 {enemy.hp}/{enemy.maxHp}
            </span>
            <span>力量 {wolfMight(game, enemy)}</span>
            <span>移动 {enemy.speed}</span>
          </div>
        )
      )}
      <div className="personal-carry">
        <strong>随身物品与预兆</strong>
        <HeroInventory
          game={game}
          hero={hero}
          room={net.room}
          send={send}
          disabled={disabled}
        />
      </div>
      <div className="personal-actions">
        <button className="secondary-button" onClick={onActions}>
          <Footprints size={16} />
          更多行动
        </button>
        <button
          className="gold-button"
          disabled={disabled}
          onClick={() => send({ type: 'endHero' })}
        >
          <Check size={16} />
          结束当前行动
        </button>
      </div>
      {!active && (
        <small>正在等待{game.heroes[game.active].name}结束行动。</small>
      )}
      {active &&
        !hero.ended &&
        game.phase === 'haunt' &&
        game.heroes.filter((h) => !h.dead && !h.traitor && !h.ended).length ===
          1 && <small>最后一名好人，结束后敌人开始追猎。</small>}
    </aside>
  );
}
