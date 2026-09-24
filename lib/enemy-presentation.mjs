export function pendingEnemyMovements(game, afterEventId = 0) {
  const flowId = game?.queue?.[0]?.workflow?.flowId;
  if (!flowId) return [];
  return (game.events || []).filter(
    (event) =>
      event.type === 'MovementQueued' &&
      event.flowId === flowId &&
      event.id > afterEventId,
  );
}
