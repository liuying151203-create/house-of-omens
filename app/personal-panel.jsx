import AttributeTracks from './attribute-tracks';
import { useEffect, useState } from 'react';
import HeroStatusBadges from './hero-status-badges';
import { Footprints, Package } from 'lucide-react';
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
import RosterSummary from './roster-summary';
import { pursuitAvailable } from '../lib/content/bloodmoon-pursuit.mjs';
import { blockingRequest } from '../lib/presentation-requests.mjs';

export default function PersonalPanel({
  game,
  net,
  send,
  waiting,
  moving,
  changes,
  commands,
  onInspect,
  onEndHero,
}) {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (window.matchMedia('(max-width: 760px)').matches) setCompact(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);
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
    !!blockingRequest(game) ||
    hero.ended ||
    hero.dead ||
    hero.traitor ||
    game.phase === 'over';
  const enemy = game.enemies.find((e) => enemyHero(game, e)?.id === hero.id);
  const inspectable = canInspectHero(game, hero, net.room);
  const controller = heroController(net.room, hero.id);
  return (
    <div
      className={
        'explorer-controls' + (compact ? ' explorer-controls-compact' : '')
      }
      style={{ '--explorer-color': hero.color }}
    >
      {commands}
      <button
        type="button"
        className="explorer-panel-toggle"
        aria-expanded={!compact}
        onClick={() => setCompact((value) => !value)}
      >
        {compact ? '展开人物与物品' : '收起人物与物品'}
      </button>
      <aside className="explorer-vitals" aria-label="当前控制人物的状态">
        <div className="explorer-identity">
          <button
            type="button"
            className="personal-avatar-button"
            aria-label={'查看' + hero.name + '的详细资料'}
            onClick={() =>
              onInspect?.(
                !inspectable && enemy ? 'enemy-' + enemy.id : 'hero-' + hero.id,
              )
            }
          >
            <ExplorerEmblem hero={hero} />
          </button>
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
          {(inspectable || enemy) && (
            <RosterSummary
              game={game}
              hero={inspectable ? hero : undefined}
              enemy={inspectable ? undefined : enemy}
              visible={inspectable}
            />
          )}
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
              {pursuitAvailable(game, hero) && (
                <small title="本回合还有1点追猎移动，仅可用于靠近残血英雄">
                  +1追猎
                </small>
              )}
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
        onClick={() => onEndHero?.(hero.id, game.round)}
        title={
          !active
            ? '等待当前人物结束行动'
            : game.phase === 'haunt' &&
                game.scenario !== 'bloodmoon' &&
                game.heroes.filter((h) => !h.dead && !h.traitor && !h.ended)
                  .length === 1
              ? '结束后敌人开始追猎'
              : '结束当前人物行动'
        }
      >
        <span>{hero.ended ? '已结束' : '结束行动'}</span>
      </button>
    </div>
  );
}
