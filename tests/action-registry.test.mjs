import test from 'node:test';
import assert from 'node:assert/strict';
import { collectActions, executeAction } from '../lib/engine/actions.mjs';
import {
  actions,
  act,
  createSimulationGame,
  factionActions,
  supportsCommand,
  commandHeroId,
  updateRoomRule,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';

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
  const targeted = [
    {
      id: 'targeted:2',
      command: { type: 'targeted', targetId: 2 },
      handler: 'test.run',
    },
  ];
  assert(
    executeAction(state, { type: 'targeted', targetId: 2 }, targeted, {
      'test.run': (target) => target.value++,
    }),
  );
  assert.equal(state.value, 2);
  assert.equal(
    executeAction(state, { type: 'targeted', targetId: 1 }, targeted, {
      'test.run': () => {},
    }),
    false,
  );
  assert.equal(
    executeAction(state, { type: 'missing' }, available, {}, {}),
    false,
  );
});

test('special room actions come from the action registry and keep old aliases', () => {
  const game = createSimulationGame('mirror', 31, 3),
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

test('effective room targets provide their action and handler without a main-loop branch', () => {
  let game = createSimulationGame('mirror', 73, 3);
  game.queue = [];
  game.phase = 'haunt';
  game.executionMode = 'workflow';
  const roomId = game.heroes[game.active].pos;
  game = updateRoomRule(game, {
    id: 'test-seal-target',
    sourceId: 'test-scenario',
    roomId,
    patch: { target: 'seal' },
  });
  const ability = actions(game).abilities.find(
    (entry) => entry.handler === 'scenario.bells.seal',
  );
  assert.deepEqual(ability.command, { type: 'interact' });
  assert.deepEqual(ability.checkSpec, {
    trait: 'knowledge',
    checkKind: 'ritual',
    includeAll: true,
    threshold: 3,
    bonus: 0,
  });
  let next = act(game, ability.command);
  assert.equal(next.queue[0].workflow.definitionId, 'action.check');
  assert.equal(next.queue[0].resumeAction, undefined);
  next.queue[0].rolls[0].dice = Array(next.queue[0].rolls[0].count).fill(2);
  next = act(JSON.parse(JSON.stringify(next)), {
    type: 'resolveDice',
    requestId: next.queue[0].uid,
  });
  assert.equal(next.heroes[next.active].interacted, true);
  assert.equal(next.rooms.find((room) => room.id === roomId).attempts, 1);
});

test('checked actions expose one serializable checkSpec for previews and resolution', () => {
  const game = createHauntPlaytest('werewolf', 76, 3, 'treatment');
  game.queue = [];
  const cure = actions(game).abilities.find(
    (action) => action.handler === 'scenario.werewolf.cure',
  );
  assert(cure);
  assert.equal('check' in cure, false);
  assert.deepEqual(cure.checkSpec, {
    trait: 'knowledge',
    checkKind: 'cure',
    applyModifiers: false,
    bonus: cure.bonus,
    threshold: 3,
  });
  assert.doesNotThrow(() => JSON.stringify(cure));
});

test('rest actions share effective trait descriptions and registry execution', () => {
  const game = createSimulationGame('mirror', 74, 3),
    hero = game.heroes[0];
  game.queue = [];
  hero.stats.might--;
  const rest = actions(game).abilities.find(
    (entry) => entry.handler === 'hero.rest' && entry.trait === 'might',
  );
  assert(rest);
  assert.deepEqual(rest.command, { type: 'rest', trait: 'might' });
  assert.match(rest.label, /力量 \+1/);
  const next = act(game, rest.command);
  assert.equal(next.heroes[0].stats.might, hero.stats.might + 1);
  assert.equal(next.heroes[0].moves, 0);
  assert.equal(next.heroes[0].stopped, true);
  assert.equal(
    actions(next).abilities.some((entry) => entry.handler === 'hero.rest'),
    false,
  );
});

test('wolf hunt orders are faction actions with registered targets and handlers', () => {
  const game = createHauntPlaytest('werewolf', 75, 3);
  game.queue = [];
  const wolf = game.enemies.find((enemy) => enemy.heroId !== undefined),
    orders = factionActions(game, wolf.heroId);
  assert(orders.length > 0);
  assert(orders.every((order) => order.handler === 'scenario.werewolf.order'));
  const order = orders.at(-1),
    next = act(game, order.command),
    updated = next.enemies.find((enemy) => enemy.id === wolf.id);
  assert.equal(updated.huntTarget, order.targetId);
  assert.equal(next.logs[0].visibility.faction, 'wolves');
  assert.equal(supportsCommand(game, order.command), true);
  assert.equal(commandHeroId(game, order.command), wolf.heroId);
  assert.equal(
    supportsCommand(game, {
      type: 'wolfOrder',
      heroId: wolf.heroId,
      targetId: 99,
    }),
    false,
  );
});
