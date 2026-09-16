import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import ItemGlyph from './item-glyph';
import { resolveCard } from '../lib/card-rules.mjs';
import { hauntCardRule, canInspectHero } from '../lib/game-view.mjs';
import { TRAITS } from '../lib/game-data.mjs';
import { itemInstances } from '../lib/item-instances.mjs';
import {
  itemActionViews,
  itemManagementActionViews,
} from '../lib/content/item-actions.mjs';

export default function HeroInventory({
  game,
  hero,
  room,
  send,
  disabled = true,
  slots = false,
}) {
  const [selected, setSelected] = useState(null);
  const [anchor, setAnchor] = useState(null);
  const closeTimer = useRef(null);
  const popupId = useId();
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', close);
    return () => {
      window.removeEventListener('keydown', close);
      clearTimeout(closeTimer.current);
    };
  }, []);
  const reveal = (event, key, pinned = false) => {
    clearTimeout(closeTimer.current);
    const box = event.currentTarget.getBoundingClientRect();
    setAnchor({
      left: Math.max(12, Math.min(window.innerWidth - 324, box.left)),
      bottom: Math.max(12, window.innerHeight - box.top + 12),
      maxHeight: Math.max(100, box.top - 24),
    });
    setSelected({ key, pinned });
  };
  const hideSoon = () => {
    if (!selected?.pinned)
      closeTimer.current = setTimeout(() => setSelected(null), 180);
  };
  if (!canInspectHero(game, hero, room))
    return <p className="private-info">物品与原人物能力未公开或已停用。</p>;
  const cards = [
      ...itemInstances(hero).map((instance) => ({
        ...resolveCard(game, 'item', instance.definitionId, hero.id),
        cardType: 'item',
        instanceId: instance.instanceId,
      })),
      ...hero.omens.map((id, index) => ({
        ...resolveCard(game, 'omen', id, hero.id),
        cardType: 'omen',
        instanceId: `omen:${hero.id}:${id}:${index}`,
      })),
    ],
    itemActions = [
      ...itemActionViews(game, hero, TRAITS),
      ...itemManagementActionViews(game, hero),
    ];
  const content = (card) => {
    const abilities = itemActions.filter(
      (action) => action.instanceId === card.instanceId,
    );
    return (
      <div className="carried-card-content">
        <p>{card.effect}</p>
        {hauntCardRule(card, game) && (
          <div className="haunt-card-rule">
            <strong>☾ 作祟能力</strong>
            <p>{hauntCardRule(card, game)}</p>
          </div>
        )}
        {send && abilities.length > 0 && (
          <div className="item-use-options">
            {abilities.map((ability) => (
              <button
                key={ability.id}
                disabled={disabled || !ability.available}
                title={
                  ability.available ? ability.detail : ability.unavailableReason
                }
                onClick={() =>
                  send(ability.command || { type: ability.commandType })
                }
              >
                {ability.label}
                {ability.charges !== null && ability.charges !== undefined
                  ? ` · ${ability.charges}/${ability.maxCharges}`
                  : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };
  if (slots) {
    const chosen = cards.find((card) => selected?.key === card.instanceId);
    return (
      <div className="inventory-belt" aria-label={hero.name + '的道具槽'}>
        {cards.map((card, i) => {
          const omen = card.cardType === 'omen',
            key = card.instanceId;
          return (
            <button
              key={key + ':' + i}
              className={
                'item-slot ' +
                (omen ? 'slot-omen ' : '') +
                (chosen?.instanceId === card.instanceId ? 'slot-selected' : '')
              }
              aria-label={
                card.title + (card.use ? '，可使用物品' : '，被动效果')
              }
              aria-expanded={chosen?.instanceId === card.instanceId}
              aria-controls={
                chosen?.instanceId === card.instanceId ? popupId : undefined
              }
              onPointerEnter={(e) => {
                if (!selected?.pinned) reveal(e, key);
              }}
              onPointerLeave={hideSoon}
              onFocus={(e) => reveal(e, key)}
              onBlur={hideSoon}
              onClick={(e) => {
                if (selected?.key === key && selected.pinned) setSelected(null);
                else reveal(e, key, true);
              }}
            >
              <ItemGlyph id={card.id} omen={omen} />
              <span>{card.title}</span>
              <i
                className={card.use ? 'slot-usable' : 'slot-passive'}
                aria-hidden="true"
              />
            </button>
          );
        })}
        {Array.from({ length: Math.max(0, 4 - cards.length) }, (_, i) => (
          <span
            className="item-slot empty-slot"
            aria-hidden="true"
            key={'empty-' + i}
          >
            ＋
          </span>
        ))}
        {!cards.length && (
          <small className="empty-belt-label">尚未携带物品</small>
        )}
        {chosen &&
          anchor &&
          createPortal(
            <section
              id={popupId}
              className="inventory-popover"
              aria-label={chosen.title}
              style={anchor}
              onPointerEnter={() => clearTimeout(closeTimer.current)}
              onPointerLeave={hideSoon}
            >
              <header>
                <ItemGlyph id={chosen.id} omen={chosen.cardType === 'omen'} />
                <div>
                  <small>
                    {chosen.cardType === 'omen'
                      ? '预兆'
                      : chosen.use
                        ? '消耗品'
                        : '装备'}{' '}
                    · {hero.name}
                  </small>
                  <strong>{chosen.title}</strong>
                </div>
                <button
                  className="icon-button"
                  aria-label="关闭物品详情"
                  onClick={() => setSelected(null)}
                >
                  <X size={16} />
                </button>
              </header>
              {content(chosen)}
            </section>,
            document.body,
          )}
      </div>
    );
  }
  return (
    <div className="hero-inventory" aria-label={hero.name + '持有的物品与预兆'}>
      {!cards.length && (
        <span className="inventory-empty">尚未持有物品或预兆</span>
      )}
      {cards.map((card) => (
        <details className="carried-card" key={card.instanceId}>
          <summary>
            {card.cardType === 'omen' ? '◈ ' : '◇ '}
            {card.title}
          </summary>
          {content(card)}
        </details>
      ))}
    </div>
  );
}
