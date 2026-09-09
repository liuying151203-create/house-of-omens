import { resolveCard } from '../lib/card-rules.mjs';
import { hauntCardRule, canInspectHero } from '../lib/game-view.mjs';
import { TRAITS } from '../lib/game-data.mjs';

export default function HeroInventory({
  game,
  hero,
  room,
  send,
  disabled = true,
}) {
  if (!canInspectHero(game, hero, room))
    return <p className="private-info">物品与原人物能力未公开或已停用。</p>;
  const cards = [
    ...hero.items.map((id) => resolveCard(game, 'item', id, hero.id)),
    ...hero.omens.map((id) => resolveCard(game, 'omen', id, hero.id)),
  ];
  return (
    <div className="hero-inventory" aria-label={hero.name + '持有的物品与预兆'}>
      {!cards.length && (
        <span className="inventory-empty">尚未持有物品或预兆</span>
      )}
      {cards.map((card) => (
        <details className="carried-card" key={card.id}>
          <summary>
            {hero.omens.includes(card.id) ? '◈ ' : '◇ '}
            {card.title}
          </summary>
          <div className="carried-card-content">
            <p>{card.effect}</p>
            {hauntCardRule(card, game) && (
              <div className="haunt-card-rule">
                <strong>☾ 作祟能力</strong>
                <p>{hauntCardRule(card, game)}</p>
              </div>
            )}
            {send && card.use && (
              <div className="item-use-options">
                {card.use === 'movement' ? (
                  <button
                    disabled={
                      disabled || hero.stopped || hero.used.includes(card.id)
                    }
                    onClick={() => send({ type: 'useItem', id: card.id })}
                  >
                    {hero.stopped
                      ? '下回合可饮用'
                      : '饮用 · 移动 +' + card.useAmount}
                  </button>
                ) : (
                  (card.use === 'healPhysical'
                    ? ['might', 'speed']
                    : ['sanity', 'knowledge']
                  ).map((trait) => (
                    <button
                      key={trait}
                      disabled={
                        disabled ||
                        hero.used.includes(card.id) ||
                        hero.stats[trait] >= hero.start[trait]
                      }
                      onClick={() =>
                        send({ type: 'useItem', id: card.id, trait })
                      }
                    >
                      恢复{TRAITS[trait]}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
