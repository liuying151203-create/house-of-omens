import AttributeTracks from './attribute-tracks';
import HeroStatusBadges from './hero-status-badges';
import { Check, Footprints, Package } from 'lucide-react';
import {
  personalHero,
  locationLabel,
  enemyHero,
  canInspectHero,
  heroController,
} from '../lib/game-view.mjs';
import { wolfMight } from '../lib/werewolf.mjs';
import HeroInventory from './hero-inventory';
import ExplorerEmblem from './explorer-emblem';

export default function PersonalPanel({
  game,
  net,
  send,
  waiting,
  moving,
  changes,
  commands,
}) {
  const hero = personalHero(game, net.room);
  if (!hero)
    return (
      <aside className="spectator-badge">
        旁观中 · 点击左侧人物查看公开资料
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
  const inspectable = canInspectHero(game, hero, net.room);
  const controller = heroController(net.room, hero.id);
  return (
    <div
      className="explorer-controls"
      style={{ '--explorer-color': hero.color }}
    >
      {commands}
      <aside className="explorer-vitals" aria-label="当前控制人物的状态">
        <div className="explorer-identity">
          <ExplorerEmblem hero={hero} />
          <strong>{hero.name}</strong>
          {controller && (
            <span className="explorer-player-name">
              {controller.id === net.room?.you ? '你' : controller.name}
              {controller.id === net.room?.you && ` · ${controller.name}`}
            </span>
          )}
          <small>{hero.role}</small>
        </div>
        <div className="explorer-readout">
          <header>
            <span className="explorer-movement">
              <Footprints size={15} />
              <b>
                {hero.dead || hero.traitor || hero.stopped || hero.ended
                  ? '—'
                  : hero.moves}
              </b>
              <span>
                {hero.dead
                  ? '已死亡'
                  : hero.traitor
                    ? '已转化'
                    : hero.ended
                      ? '行动结束'
                      : hero.stopped
                        ? '停止移动'
                        : '移动'}
              </span>
            </span>
            <span
              className="explorer-position"
              title={locationLabel(game, enemy?.pos || hero.pos)}
            >
              {locationLabel(game, enemy?.pos || hero.pos)}
            </span>
          </header>
          {inspectable ? (
            <AttributeTracks
              game={game}
              hero={hero}
              compact={false}
              changes={changes.filter((c) => c.heroId === hero.id)}
            />
          ) : (
            enemy && (
              <AttributeTracks
                enemy={{ ...enemy, might: wolfMight(game, enemy) }}
              />
            )
          )}
          <footer>
            <span
              className="turn-state-dot"
              title={active ? '正在行动' : '等待队友行动'}
              aria-label={active ? '正在行动' : '等待队友行动'}
              data-active={active}
            />
            <HeroStatusBadges game={game} hero={hero} />
          </footer>
        </div>
      </aside>
      <aside className="explorer-satchel" aria-label="随身物品与预兆">
        <header>
          <span>
            <Package size={14} />
            随身物品{' '}
            {inspectable && (
              <small>{hero.items.length + hero.omens.length}</small>
            )}
          </span>
        </header>
        <HeroInventory
          game={game}
          hero={hero}
          room={net.room}
          send={send}
          disabled={disabled}
          slots
        />
      </aside>
      <button
        className="finish-turn"
        disabled={disabled}
        onClick={() =>
          send({ type: 'endHero', actorId: hero.id, round: game.round })
        }
        title={
          !active
            ? '等待当前人物结束行动'
            : game.phase === 'haunt' &&
                game.heroes.filter((h) => !h.dead && !h.traitor && !h.ended)
                  .length === 1
              ? '结束后敌人开始追猎'
              : '结束当前人物行动'
        }
      >
        <Check size={26} />
        <span>{hero.ended ? '已结束' : '结束行动'}</span>
      </button>
    </div>
  );
}
