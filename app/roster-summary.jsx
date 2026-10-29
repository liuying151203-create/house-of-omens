import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Droplets,
  Eye,
  Footprints,
  HeartPulse,
  HandFist,
  CircleCheck,
  CircleSlash,
  Skull,
  Package,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import ItemGlyph from './item-glyph';
import { TRAIT_KEYS } from '../lib/game-data.mjs';
import { traitRuleView } from '../lib/rule-views.mjs';
import { heroStatuses } from '../lib/hero-status.mjs';
import { resolveCard } from '../lib/card-rules.mjs';
import { itemInstances } from '../lib/item-instances.mjs';

const traitIcons = {
  might: HandFist,
  speed: Footprints,
  sanity: Eye,
  knowledge: BookOpen,
};
const labels = {
  might: '力量',
  speed: '速度',
  sanity: '理智',
  knowledge: '知识',
};

function Hint({ label, children, className = '' }) {
  const [tip, setTip] = useState(null);
  const timer = useRef(null);
  const dismissTimer = useRef(null);
  const press = useRef(null);
  const longPress = useRef(false);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(dismissTimer.current);
    },
    [],
  );
  const show = (element) => {
    const rect = element.getBoundingClientRect();
    setTip({
      left: Math.max(8, Math.min(window.innerWidth - 288, rect.left)),
      ...(rect.top > window.innerHeight / 2
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  };
  return (
    <span
      className={'roster-hint ' + className}
      aria-label={label}
      onPointerEnter={(e) => {
        if (e.pointerType !== 'touch') show(e.currentTarget);
      }}
      onPointerLeave={(e) => {
        clearTimeout(timer.current);
        if (e.pointerType !== 'touch') setTip(null);
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return;
        clearTimeout(timer.current);
        clearTimeout(dismissTimer.current);
        longPress.current = false;
        press.current = { x: e.clientX, y: e.clientY };
        const element = e.currentTarget;
        timer.current = setTimeout(() => {
          longPress.current = true;
          show(element);
          dismissTimer.current = setTimeout(() => setTip(null), 2500);
        }, 500);
      }}
      onPointerMove={(e) => {
        if (
          press.current &&
          Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) >
            10
        )
          clearTimeout(timer.current);
      }}
      onPointerUp={() => {
        clearTimeout(timer.current);
        press.current = null;
      }}
      onPointerCancel={() => {
        clearTimeout(timer.current);
        press.current = null;
      }}
      onContextMenu={(e) => e.preventDefault()}
      onClickCapture={(e) => {
        if (longPress.current) {
          e.preventDefault();
          e.stopPropagation();
          longPress.current = false;
        }
      }}
    >
      {children}
      {tip &&
        createPortal(
          <span role="tooltip" className="roster-icon-tip" style={tip}>
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}

export default function RosterSummary({ game, hero, enemy, visible }) {
  const traits = hero
    ? visible
      ? TRAIT_KEYS.map((key) => traitRuleView(game, hero, key))
          .filter((view) => view.exists && !view.hidden)
          .map((view) => ({
            key: view.key,
            value: view.value,
            label: view.label,
          }))
      : []
    : ['might', 'speed', ...(enemy.traitModel ? ['sanity', 'knowledge'] : [])]
        .map((key) => ({
          key,
          value:
            enemy.traitModel === 'tracks'
              ? enemy.tracks?.[key]?.[enemy.positions?.[key]]
              : enemy.traitModel === 'fixed'
                ? enemy.traits?.[key]
                : enemy[key],
          label: !enemy.traitModel && key === 'speed' ? '移动' : labels[key],
        }))
        .filter((entry) => Number.isFinite(entry.value));
  const cards =
    hero && visible
      ? [
          ...itemInstances(hero).map((item) => ({
            id: item.definitionId,
            type: 'item',
            key: item.instanceId,
          })),
          ...(hero.omens || []).map((id, index) => ({
            id,
            type: 'omen',
            key: `omen:${id}:${index}`,
          })),
        ]
      : [];
  const statuses = hero ? heroStatuses(game, hero) : [];
  const condition = hero?.dead
    ? { label: '已死亡', Icon: Skull }
    : hero?.traitor
      ? { label: '已转化', Icon: CircleSlash }
      : hero?.ended
        ? { label: '行动结束', Icon: CircleCheck }
        : hero?.stopped
          ? { label: '停止移动', Icon: CircleSlash }
          : null;
  return (
    <>
      <span className="roster-stat-icons">
        {enemy && Number.isFinite(enemy.hp) && Number.isFinite(enemy.maxHp) && (
          <Hint
            label={`生命 ${enemy.hp}/${enemy.maxHp}`}
            className="roster-stat trait-health"
          >
            <HeartPulse size={14} aria-hidden="true" />
            <b>
              {enemy.hp}/{enemy.maxHp}
            </b>
          </Hint>
        )}
        {traits.map(({ key, value, label }) => {
          const Icon = traitIcons[key];
          return (
            <Hint
              key={key}
              label={`${label} ${value}`}
              className={`roster-stat roster-stat-${key}`}
            >
              <Icon size={14} aria-hidden="true" />
              <b>{value}</b>
            </Hint>
          );
        })}
      </span>
      {(cards.length > 0 || statuses.length > 0 || condition) && (
        <span className="roster-symbols">
          {cards.length > 0 && (
            <span className="roster-symbol-group">
              <Hint label="物品与预兆">
                <Package size={13} aria-hidden="true" />
              </Hint>
              {cards.map((card) => (
                <Hint
                  key={card.key}
                  label={resolveCard(game, card.type, card.id, hero.id).title}
                  className="roster-item"
                >
                  <ItemGlyph
                    id={card.id}
                    omen={card.type === 'omen'}
                    size={15}
                  />
                </Hint>
              ))}
            </span>
          )}
          {(statuses.length > 0 || condition) && (
            <span className="roster-symbol-group">
              <Hint label="状态">
                <Sparkles size={13} aria-hidden="true" />
              </Hint>
              {condition && (
                <Hint label={condition.label}>
                  <condition.Icon size={15} aria-hidden="true" />
                </Hint>
              )}
              {statuses.map((status) => {
                const Icon = status.id.includes('infection')
                  ? Droplets
                  : status.id.includes('knockdown')
                    ? ShieldAlert
                    : status.id.includes('immunity')
                      ? ShieldCheck
                      : status.id.includes('wounded')
                        ? HeartPulse
                        : status.id.includes('pursuit')
                          ? Footprints
                          : Sparkles;
                return (
                  <Hint
                    key={status.id}
                    label={`${status.label}${status.count !== undefined ? `，剩余${status.count}轮` : ''}：${status.description}`}
                    className={`roster-status status-${status.id}`}
                  >
                    <Icon size={15} aria-hidden="true" />
                    {status.count !== undefined && <b>{status.count}</b>}
                  </Hint>
                );
              })}
            </span>
          )}
        </span>
      )}
    </>
  );
}
