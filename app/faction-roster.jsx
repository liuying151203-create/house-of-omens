import { Skull, LockKeyhole } from 'lucide-react';
import {
  rosterGroups,
  locationLabel,
  enemyMark,
  canInspectHero,
} from '../lib/game-view.mjs';
import { statusOf } from '../lib/werewolf.mjs';
import { TRAITS } from '../lib/game-data.mjs';

export default function FactionRoster({
  game,
  send,
  net,
  waiting,
  pending,
  Traits,
  changes,
}) {
  return (
    <div className="faction-roster">
      {rosterGroups(game).map((group) => (
        <section
          className={'faction-group faction-' + group.id}
          key={group.id}
          aria-label={group.name}
        >
          <h3 className="faction-heading">
            {group.name}
            <span>
              {group.heroes.length +
                group.enemies.length +
                (group.unknown ? 1 : 0)}
            </span>
          </h3>
          <div className="hero-list">
            {group.heroes.map((h) => {
              const mine =
                !net.session ||
                (net.room?.seats[h.id] || net.room?.hostId) === net.room?.you;
              const privateTraits = !canInspectHero(game, h, net.room);
              const delta = privateTraits
                ? []
                : changes.filter((c) => c.heroId === h.id);
              return (
                <button
                  key={h.id}
                  className={
                    'hero-card ' +
                    (h.id === game.active && !h.dead && !h.traitor
                      ? 'active '
                      : '') +
                    (h.dead ? 'fallen ' : '') +
                    (delta.length ? 'hero-changed' : '')
                  }
                  style={{ '--hero-color': h.color }}
                  onClick={() => send({ type: 'select', id: h.id })}
                  disabled={
                    h.dead ||
                    h.traitor ||
                    h.ended ||
                    !!pending ||
                    (net.session && (waiting || !mine))
                  }
                  aria-pressed={h.id === game.active}
                >
                  <div className="hero-heading">
                    <span className="hero-portrait">
                      {h.dead ? <Skull size={24} /> : h.traitor ? '👻' : h.mark}
                    </span>
                    <span className="hero-title">
                      <strong>{h.name}</strong>
                      <small>
                        {h.dead
                          ? '已死亡'
                          : h.traitor
                            ? '已转化'
                            : statusOf(h, 'infection')
                              ? `狼毒 · ${statusOf(h, 'infection').turns}轮`
                              : statusOf(h, 'immunity')
                                ? '净血保护'
                                : h.role}
                      </small>
                    </span>
                    {h.id === game.active && !h.dead && !h.traitor && (
                      <span className="active-mark">行动中</span>
                    )}
                  </div>
                  {!privateTraits && (
                    <Traits
                      hero={h}
                      compact={h.id !== game.active}
                      changes={delta}
                    />
                  )}
                  {delta.length > 0 && (
                    <span className="hero-change-summary">
                      {delta
                        .map(
                          (c) =>
                            `${TRAITS[c.trait]} ${c.steps > 0 ? '+' : ''}${c.steps}格`,
                        )
                        .join(' · ')}
                    </span>
                  )}
                  <div className="hero-bottom">
                    <span>{locationLabel(game, h.pos)}</span>
                    <span>
                      {h.dead
                        ? '已死亡'
                        : h.traitor
                          ? '普通人物能力停用'
                          : h.ended
                            ? '已结束'
                            : h.stopped
                              ? '已停止移动'
                              : `${h.moves}移动`}
                    </span>
                  </div>
                </button>
              );
            })}
            {group.enemies.map((e) => (
              <article className="hero-card enemy-roster-card" key={e.id}>
                <div className="hero-heading">
                  <span className="hero-portrait">{enemyMark(e)}</span>
                  <span className="hero-title">
                    <strong>{e.name}</strong>
                    <small>
                      {e.explorerName
                        ? `原探险者 · ${e.explorerName}`
                        : '已现身'}
                    </small>
                  </span>
                </div>
                <div className="enemy-public-stats">
                  <span>
                    生命{' '}
                    <b>
                      {e.hp}/{e.maxHp}
                    </b>
                  </span>
                  <span>
                    力量 <b>{e.might}</b>
                  </span>
                  <span>
                    移动 <b>{e.speed}</b>
                  </span>
                </div>
                <button
                  className="enemy-location text-button"
                  onClick={() =>
                    send({
                      type: 'viewFloor',
                      floor: game.rooms.find((r) => r.id === e.pos).floor,
                    })
                  }
                >
                  {locationLabel(game, e.pos)}
                </button>
                <p className="private-info">
                  <LockKeyhole size={12} />
                  {e.explorerName
                    ? '转化前的物品与属性轨不作为怪物能力展示'
                    : '仅显示已公开能力'}
                </p>
              </article>
            ))}
            {group.unknown && (
              <article className="hero-card unknown-entity">
                <span className="hero-portrait">?</span>
                <strong>镜魇 · 未现形</strong>
                <p className="private-info">
                  位置与数值未公开，调查古镜后揭晓。
                </p>
              </article>
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
