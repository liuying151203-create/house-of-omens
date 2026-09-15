import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceWorkflow,
  createWorkflow,
  supplyRolls,
} from '../lib/engine/workflow.mjs';
import {
  act,
  createInteractiveGame,
  drawCard,
  pending,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

test('a serializable workflow pauses, restores and follows the actual roll branch', () => {
  const definitions = {
    'test.branch': {
      version: 1,
      steps: [
        { op: 'requestRoll', key: 'check', requestKey: 'diceRequest' },
        {
          op: 'branchRoll',
          key: 'check',
          threshold: 3,
          success: 2,
          failure: 4,
        },
        { op: 'effect', handler: 'record', params: { value: 'success' } },
        { op: 'complete' },
        { op: 'effect', handler: 'record', params: { value: 'failure' } },
        { op: 'complete' },
      ],
    },
  };
  const original = createWorkflow({
    flowId: 'flow-test',
    definitionId: 'test.branch',
    locals: {
      diceRequest: { kind: 'diceRequest', rolls: [{ count: 2 }] },
    },
  });
  assert.equal(advanceWorkflow(original, { definitions }).status, 'waiting');
  const restored = JSON.parse(JSON.stringify(original));
  supplyRolls(restored, [[2, 1]], definitions);
  const seen = [];
  assert.equal(
    advanceWorkflow(restored, {
      definitions,
      handlers: { record: ({ value }) => seen.push(value) },
    }).status,
    'complete',
  );
  assert.deepEqual(seen, ['success']);
  assert.equal(restored.locals.checkTotal, 3);
});

test('interactive event checks resume from saved workflow without probe replay', () => {
  let game = createInteractiveGame('mirror', 42, 3);
  game.queue = [];
  game.decks.event = ['cipher'];
  drawCard(game, 'event', game.heroes[0]);
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  const request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  assert.equal(request.workflow.definitionId, 'event.check');
  assert.equal(request.workflow.steps, undefined);
  assert.equal(request.resumeAction, undefined);
  assert.equal(request.resumeQueue, undefined);
  const restored = JSON.parse(JSON.stringify(game));
  const settled = act(restored, {
    type: 'resolveDice',
    requestId: request.uid,
  });
  assert.equal(pending(settled).kind, 'cardResult');
  assert.equal(pending(settled).workflow.definitionId, 'event.check');
  assert.equal(settled._rollCapture, undefined);
  assert.equal(settled._rollReplay, undefined);
});

test('a workflow can pause for a second roll after the first real result', () => {
  const definitions = {
    'test.chain': {
      version: 1,
      steps: [
        { op: 'requestRoll', key: 'first', requestKey: 'firstRequest' },
        { op: 'requestRoll', key: 'second', requestKey: 'secondRequest' },
        { op: 'effect', handler: 'record' },
        { op: 'complete' },
      ],
    },
  };
  const flow = createWorkflow({
    flowId: 'flow-chain',
    definitionId: 'test.chain',
    locals: {
      firstRequest: { kind: 'diceRequest', rolls: [{ count: 1 }] },
      secondRequest: { kind: 'diceRequest', rolls: [{ count: 2 }] },
    },
  });
  assert.equal(
    advanceWorkflow(flow, { definitions }).request.rolls[0].count,
    1,
  );
  supplyRolls(flow, [[2]], definitions);
  const second = advanceWorkflow(flow, { definitions });
  assert.equal(second.status, 'waiting');
  assert.equal(second.request.rolls[0].count, 2);
  const restored = JSON.parse(JSON.stringify(second.flow));
  supplyRolls(restored, [[1, 2]], definitions);
  let completed = false;
  assert.equal(
    advanceWorkflow(restored, {
      definitions,
      handlers: { record: () => (completed = true) },
    }).status,
    'complete',
  );
  assert(completed);
});

test('interactive opposed combat stores a workflow instead of a replay action', () => {
  let game = createHauntPlaytest('werewolf', 89, 3);
  game.queue = [];
  const enemy = game.enemies[0];
  game = act(game, { type: 'attack', id: enemy.id });
  const request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  assert.equal(request.rolls.length, 2);
  assert.equal(request.workflow.definitionId, 'combat.heroAttack');
  assert.equal(request.resumeAction, undefined);
  assert.equal(request.resumeQueue, undefined);
  const restored = JSON.parse(JSON.stringify(game));
  let settled = act(restored, { type: 'rollAll' });
  settled = act(settled, {
    type: 'resolveDice',
    requestId: request.uid,
  });
  assert.equal(pending(settled).kind, 'combat');
  assert.equal(pending(settled).workflow.definitionId, 'combat.heroAttack');
});
