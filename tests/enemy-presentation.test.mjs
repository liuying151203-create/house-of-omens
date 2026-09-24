import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingEnemyMovements } from '../lib/enemy-presentation.mjs';

test('the same enemy route is presented only once across attack and report requests', () => {
  const game = {
    queue: [{ kind: 'diceRequest', workflow: { flowId: 'enemy:7' } }],
    events: [
      { id: 3, type: 'MovementQueued', flowId: 'enemy:7', path: ['a', 'b'] },
      { id: 4, type: 'MovementQueued', flowId: 'enemy:other', path: ['c'] },
    ],
  };
  assert.deepEqual(
    pendingEnemyMovements(game).map((event) => event.id),
    [3],
  );
  game.queue[0] = { kind: 'enemyTurn', workflow: { flowId: 'enemy:7' } };
  assert.deepEqual(pendingEnemyMovements(game, 3), []);
});
