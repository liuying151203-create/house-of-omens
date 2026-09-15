import test from 'node:test';
import assert from 'node:assert/strict';
import { collectActions, executeAction } from '../lib/engine/actions.mjs';
import { actions, act, createGame } from '../lib/game-engine.mjs';

test('registered actions expose serializable descriptions and dispatch by handler id', () => {
  const definitions = [
      {
        id: 'testAction',
        label: '测试行动',
        handler: 'test.run',
        available: ({ allowed }) => allowed,
      },
    ],
    available = collectActions(definitions, { allowed: true }),
    state = { value: 0 };
  assert.deepEqual(available, [
    { id: 'testAction', label: '测试行动', handler: 'test.run' },
  ]);
  assert(
    executeAction(state, { type: 'testAction' }, available, {
      'test.run': (target) => target.value++,
    }),
  );
  assert.equal(state.value, 1);
  assert.equal(
    executeAction(state, { type: 'missing' }, available, {}, {}),
    false,
  );
});

test('special room actions come from the action registry and keep old aliases', () => {
  const game = createGame('mirror', 31, 3),
    hero = game.heroes[0];
  game.queue = [];
  game.rooms.push({
    id: 'elevator',
    name: '神秘电梯',
    floor: 0,
    x: 2,
    y: 0,
    doors: [0, 1, 2, 3],
    floors: [-1, 0, 1],
    rotation: 0,
    special: 'elevator',
  });
  hero.pos = 'elevator';
  const legal = actions(game);
  assert(legal.elevator);
  assert.deepEqual(
    legal.abilities.map((action) => action.id),
    ['useElevator'],
  );
  const before = hero.moves;
  const next = act(game, { type: 'useElevator' });
  assert.equal(next.heroes[0].moves, before - 1);
});
