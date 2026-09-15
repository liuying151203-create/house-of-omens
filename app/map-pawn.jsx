import ExplorerEmblem from './explorer-emblem';

export default function MapPawn({
  hero,
  active = false,
  className = 'pawn',
  badge,
  onInspect,
}) {
  const label =
    '查看' +
    hero.name +
    '的状态' +
    (active && !hero.ended ? '，当前行动人物' : '');
  return (
    <button
      type="button"
      className={className + (active ? ' selected-pawn' : '')}
      style={{ backgroundColor: hero.color, '--pawn-color': hero.color }}
      title={label}
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onInspect?.('hero-' + hero.id);
      }}
    >
      <ExplorerEmblem hero={hero} token />
      {badge !== undefined && badge !== null ? (
        <sup className="infection-badge">{badge}</sup>
      ) : null}
    </button>
  );
}
