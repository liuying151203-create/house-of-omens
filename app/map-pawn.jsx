import ExplorerEmblem from './explorer-emblem';

export default function MapPawn({
  hero,
  active = false,
  className = 'pawn',
  badge,
  onInspect,
  mine = false,
  playerName,
}) {
  const label =
    '查看' +
    hero.name +
    '的状态' +
    (playerName ? `，由${playerName}${mine ? '（你）' : ''}控制` : '') +
    (active && !hero.ended ? '，当前行动人物' : '');
  return (
    <button
      type="button"
      className={
        className + (active ? ' selected-pawn' : '') + (mine ? ' my-pawn' : '')
      }
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
      {mine ? <span className="my-pawn-mark">我</span> : null}
      {badge !== undefined && badge !== null ? (
        <sup className="infection-badge">{badge}</sup>
      ) : null}
    </button>
  );
}
