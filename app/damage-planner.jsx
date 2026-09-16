'use client';
import { useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { suggestDamage } from '@/lib/damage-plan.mjs';
import { traitRuleView } from '@/lib/rule-views.mjs';
export default function DamagePlanner({ game, p, send }) {
  const keys =
      p.traits ||
      (p.damageType === 'physical'
        ? ['might', 'speed']
        : ['sanity', 'knowledge']),
    h = game.heroes[p.heroId],
    views = Object.fromEntries(
      keys.map((key) => [key, traitRuleView(game, h, key)]),
    );
  const [allocation, setAllocation] = useState(() =>
    suggestDamage(h, p.damageType, p.remaining, game.phase, game, keys),
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
            <div className="damage-consequence">
              {after === view.current
                ? '不受影响'
                : after === 0
                  ? '致命伤害'
                  : view.value === view.track[after]
                    ? '位置下降，当前能力数值不变'
                    : k === 'speed'
                      ? `下回合基础移动力 ${view.value} → ${view.track[after]}`
                      : `${view.label}检定骰数 ${view.value} → ${view.track[after]}`}
            </div>
          </div>
        );
      })}
      <div className="damage-plan-legend">
        <span>虚线：当前位置</span>
        <span>亮框：确认后位置</span>
        <span>红色：经过的格子</span>
      </div>
      {lethal ? (
        <p className="lethal-warning">
          此分配将使 {h.name} 死亡。可以撤回调整，确认后生效。
        </p>
      ) : (
        <p>
          {minimum === 1
            ? '作祟前最低停在第 1 格。'
            : '任一属性抵达骷髅位，角色死亡。'}
          数值可能相同，但位置仍会下降。
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
