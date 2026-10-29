import test from 'node:test';
import assert from 'node:assert/strict';
import { echoSpoolPath } from '../lib/game-engine.mjs';

test('回声线轴按双向接通的门和已有跨层连接计算最短路径', () => {
  const game = {
    rooms: [
      { id: 'a', floor: 'ground', x: 0, y: 0, doors: [1] },
      { id: 'b', floor: 'ground', x: 1, y: 0, doors: [1, 3] },
      { id: 'c', floor: 'ground', x: 2, y: 0, doors: [3] },
      { id: 'upper', floor: 'upper', x: 0, y: 0, doors: [] },
    ],
    links: [['c', 'upper']],
  };
  assert.deepEqual(echoSpoolPath(game, 'a', 'upper'), ['a', 'b', 'c', 'upper']);
  assert.deepEqual(echoSpoolPath(game, 'upper', 'a'), ['upper', 'c', 'b', 'a']);
  game.rooms[1].doors = [1];
  assert.deepEqual(echoSpoolPath(game, 'a', 'upper'), []);
  assert.deepEqual(echoSpoolPath(game, 'missing', 'missing'), []);
});

test('已建立的坍塌通路只向下，且当前通行限制可阻断路径', () => {
  const game = {
    rooms: [
      {
        id: 'upper',
        floor: 'upper',
        x: 0,
        y: 0,
        doors: [],
        collapseLanding: 'lower',
      },
      { id: 'lower', floor: 'basement', x: 0, y: 0, doors: [] },
    ],
    links: [],
  };
  assert.deepEqual(echoSpoolPath(game, 'upper', 'lower'), ['upper', 'lower']);
  assert.deepEqual(echoSpoolPath(game, 'lower', 'upper'), []);
  assert.deepEqual(
    echoSpoolPath(game, 'upper', 'lower', () => false),
    [],
  );
  game.rooms.pop();
  assert.deepEqual(echoSpoolPath(game, 'upper', 'lower'), []);
});
