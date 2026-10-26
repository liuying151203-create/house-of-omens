'use client';
import { useState } from 'react';
import { Minus, Plus, Check } from 'lucide-react';
import { traitRuleView } from '@/lib/rule-views.mjs';
import {
  traitPositionBounds,
  ordinaryDamageLimits,
} from '../lib/content/bloodmoon-health.mjs';
import { damageExplanation } from '../lib/damage-presentation.mjs';
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
    limits = ordinaryDamageLimits(game, h, p),
    invalidAllocation =
      limits && keys.some((key) => allocation[key] > limits[key]),
    explanation = damageExplanation(game, p),
    bounds = Object.fromEntries(
      keys.map((key) => [
        key,
        traitPositionBounds(game, h, key, p, views[key].track.length - 1),
      ]),
    ),
    lethal = keys.some(
      (k) => h.stats[k] - allocation[k] <= 0 && bounds[k].minimum === 0,
    );
  return (
    <div className="damage-planner">
      {explanation && (
        <aside className="damage-cause" aria-label="伤害原因与规则">
          <strong>{explanation.title}</strong>
          {explanation.text && <p>{explanation.text}</p>}
          {explanation.rule && (
            <p className="damage-source-rule">{explanation.rule}</p>
          )}
        </aside>
      )}
      <div className="damage-counter">
        {h.name} · 还需分配 <strong>{left}</strong> / {p.remaining} 点
      </div>
      {limits && (
        <p className="damage-source-rule">
          力量或速度仍能下降时，必须先扣减这些格数；两项都到第1格后，多余伤害才失效。
        </p>
      )}

      {keys.map((k) => {
        const view = views[k],
          after = Math.max(bounds[k].minimum, view.current - allocation[k]),
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
            </div>
            <div className="damage-plan-controls">
              <button
                className="icon-button damage-minus"
                aria-label={'增加' + view.label + '承受的伤害'}
                title="增加此项伤害；分满时从另一项转移一点"
                disabled={
                  (limits && allocation[k] >= limits[k]) ||
                  (left === 0 && (!other || allocation[other] === 0))
                }
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
        disabled={left !== 0 || invalidAllocation}
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
