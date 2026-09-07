export function rollOwner(room, side) {
  return side.heroId === undefined
    ? room.hostId
    : room.seats[side.heroId] || room.hostId;
}
