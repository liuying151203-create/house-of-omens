import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceWorkflow,
  createWorkflow,
  supplyChoice,
  supplyRolls,
} from '../lib/engine/workflow.mjs';
import {
  act,
  createGame,
  createInteractiveGame,
  drawCard,
  pending,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

test('the default game factory enters the resumable Workflow path', () => {
  let game = createGame('mirror', 41, 3);
  game.queue = [];
  game.decks.event = ['cipher'];
  drawCard(game, 'event', game.heroes[0]);
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });

  assert.equal(game.executionMode, 'workflow');
  assert.equal(pending(game).kind, 'diceRequest');
  assert.equal(pending(game).workflow.definitionId, 'event.check');
});

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

test('workflow effects can suspend for a nested request and resume at the next step', () => {
  const definitions = {
      'test.suspend': {
        version: 1,
        steps: [
          { op: 'effect', handler: 'pause' },
          { op: 'effect', handler: 'record' },
          { op: 'complete' },
        ],
      },
    },
    flow = createWorkflow({
      flowId: 'flow-suspend',
      definitionId: 'test.suspend',
    }),
    seen = [],
    handlers = {
      pause: () => ({ suspend: true }),
      record: () => seen.push('resumed'),
    };

  assert.equal(
    advanceWorkflow(flow, { definitions, handlers }).status,
    'suspended',
  );
  assert.equal(flow.step, 1);
  assert.deepEqual(seen, []);
  const restored = JSON.parse(JSON.stringify(flow));
  assert.equal(
    advanceWorkflow(restored, { definitions, handlers }).status,
    'complete',
  );
  assert.deepEqual(seen, ['resumed']);
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

test('workflow value branches and handler jumps support serializable loops', () => {
  const definitions = {
      'test.loop': {
        version: 1,
        steps: [
          { op: 'branchValue', path: 'done', truthy: 3, falsy: 1 },
          { op: 'effect', handler: 'increment' },
          { op: 'effect', handler: 'loop' },
          { op: 'complete' },
        ],
      },
    },
    flow = createWorkflow({
      flowId: 'flow-loop',
      definitionId: 'test.loop',
      locals: { count: 0, done: false },
    });
  const result = advanceWorkflow(flow, {
    definitions,
    handlers: {
      increment: (_params, active) => {
        active.locals.count++;
        active.locals.done = active.locals.count === 3;
      },
      loop: () => ({ nextStep: 0 }),
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(flow.locals.count, 3);
});

test('choice requests validate options, survive restore and branch by value', () => {
  const definitions = {
      'test.choice': {
        version: 1,
        steps: [
          { op: 'requestChoice', key: 'reaction', requestKey: 'choiceRequest' },
          {
            op: 'branchChoice',
            key: 'reaction',
            cases: { counter: 2, pass: 4 },
          },
          {
            op: 'effect',
            handler: 'record',
            params: { value: 'counter' },
          },
          { op: 'complete' },
          {
            op: 'effect',
            handler: 'record',
            params: { value: 'pass' },
          },
          { op: 'complete' },
        ],
      },
    },
    flow = createWorkflow({
      flowId: 'flow-choice',
      definitionId: 'test.choice',
      locals: {
        choiceRequest: {
          kind: 'choiceRequest',
          title: '受伤后反应',
          options: [
            { value: 'counter', label: '消耗荆棘反击' },
            { value: 'pass', label: '跳过' },
          ],
        },
      },
    });
  assert.equal(advanceWorkflow(flow, { definitions }).status, 'waiting');
  assert.throws(
    () => supplyChoice(flow, 'missing', definitions),
    /Choice does not match/,
  );
  const restored = JSON.parse(JSON.stringify(flow));
  supplyChoice(restored, 'counter', definitions);
  const seen = [];
  assert.equal(
    advanceWorkflow(restored, {
      definitions,
      handlers: { record: ({ value }) => seen.push(value) },
    }).status,
    'complete',
  );
  assert.deepEqual(seen, ['counter']);
  assert.equal(restored.locals.choices.reaction, 'counter');
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

test('haunt and fall dice use restorable workflows without replay actions', () => {
  let haunt = createInteractiveGame('mirror', 93, 3);
  haunt.queue = [
    {
      uid: 90,
      kind: 'hauntRoll',
      heroId: haunt.active,
      title: '作祟检定',
    },
  ];
  haunt.omens = 3;
  haunt = act(haunt, { type: 'advance' });
  assert.equal(pending(haunt).workflow.definitionId, 'turn.hauntRoll');
  assert.equal(pending(haunt).resumeAction, undefined);
  haunt = act(haunt, { type: 'rollAll' });
  haunt = act(JSON.parse(JSON.stringify(haunt)), {
    type: 'resolveDice',
    requestId: pending(haunt).uid,
  });
  assert.equal(pending(haunt).kind, 'hauntResult');

  let fall = createInteractiveGame('mirror', 94, 3);
  fall.queue = [
    {
      uid: 91,
      kind: 'roomFall',
      heroId: fall.active,
      title: '坠落冲击',
      text: '掷骰决定伤害。',
      roomId: 'basement',
      discovered: true,
    },
  ];
  fall = act(fall, { type: 'advance' });
  assert.equal(pending(fall).workflow.definitionId, 'room.fallDamage');
  assert.equal(pending(fall).resumeQueue, undefined);
  fall = act(fall, { type: 'rollAll' });
  fall = act(JSON.parse(JSON.stringify(fall)), {
    type: 'resolveDice',
    requestId: pending(fall).uid,
  });
  assert.equal(pending(fall).kind, 'check');
});

test('enemy phase advances one enemy workflow at a time and survives restore', () => {
  let game = createHauntPlaytest('werewolf', 97, 3);
  game.queue = [];
  game.executionMode = 'workflow';
  game.heroes
    .filter((hero) => !hero.traitor)
    .forEach((hero) => {
      hero.pos = 'entrance';
    });
  game.enemies[0].pos = 'entrance';
  game.enemies.push({
    id: 'test-wolf',
    name: '测试狼人',
    kind: 'wolf',
    pos: 'entrance',
    hp: 3,
    maxHp: 3,
    might: 3,
    speed: 1,
  });
  const before = structuredClone(game.enemies);
  game = act(game, { type: 'endRound' });
  let request = pending(game);
  assert.equal(request.workflow.definitionId, 'turn.enemyPhase');
  assert.equal(request.resumeAction, undefined);
  assert.equal(request.resumeQueue, undefined);
  assert.deepEqual(game.enemies, before);
  request.rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index % 2 === 0 ? 2 : 0);
  });
  game = JSON.parse(JSON.stringify(game));
  assert.equal(game._rollCapture, undefined);
  assert.equal(game._rollReplay, undefined);
  game = act(game, { type: 'resolveDice', requestId: request.uid });
  request = pending(game);
  assert.equal(request.kind, 'diceRequest');
  assert.equal(request.workflow.definitionId, 'turn.enemyPhase');
  assert.equal(request.workflow.locals.enemyTurn.enemyIndex, 1);
  assert(game.queue.some((entry) => entry.kind === 'damage'));
});
