import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulationGame, roomAt } from '../lib/game-engine.mjs';
import {
  addMapLink,
  relocateMapRoom,
  setCollapseLanding,
} from '../lib/engine/map-transactions.mjs';

test('map transactions reject invalid topology and commit valid changes atomically', () => {
  const game = createSimulationGame('mirror', 601, 3),
    foyer = roomAt(game, 'foyer');
  game.rooms.push({
    id: 'moving',
    name: '移动房间',
    floor: 0,
    x: 1,
    y: 0,
    rotation: 0,
    doors: [0, 1, 2, 3],
  });
  const before = structuredClone(roomAt(game, 'moving'));
  assert.equal(
    relocateMapRoom(game, 'moving', {
      floor: 0,
      x: foyer.x,
      y: foyer.y,
      rotation: 0,
      fromRoomId: 'foyer',
      direction: 1,
    }),
    false,
  );
  assert.deepEqual(roomAt(game, 'moving'), before);
  const moved = relocateMapRoom(game, 'moving', {
    floor: 0,
    x: 1,
    y: -1,
    rotation: 0,
    fromRoomId: 'stairs',
    direction: 1,
  });
  assert.equal(moved.roomId, 'moving');
  assert.deepEqual(moved.before, {
    floor: 0,
    x: 1,
    y: 0,
    rotation: 0,
  });
  assert.equal(roomAt(game, 'moving').y, -1);

  assert(addMapLink(game, 'foyer', 'basement'));
  assert.equal(addMapLink(game, 'basement', 'foyer'), false);
  assert(setCollapseLanding(game, 'foyer', 'basement'));
  assert.equal(roomAt(game, 'foyer').collapseLanding, 'basement');
  assert.equal(setCollapseLanding(game, 'foyer', 'upper'), false);
});
