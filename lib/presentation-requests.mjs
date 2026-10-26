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

const transitionKinds = new Set([
  'roundStart',
  'turnStart',
  'trapResult',
  'privateRequest',
]);

// 只放行已经结算完的播报。后面还有选择、伤害或流程续接时，必须保持顺序。
export const canActDuringBroadcast = (game) =>
  !game.roundEnding &&
  !!game.queue?.length &&
  game.queue.every(
    (request) =>
      isBroadcastRequest(request) &&
      !transitionKinds.has(request.kind) &&
      !request.workflow,
  );

export const blockingRequest = (game) =>
  canActDuringBroadcast(game) ? null : game.queue?.[0] || null;

export const broadcastDuration = (request) =>
  request.kind === 'turnStart'
    ? 1300
    : request.kind === 'roundStart'
      ? 1600
      : request.kind === 'trapResult'
        ? 2300
        : 2800;
