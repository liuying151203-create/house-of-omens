import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, createGame, pending } from '../lib/game-engine.mjs';
import { blockingRequest } from '../lib/presentation-requests.mjs';

test('已结束流程的只读数值播报不阻止移动', () => {
  const game = act(createGame('mirror', 81, 3), { type: 'advance' });
  game.queue = [
    {
      uid: ++game.serial,
      kind: 'trait',
      title: '属性变化',
      text: '已结算',
      workflow: { flowId: 'done', definitionId: 'test', definitionVersion: 1 },
    },
  ];
  const destination = actions(game).move[0];
  assert(destination);
  assert.equal(blockingRequest(game), null);
  const result = act(game, { type: 'move', pos: destination });
  assert.equal(result.heroes[0].pos, destination);
  assert.notEqual(pending(result)?.title, '属性变化');
});

test('有后续操作或带执行状态的流程仍然阻塞', () => {
  const game = act(createGame('mirror', 81, 3), { type: 'advance' });
  const notice = {
    uid: ++game.serial,
    kind: 'trait',
    workflow: {
      flowId: 'pending',
      definitionId: 'test',
      definitionVersion: 1,
      step: 2,
    },
  };
  game.queue = [notice];
  assert.equal(blockingRequest(game), notice);
  game.queue = [
    {
      ...notice,
      workflow: { flowId: 'done', definitionId: 'test', definitionVersion: 1 },
    },
    { uid: ++game.serial, kind: 'damage' },
  ];
  assert.notEqual(blockingRequest(game), null);
});
