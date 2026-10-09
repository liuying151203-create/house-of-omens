'use client';
import { useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { traitRuleView } from '@/lib/rule-views.mjs';
export default function DamagePlanner({ game, p, send }) {
  const keys =
      p.traits ||
      (p.damageType === 'physical'
        ? ['might', 'speed']
        : ['sanity', 'knowledge']),
    h = game.heroes[p.heroId],
    privateStats = !h?.stats || !h?.tracks || !h?.start,
    views = privateStats
      ? {}
      : Object.fromEntries(
          keys.map((key) => [key, traitRuleView(game, h, key)]),
        );
  const [allocation, setAllocation] = useState(() =>
    Object.fromEntries(keys.map((key) => [key, 0])),
  );
  if (privateStats)
    return (
      <p className="private-info">
        伤害详情仅对负责此角色的玩家可见，请等待对方完成分配。
      </p>
    );
  const left = p.remaining - keys.reduce((n, k) => n + allocation[k], 0),
    minimum = game.phase === 'explore' ? 1 : 0,
    lethal = keys.some((k) => h.stats[k] - allocation[k] <= 0 && minimum === 0);
  return (
    <div className="damage-planner">
      <div className="damage-counter">
        {h.name} · 还需分配 <strong>{left}</strong> / {p.remaining} 点
      </div>

      {keys.map((k) => {
        const view = views[k],
          after = Math.max(minimum, view.current - allocation[k]),
          other = keys.find((key) => key !== k);
        return (
          <div
            className={
              'damage-track-plan ' + (allocation[k] ? 'has-damage' : '')
            }
            key={k}
          >
            <div className="damage-plan-heading">
              <strong>{view.label}</strong>
              <span>
                {view.value} → <b>{after === 0 ? '☠' : view.track[after]}</b>
              </span>
              <small>下降 {allocation[k]} 格</small>
            </div>
            <div className="damage-plan-controls">
              <button
                className="icon-button damage-minus"
                aria-label={'增加' + view.label + '承受的伤害'}
                title="增加此项伤害；分满时从另一项转移一点"
                disabled={left === 0 && (!other || allocation[other] === 0)}
                onClick={() =>
                  setAllocation((v) => {
                    return {
                      ...v,
                      [k]: v[k] + 1,
                      ...(other
                        ? { [other]: v[other] - (left === 0 ? 1 : 0) }
                        : {}),
                    };
                  })
                }
              >
                <Minus size={18} />
              </button>
              <div className="damage-preview-track">
                {view.track.map((n, i) => (
                  <span
                    key={i}
                    className={
                      (i === view.current ? 'before ' : '') +
                      (i === after ? 'after ' : '') +
                      (i >= after && i < view.current ? 'lost' : '')
                    }
                    title={
                      i === after
                        ? '预计位置'
                        : i === view.current
                          ? '当前位置'
                          : undefined
                    }
                  >
                    {i === 0 ? '☠' : n}
                  </span>
                ))}
              </div>
              <button
                className="icon-button damage-plus"
                aria-label={'撤回一点' + view.label + '伤害'}
                disabled={allocation[k] === 0}
                onClick={() => setAllocation((v) => ({ ...v, [k]: v[k] - 1 }))}
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        );
      })}
      {lethal && (
        <p className="lethal-warning">
          此分配将使 {h.name} 死亡。可以撤回调整，确认后生效。
        </p>
      )}
      <button
        className="gold-button"
        disabled={left !== 0}
        onClick={() =>
          send({ type: 'allocateDamage', requestId: p.uid, allocation })
        }
      >
        <Check size={17} />
        {lethal
          ? '确认分配并承受致命伤害'
          : '确认分配 ' + p.remaining + ' 点伤害'}
      </button>
    </div>
  );
}
