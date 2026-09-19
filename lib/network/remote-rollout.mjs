export function remoteRolloutStage(env) {
  const stage = env?.REMOTE_MULTIPLAYER_STAGE;
  return ['off', 'preview', 'on'].includes(stage) ? stage : 'preview';
}

export function canCreateRemoteRoom(env) {
  return remoteRolloutStage(env) !== 'off';
}

export function remoteRoomVisible(stage, optedIn = false) {
  return stage === 'on' || optedIn;
}
