import { actions } from './game-engine.mjs';

export function explorationScope(game) {
  return `${game.serial}:${game.round}:${game.active}:${game.heroes[game.active].pos}:${game.viewFloor}`;
}

export function selectExploration(game, preview, frontier) {
  if (
    !frontier ||
    frontier.floor !== game.viewFloor ||
    !actions(game).explore.some((f) =>
      ['from', 'floor', 'x', 'y', 'dir'].every(
        (key) => f[key] === frontier[key],
      ),
    )
  )
    return { preview: null, action: null };
  const next = {
    scope: explorationScope(game),
    x: frontier.x,
    y: frontier.y,
    dir: frontier.dir,
    floor: frontier.floor,
    from: frontier.from,
  };
  const confirmed =
    preview?.scope === next.scope &&
    preview.x === next.x &&
    preview.y === next.y &&
    preview.dir === next.dir &&
    preview.floor === next.floor &&
    preview.from === next.from;
  return confirmed
    ? {
        preview: null,
        action: {
          type: 'explore',
          dir: frontier.dir,
          floor: frontier.floor,
          from: frontier.from,
          x: frontier.x,
          y: frontier.y,
        },
      }
    : { preview: next, action: null };
}
