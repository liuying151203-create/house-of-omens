import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NETWORK_PROTOCOL_VERSION,
  ROOM_STATE_VERSION,
  createRoomState,
  joinRoomState,
  readRoomState,
  restoreRoomState,
  updateRoomState,
} from '../lib/network/room-domain.mjs';

const hostIdentity = {
  id: 'host-player',
  key: 'host-secret-key',
};
const guestIdentity = {
  id: 'guest-player',
  key: 'guest-secret-key',
};

function setup(now = () => 1000) {
  const created = createRoomState(
    { name: '房主', count: 3, scenario: 'mirror' },
    { code: 'ABC123', identity: hostIdentity, now },
  );
  const guest = joinRoomState(
    created.room,
    { name: '访客' },
    { identity: guestIdentity, now },
  );
  return { room: created.room, host: created.response, guest };
}

test('room domain state is JSON-persistable and restores a playable game', () => {
  const { room, host, guest } = setup();
  const started = updateRoomState(room, host.key, {
    type: 'start',
    revision: guest.revision,
    commandId: 'start-command-0001',
  });
  assert.equal(started.protocolVersion, NETWORK_PROTOCOL_VERSION);
  assert.equal(room.roomStateVersion, ROOM_STATE_VERSION);

  const restored = restoreRoomState(JSON.parse(JSON.stringify(room)));
  assert(restored);
  assert.deepEqual(readRoomState(restored, guest.key).game, started.game);

  const advanced = updateRoomState(restored, host.key, {
    type: 'action',
    action: { type: 'advance' },
    revision: started.revision,
    commandId: 'advance-command-01',
  });
  assert.equal(advanced.revision, started.revision + 1);
  assert.equal(advanced.game.version, started.game.version);
});

test('persisted command receipts remain compact and idempotent', () => {
  const { room, guest } = setup();
  const command = {
    type: 'seat',
    seat: 2,
    revision: guest.revision,
    commandId: 'seat-command-0001',
  };
  const first = updateRoomState(room, guest.key, command),
    retried = updateRoomState(room, guest.key, command);
  assert.equal(retried.revision, first.revision);
  assert.equal(room.commandReceipts.length, 1);
  assert.deepEqual(Object.keys(room.commandReceipts[0]).sort(), [
    'fingerprint',
    'key',
    'revision',
  ]);
  assert.doesNotMatch(JSON.stringify(room.commandReceipts), /"game"/);
  assert.throws(
    () =>
      updateRoomState(room, guest.key, {
        ...command,
        seat: 1,
      }),
    /不能用于不同动作/,
  );
});

test('unknown room state versions fail closed', () => {
  const { room } = setup();
  assert.equal(
    restoreRoomState({ ...room, roomStateVersion: ROOM_STATE_VERSION + 1 }),
    null,
  );
});
