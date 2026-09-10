export function explorationScope(game) {
  return `${game.serial}:${game.round}:${game.active}:${game.heroes[game.active].pos}:${game.viewFloor}`;
}

export function selectExploration(game, preview, frontier) {
  const next = {
    scope: explorationScope(game),
    x: frontier.x,
    y: frontier.y,
    dir: frontier.dir,
  };
  const confirmed =
    preview?.scope === next.scope &&
    preview.x === next.x &&
    preview.y === next.y &&
    preview.dir === next.dir;
  return confirmed
    ? { preview: null, action: { type: 'explore', dir: frontier.dir } }
    : { preview: next, action: null };
}
