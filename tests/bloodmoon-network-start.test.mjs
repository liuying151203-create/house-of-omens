import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRoomState,
  joinRoomState,
  updateRoomState,
  readRoomState,
  restoreRoomState,
} from '../lib/network/room-domain.mjs';
import {
  decomposeRoomState,
  composeRoomState,
} from '../lib/network/room-persistence.mjs';
import { drawCard, pending, commandHeroId } from '../lib/game-engine.mjs';
import { automaticRequestCommand } from '../lib/automatic-driver.mjs';
import { rollOwner } from '../lib/roll-ownership.mjs';
import { resolveGameSet } from '../lib/game-sets.mjs';

const identity = { id: 'host', key: 'test-host' };
const guest = { id: 'guest', key: 'test-guest' };
const roomFor = (count = 3, data = {}) => {
  const { room } = createRoomState(
    { scenario: 'bloodmoon', count, ...data },
    { code: 'ABC123', identity },
  );
  joinRoomState(room, {}, { identity: guest });
  return room;
};
const command = (room, key, action) =>
  updateRoomState(room, key, {
    type: 'action',
    revision: room.revision,
    action,
  });
function drive(room) {
  for (let step = 0; pending(room.game) && step < 100; step++) {
    const request = pending(room.game);
    if (
      request.kind === 'diceRequest' &&
      request.rolls.some((group) => !group.dice)
    ) {
      for (const side of request.rolls.filter((group) => !group.dice)) {
        const key =
          rollOwner(room, side) === guest.id ? guest.key : identity.key;
        command(room, key, {
          type: 'rollAll',
          requestId: request.uid,
          sideIds: [side.id],
        });
      }
    } else {
      const action = automaticRequestCommand(room.game);
      const heroId = commandHeroId(room.game, action);
      command(
        room,
        room.seats[heroId] === guest.id ? guest.key : identity.key,
        action,
      );
    }
  }
  assert.equal(pending(room.game), null);
}

test('formal room creation resolves the host preset, exposes the agreed scenario and rejects incomplete pools', () => {
  const room = roomFor(3, { scenario: 'mystery', gameSet: 'bloodmoon' });
  assert.equal(room.scenario, 'bloodmoon');
  assert.equal(readRoomState(room, guest.key).scenario, 'bloodmoon');
  assert.deepEqual(
    readRoomState(room, guest.key).gameSet,
    resolveGameSet('bloodmoon'),
  );
  assert.throws(
    () => roomFor(3, { gameSet: 'classic' }),
    (error) => error.status === 400 && /必要卡牌/.test(error.message),
  );
  assert.throws(
    () => roomFor(3, { scenario: 'unknown' }),
    (error) => error.status === 400,
  );
  assert.throws(
    () =>
      updateRoomState(room, guest.key, {
        type: 'start',
        revision: room.revision,
      }),
    (error) => error.status === 403,
  );
});

test('ordinary LAN starts use real bloodmoon exploration, preserve ownership through bite and remote persistence', () => {
  for (const count of [3, 4, 5, 6]) {
    let room = roomFor(count);
    updateRoomState(room, identity.key, {
      type: 'start',
      revision: room.revision,
    });
    assert.equal(room.game.phase, 'explore');
    assert.equal(room.game.playtest, undefined);
    assert.equal(room.game.gameSet.id, 'bloodmoon');
    assert(
      readRoomState(room, guest.key).game.decks.omen.every((id) => id === null),
    );
    drive(room);
    for (const [id, heroId] of [
      ['bell', 0],
      ['book', 2],
    ]) {
      room.game.decks.omen = [
        id,
        ...room.game.decks.omen.filter((entry) => entry !== id),
      ];
      drawCard(room.game, 'omen', room.game.heroes[heroId]);
      drive(room);
    }
    assert.deepEqual(room.game.decks.omen, ['bite-mark']);
    drawCard(room.game, 'omen', room.game.heroes[1]);
    const card = pending(room.game);
    assert.throws(
      () =>
        command(room, identity.key, {
          type: 'continueCard',
          requestId: card.uid,
        }),
      (error) => error.status === 403,
    );
    command(room, guest.key, { type: 'continueCard', requestId: card.uid });
    assert.equal(pending(room.game).kind, 'diceRequest');
    const before = structuredClone(room.game);
    room = restoreRoomState(composeRoomState(decomposeRoomState(room)));
    assert.deepEqual(room.game, before);
    const request = pending(room.game);
    assert.equal(rollOwner(room, request.rolls[0]), identity.id);
    assert.equal(rollOwner(room, request.rolls[1]), guest.id);
    assert.throws(
      () =>
        command(room, identity.key, {
          type: 'rollAll',
          requestId: request.uid,
          sideIds: [request.rolls[1].id],
        }),
      (error) => error.status === 403,
    );
    drive(room);
    assert.equal(room.game.phase, 'haunt');
    assert.equal(room.game.bloodmoonCombat.alphaId, 1);
    assert.equal(room.seats[1], guest.id);
    assert.equal(room.game.heroes[1].faction, 'wolves');
    assert.equal(room.game.heroes[1].traitor, false);
    assert.deepEqual(room.game.enemies, []);
    const snapshot = readRoomState(room, identity.key);
    assert.equal(snapshot.game.heroes[1].stats, null);
    assert.equal(
      readRoomState(room, guest.key).game.heroes[1].combatRole,
      'alpha',
    );
    assert.deepEqual(restoreRoomState(JSON.parse(JSON.stringify(room))), room);
  }
});

test('formal bloodmoon LAN playtests honor each supported preset and keep guest start forbidden', () => {
  const room = roomFor();
  updateRoomState(room, identity.key, {
    type: 'start',
    revision: room.revision,
    hauntPlaytest: true,
    playtestFocus: 'bloodmoon-entry',
  });
  assert.equal(room.game.playtest.focus, 'bloodmoon-entry');
  assert.equal(room.game.phase, 'explore');
  assert.equal(pending(room.game).cardId, 'bite-mark');
  assert.throws(
    () =>
      updateRoomState(room, identity.key, {
        type: 'start',
        revision: room.revision,
      }),
    (error) => error.status === 409,
  );
});
