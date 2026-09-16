import { Skull } from 'lucide-react';
import { TRAITS, TRAIT_KEYS } from '../lib/game-data.mjs';
import { traitRuleView } from '../lib/rule-views.mjs';

export default function AttributeTracks({
  hero,
  enemy,
  game,
  changes = [],
  compact = false,
}) {
  const rows = enemy
    ? [
        ...(Number.isFinite(enemy.hp) && Number.isFinite(enemy.maxHp)
          ? [
              {
                key: 'health',
                name: '生命',
                value: `${enemy.hp}/${enemy.maxHp}`,
                current: enemy.hp,
                start: enemy.maxHp,
                track: Array.from({ length: enemy.maxHp + 1 }, (_, i) => i),
              },
            ]
          : []),
        ...['might', 'speed']
          .filter((key) => Number.isFinite(enemy[key]))
          .map((key) => ({
            key,
            name: key === 'speed' ? '移动' : '力量',
            value: enemy[key],
          })),
      ]
    : TRAIT_KEYS.map((key) =>
        game
          ? traitRuleView(game, hero, key)
          : {
              key,
              label: TRAITS[key],
              exists: true,
              hidden: false,
              changeable: true,
              value: hero.tracks[key][hero.stats[key]],
              current: hero.stats[key],
              start: hero.start[key],
              track: hero.tracks[key],
            },
      )
        .filter((view) => view.exists && !view.hidden)
        .map((view) => ({
          key: view.key,
          name: view.label,
          value: view.value,
          current: view.current,
          start: view.start,
          track: view.changeable ? view.track : null,
        }));
  return (
    <span
      className={
        'traits-grid attribute-tracks ' + (compact ? 'compact-traits' : '')
      }
    >
      {rows.map((row) => (
        <span
          key={row.key}
          className={
            'trait-row trait-' +
            row.key +
            (changes.some((c) => c.trait === row.key) ? ' trait-changed' : '')
          }
        >
          <span className="trait-caption">
            <span>{row.name}</span>
            <strong>{row.value}</strong>
          </span>
          {row.track && !compact && (
            <span
              className="trait-track"
              aria-label={`${row.name}当前${row.value}，位于第${row.current}格`}
            >
              {row.track.map((n, i) => (
                <span
                  key={i}
                  title={`第${i}格：${i === 0 ? '死亡' : n}${i === row.current ? ' · 当前' : ''}${i === row.start ? ' · 起始' : ''}`}
                  aria-current={i === row.current ? 'step' : undefined}
                  className={
                    (i === row.current ? 'trait-current ' : '') +
                    (i === row.start ? 'trait-start' : '')
                  }
                >
                  {i === 0 ? <Skull size={10} /> : n}
                </span>
              ))}
            </span>
          )}
        </span>
      ))}
    </span>
  );
}
