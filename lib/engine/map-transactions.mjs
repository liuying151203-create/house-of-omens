const DIRECTIONS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

const doorsOf = (room, rotation = room.rotation || 0) =>
  room.doors.map((door) => (door + rotation) % 4);

export function addMapLink(game, fromRoomId, toRoomId) {
  if (
    !fromRoomId ||
    !toRoomId ||
    fromRoomId === toRoomId ||
    !game.rooms.some((room) => room.id === fromRoomId) ||
    !game.rooms.some((room) => room.id === toRoomId)
  )
    return false;
  game.links ||= [];
  if (
    game.links.some(
      ([from, to]) =>
        (from === fromRoomId && to === toRoomId) ||
        (from === toRoomId && to === fromRoomId),
    )
  )
    return false;
  game.links.push([fromRoomId, toRoomId]);
  return { fromRoomId, toRoomId };
}

export function relocateMapRoom(game, roomId, destination) {
  const room = game.rooms.find((entry) => entry.id === roomId),
    anchor = game.rooms.find((entry) => entry.id === destination.fromRoomId),
    direction = DIRECTIONS[destination.direction];
  if (!room || !anchor || !direction || anchor.floor !== destination.floor)
    return false;
  if (
    anchor.x + direction.dx !== destination.x ||
    anchor.y + direction.dy !== destination.y ||
    game.rooms.some(
      (entry) =>
        entry.id !== roomId &&
        entry.floor === destination.floor &&
        entry.x === destination.x &&
        entry.y === destination.y,
    ) ||
    !doorsOf(anchor).includes(destination.direction) ||
    !doorsOf(room, destination.rotation).includes(
      (destination.direction + 2) % 4,
    )
  )
    return false;
  const before = {
    floor: room.floor,
    x: room.x,
    y: room.y,
    rotation: room.rotation || 0,
  };
  Object.assign(room, {
    floor: destination.floor,
    x: destination.x,
    y: destination.y,
    rotation: destination.rotation,
  });
  return {
    roomId,
    before,
    after: {
      floor: room.floor,
      x: room.x,
      y: room.y,
      rotation: room.rotation,
    },
    fromRoomId: anchor.id,
  };
}

export function setCollapseLanding(game, sourceRoomId, landingRoomId) {
  const source = game.rooms.find((room) => room.id === sourceRoomId),
    landing = game.rooms.find((room) => room.id === landingRoomId);
  if (!source || !landing || source.id === landing.id || landing.floor !== -1)
    return false;
  const before = source.collapseLanding || null;
  source.collapseLanding = landing.id;
  return { sourceRoomId, landingRoomId, before };
}
