import {
  ROOM_STATE_VERSION,
  ROOM_TTL_MS,
  restoreRoomState,
} from './room-domain.mjs';

export const REMOTE_ROOM_SCHEMA_VERSION = 2;

function splitReceiptKey(key) {
  const separator = key.indexOf(':');
  if (separator <= 0 || separator === key.length - 1) return null;
  return {
    playerId: key.slice(0, separator),
    commandId: key.slice(separator + 1),
  };
}

export function decomposeRoomState(room) {
  const stored = structuredClone(room),
    players = stored.players.map(({ id, name, key }) => ({
      playerId: id,
      name,
      tokenHash: key,
    })),
    receipts = stored.commandReceipts.flatMap((receipt) => {
      const identity = splitReceiptKey(receipt.key);
      return identity
        ? [
            {
              ...identity,
              fingerprint: receipt.fingerprint,
              revision: receipt.revision,
            },
          ]
        : [];
    }),
    deadlines = Object.entries(stored.requestDeadlines).map(
      ([requestId, deadlineAt]) => ({ requestId, deadlineAt }),
    );
  stored.players = [];
  stored.commandReceipts = [];
  stored.requestDeadlines = {};
  return {
    schemaVersion: REMOTE_ROOM_SCHEMA_VERSION,
    roomStateVersion: ROOM_STATE_VERSION,
    gameVersion: stored.game?.version ?? null,
    revision: stored.revision,
    updatedAt: stored.updated,
    expiresAt: stored.updated + ROOM_TTL_MS,
    stateJson: JSON.stringify(stored),
    players,
    receipts,
    deadlines,
  };
}

export function composeRoomState({
  stateJson,
  players = [],
  receipts = [],
  deadlines = [],
}) {
  try {
    const room = JSON.parse(stateJson);
    room.players = players.map(({ playerId, name, tokenHash }) => ({
      id: playerId,
      name,
      key: tokenHash,
    }));
    room.commandReceipts = receipts.map(
      ({ playerId, commandId, fingerprint, revision }) => ({
        key: `${playerId}:${commandId}`,
        fingerprint,
        revision,
      }),
    );
    room.requestDeadlines = Object.fromEntries(
      deadlines.map(({ requestId, deadlineAt }) => [requestId, deadlineAt]),
    );
    return restoreRoomState(room);
  } catch {
    return null;
  }
}
