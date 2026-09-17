import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoomState,
  joinRoomState,
  updateRoomState,
} from '../lib/network/room-domain.mjs';
import {
  REMOTE_ROOM_SCHEMA_VERSION,
  composeRoomState,
  decomposeRoomState,
} from '../lib/network/room-persistence.mjs';
import { sha256Hex } from '../lib/network/remote-crypto.mjs';

async function persistedGame() {
  const hostToken = 'host-token-that-must-not-be-stored',
    guestToken = 'guest-token-that-must-not-be-stored',
    created = createRoomState(
      { name: '房主', count: 3, scenario: 'mirror' },
      {
        code: 'SQL123',
        identity: { id: 'host-id', key: hostToken },
        now: () => 1000,
      },
    );
  created.room.players[0].key = await sha256Hex(hostToken);
  const guest = joinRoomState(
    created.room,
    { name: '访客' },
    {
      identity: { id: 'guest-id', key: guestToken },
      now: () => 1001,
    },
  );
  created.room.players.at(-1).key = await sha256Hex(guestToken);
  updateRoomState(
    created.room,
    created.room.players[0].key,
    {
      type: 'start',
      revision: guest.revision,
      commandId: 'persist-start-0001',
    },
    { now: () => 1002 },
  );
  return { room: created.room, hostToken, guestToken };
}

test('SQLite records separate identities, receipts and deadlines from game state', async () => {
  const { room, hostToken, guestToken } = await persistedGame(),
    stored = decomposeRoomState(room);
  assert.equal(stored.schemaVersion, REMOTE_ROOM_SCHEMA_VERSION);
  assert.equal(JSON.parse(stored.stateJson).players.length, 0);
  assert(!stored.stateJson.includes(hostToken));
  assert(!stored.stateJson.includes(guestToken));
  assert(stored.players.every((player) => player.tokenHash.length === 64));
  assert.equal(stored.receipts.length, 1);

  const restored = composeRoomState(stored);
  assert(restored);
  assert.deepEqual(restored, room);
});

test('persisted older game snapshots migrate independently of room schema', async () => {
  const { room } = await persistedGame();
  room.game.version = 3;
  delete room.game.executionMode;
  const restored = composeRoomState(decomposeRoomState(room));
  assert(restored);
  assert.equal(restored.game.version, 4);
  assert.equal(restored.game.executionMode, 'workflow');
});
