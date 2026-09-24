const broadcastKinds = new Set([
  'roundStart',
  'turnStart',
  'trapResult',
  'cardResult',
  'combat',
  'check',
  'floor',
  'trait',
  'reveal',
  'itemUse',
  'notice',
  'death',
  'damageResult',
  'privateRequest',
]);

export const isBroadcastRequest = (request) =>
  !!request &&
  (broadcastKinds.has(request.kind) ||
    (request.kind === 'hauntResult' && !request.triggers));

export const broadcastDuration = (request) =>
  request.kind === 'turnStart'
    ? 1300
    : request.kind === 'roundStart'
      ? 1600
      : request.kind === 'trapResult'
        ? 2300
        : 2800;
