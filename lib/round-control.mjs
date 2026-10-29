export function canOfferRoundEnd(game, net) {
  if (!net.session)
    return game.heroes.filter((hero) => !hero.dead && !hero.traitor).length > 1;
  if (!net.room || net.room.you !== net.room.hostId) return false;
  return (
    game.enemies.filter(
      (enemy) =>
        enemy.heroId !== undefined &&
        (net.room.seats?.[enemy.heroId] || net.room.hostId) === net.room.you,
    ).length > 1
  );
}
