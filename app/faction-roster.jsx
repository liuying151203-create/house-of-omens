import EnemyGlyph from './enemy-glyph';
import AttributeTracks from './attribute-tracks';
import HeroStatusBadges from './hero-status-badges';
import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Footprints, LockKeyhole, MapPin, ArrowRight } from 'lucide-react';
import HeroInventory from './hero-inventory';
import ExplorerEmblem from './explorer-emblem';
import {
  rosterGroups,
  locationLabel,
  canInspectHero,
} from '../lib/game-view.mjs';
import { statusOf } from '../lib/werewolf.mjs';
import { FLOORS } from '../lib/game-data.mjs';

export default function FactionRoster({
  game,
  send,
  net,
  waiting,
  pending,
  changes,
  open = true,
  inspected: controlledInspected,
  onInspectedChange,
}) {
  const [localInspected, setLocalInspected] = useState(null);
  const inspected =
    controlledInspected === undefined ? localInspected : controlledInspected;
  const setInspected = useCallback(
    (value) => (onInspectedChange || setLocalInspected)(value),
    [onInspectedChange],
  );
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setInspected(null);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [setInspected]);
  const groups = rosterGroups(game);
  const person = groups
    .flatMap((g) => g.heroes)
    .find((h) => inspected === 'hero-' + h.id);
  const enemy = groups
    .flatMap((g) => g.enemies)
    .find((e) => inspected === 'enemy-' + e.id);
  const floorName = (pos) =>
    FLOORS.find((f) => f.id === game.rooms.find((r) => r.id === pos)?.floor)
      ?.name || '未知位置';
  const status = (h) =>
    h.dead
      ? '已死亡'
      : h.traitor
        ? '已转化'
        : h.ended
          ? '已结束'
          : h.stopped
            ? '停止移动'
            : h.moves + ' 移动';
  const mine =
    person &&
    (!net.session ||
      (net.room?.seats[person.id] || net.room?.hostId) === net.room?.you);
  const selectable =
    person &&
    mine &&
    !person.dead &&
    !person.traitor &&
    !person.ended &&
    !pending &&
    !waiting &&
    !net.busy;
  const visible = person && canInspectHero(game, person, net.room);
  return (
    <div className="party-rail">
      {groups.map((group) => (
        <section
          className={'rail-faction rail-' + group.id}
          key={group.id}
          aria-label={group.name}
        >
          <h3>
            {group.name}
            <span>
              {group.heroes.length +
                group.enemies.length +
                (group.unknown ? 1 : 0)}
            </span>
          </h3>
          {group.heroes.map((h) => {
            const publicStats = canInspectHero(game, h, net.room);
            return (
              <button
                key={'hero-' + h.id}
                className={
                  'party-member ' +
                  (h.id === game.active ? 'member-active ' : '') +
                  (h.dead ? 'member-fallen' : '')
                }
                style={{ '--explorer-color': h.color }}
                aria-label={'查看' + h.name + '的状态与物品'}
                aria-expanded={inspected === 'hero-' + h.id}
                onClick={() =>
                  setInspected(
                    inspected === 'hero-' + h.id ? null : 'hero-' + h.id,
                  )
                }
              >
                <ExplorerEmblem hero={h} small />
                <span className="member-summary">
                  <strong>
                    {h.name}
                    <small>{floorName(h.pos)}</small>
                  </strong>
                  {publicStats && (
                    <AttributeTracks
                      game={game}
                      hero={h}
                      changes={changes.filter((c) => c.heroId === h.id)}
                    />
                  )}
                  <span
                    className={
                      'member-status ' +
                      (statusOf(h, 'infection') ? 'infected-status' : '')
                    }
                  >
                    {h.id === game.active && !h.dead && !h.traitor ? (
                      <i aria-label="当前行动人物" />
                    ) : null}
                    {status(h)}
                    <HeroStatusBadges game={game} hero={h} inline />
                  </span>
                </span>
              </button>
            );
          })}
          {group.enemies.map((e) => (
            <button
              className="party-member member-enemy"
              key={e.id}
              aria-label={'查看' + e.name}
              aria-expanded={inspected === 'enemy-' + e.id}
              onClick={() =>
                setInspected(
                  inspected === 'enemy-' + e.id ? null : 'enemy-' + e.id,
                )
              }
            >
              <span className="enemy-emblem">{<EnemyGlyph enemy={e} />}</span>
              <span className="member-summary">
                <strong>{e.name}</strong>
                <AttributeTracks enemy={e} />
                <span className="member-status">{floorName(e.pos)}</span>
              </span>
            </button>
          ))}
          {group.unknown && (
            <div className="party-member member-unknown">
              <span className="enemy-emblem">?</span>
              <span className="member-summary">
                <strong>镜魇</strong>
                <span className="member-status">
                  <LockKeyhole size={12} />
                  尚未现形
                </span>
              </span>
            </div>
          )}
        </section>
      ))}
      {open &&
        (person || enemy) &&
        createPortal(
          <aside
            className="roster-inspector"
            aria-label={(person?.name || enemy.name) + '的详细资料'}
          >
            <header>
              <strong>{person?.name || enemy.name}</strong>
              <button
                className="icon-button"
                aria-label="关闭人物资料"
                onClick={() => setInspected(null)}
              >
                <X size={18} />
              </button>
            </header>
            <p className="inspector-location">
              <MapPin size={14} />
              {locationLabel(game, person?.pos || enemy.pos)}
            </p>
            {person ? (
              <>
                <span className="inspector-condition">
                  {person.role} · {status(person)}
                </span>
                {visible ? (
                  <AttributeTracks
                    game={game}
                    hero={person}
                    compact={false}
                    changes={changes.filter((c) => c.heroId === person.id)}
                  />
                ) : (
                  <p className="private-info">
                    <LockKeyhole size={14} />
                    此人物的属性与物品未公开或已停用。
                  </p>
                )}
                <HeroStatusBadges game={game} hero={person} />
                <h4>持有物品与预兆</h4>
                <HeroInventory game={game} hero={person} room={net.room} />
                {mine && !person.dead && !person.traitor && (
                  <button
                    className="gold-button"
                    disabled={!selectable || person.id === game.active}
                    onClick={() => {
                      send({ type: 'select', id: person.id });
                      setInspected(null);
                    }}
                  >
                    <Footprints size={15} />
                    {person.id === game.active
                      ? '当前行动人物'
                      : '切换为此人物行动'}
                  </button>
                )}
              </>
            ) : (
              <>
                <AttributeTracks enemy={enemy} />
                <p className="private-info">
                  <LockKeyhole size={14} />
                  {enemy.explorerName
                    ? '原人物的物品与属性轨已停用。'
                    : '仅展示已公开能力。'}
                </p>
                <button
                  className="secondary-button"
                  onClick={() =>
                    send({
                      type: 'viewFloor',
                      floor: game.rooms.find((r) => r.id === enemy.pos).floor,
                    })
                  }
                >
                  查看所在楼层
                  <ArrowRight size={15} />
                </button>
              </>
            )}
          </aside>,
          document.body,
        )}
    </div>
  );
}
