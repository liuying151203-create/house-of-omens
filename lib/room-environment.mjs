export function windowsOf(room) {
  return (room.windows || []).map(
    (direction) => (direction + (room.rotation || 0)) % 4,
  );
}

export function exposedWindows(game, room) {
  if (room.floor < 0) return [];
  const offsets = [
    [0, -1],
    [1, 0],
    [0, 1],
    [-1, 0],
  ];
  return windowsOf(room).filter(
    (direction) =>
      !game.rooms.some(
        (neighbor) =>
          neighbor.floor === room.floor &&
          neighbor.x === room.x + offsets[direction][0] &&
          neighbor.y === room.y + offsets[direction][1],
      ),
  );
}

export function moonlit(game, room) {
  return (
    !!room &&
    game.scenario === 'werewolf' &&
    game.phase !== 'explore' &&
    !room.states?.boarded &&
    exposedWindows(game, room).length > 0
  );
}
