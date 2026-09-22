import test from 'node:test';
import assert from 'node:assert/strict';
import { createScenarioRegistry } from '../lib/engine/scenarios.mjs';
import {
  scenarioRegistry,
  scenarioRules,
} from '../lib/content/scenarios/index.mjs';
import {
  act,
  createGame,
  createSimulationGame,
  SCENARIOS,
  triggerHaunt,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';

test('all playable scenarios have validated rules; invalid registrations fail early', () => {
  assert.deepEqual(
    [...scenarioRegistry.ids].sort((a, b) => a.localeCompare(b)),
    SCENARIOS.filter((entry) => entry.id !== 'mystery')
      .map((entry) => entry.id)
      .sort((a, b) => a.localeCompare(b)),
  );
  const definition = { id: 'test', setup() {}, timeoutReason: '时间耗尽' };
  assert.throws(
    () => createScenarioRegistry([definition, definition]),
    /Duplicate scenario: test/,
  );
  assert.throws(
    () => createScenarioRegistry([{ ...definition, setup: null }]),
    /setup handler/,
  );
  assert.throws(
    () => createScenarioRegistry([{ ...definition, timeoutReason: '' }]),
    /timeout reason/,
  );
  assert.throws(
    () => createScenarioRegistry([{ ...definition, victory: true }]),
    /test.victory/,
  );
  const registry = createScenarioRegistry([definition]);
  definition.timeoutReason = '外部修改';
  assert.equal(registry.get('test').timeoutReason, '时间耗尽');
  assert.throws(
    () => registry.get('unknown'),
    /Unknown scenario rules: unknown/,
  );
  assert.equal(registry.find('toString'), undefined);
});

test('scenario setup is idempotent and survives save restoration', () => {
  for (const id of scenarioRegistry.ids) {
    const game = createHauntPlaytest(id, 23, 3);
    const before = structuredClone(game);
    triggerHaunt(game);
    assert.deepEqual(game, before, `${id}: repeated setup must do nothing`);
    assert.deepEqual(restoreGameSave(JSON.parse(JSON.stringify(game))), game);
    assert.equal(
      game.queue.filter((entry) => entry.kind === 'haunt').length,
      1,
    );
  }
});

test('haunt selection preserves overlapping rule priorities and supports new definitions', () => {
  for (const [omen, tags, expected] of [
    ['locket', ['moon', 'memory', 'water'], 'werewolf'],
    ['locket', ['memory', 'water'], 'mirror'],
    ['bone', ['water'], 'flood'],
    ['bone', [], 'werewolf'],
    ['eye', ['water'], 'mirror'],
    ['key', [], 'flood'],
    [undefined, [], 'bells'],
  ])
    assert.equal(scenarioRegistry.select(omen, { tags }), expected);
  const base = { setup() {}, timeoutReason: '结束' };
  const registry = createScenarioRegistry([
    {
      ...base,
      id: 'fallback',
      hauntRules: [{ priority: 0, matches: () => true }],
    },
    {
      ...base,
      id: 'new-story',
      hauntRules: [{ priority: 5, matches: (omen) => omen === 'test' }],
    },
  ]);
  assert.equal(registry.select('test'), 'new-story');
  assert.equal(registry.select('other'), 'fallback');
  assert.throws(
    () =>
      createScenarioRegistry([
        { ...base, id: 'bad', hauntRules: [{ priority: 1 }] },
      ]),
    /Invalid haunt rule/,
  );
  assert.throws(
    () => createScenarioRegistry([{ ...base, id: 'manual' }]).select('test'),
    /No matching haunt rule/,
  );
});

test('workflow and simulation use the same scenario timeout and faction result', () => {
  for (const id of scenarioRegistry.ids) {
    const results = [];
    for (const create of [createGame, createSimulationGame]) {
      let game = create(id, 151, 3);
      game.queue = [];
      triggerHaunt(game);
      game = drivePendingRequests(game, act);
      game.elapsed = game.limit - 1;
      for (const enemy of game.enemies) {
        enemy.speed = 0;
        enemy.might = 0;
        enemy.pos = game.rooms.find(
          (room) => !game.heroes.some((hero) => hero.pos === room.id),
        ).id;
      }
      game = drivePendingRequests(act(game, { type: 'endRound' }), act);
      assert.equal(game.phase, 'over', id);
      assert.equal(game.result.won, false, id);
      assert.equal(game.result.reason, scenarioRules(id).timeoutReason);
      results.push(game.result);
    }
    assert.deepEqual(results[0], results[1], id);
    if (id === 'werewolf') assert.equal(results[0].winnerFaction, 'wolves');
  }
});

test('both execution modes spawn the same bell reinforcement once per enemy phase', () => {
  for (const create of [createGame, createSimulationGame]) {
    let game = create('bells', 151, 3);
    game.queue = [];
    triggerHaunt(game);
    game = drivePendingRequests(game, act);
    game.elapsed = 2;
    game.enemies = [];
    game = drivePendingRequests(act(game, { type: 'endRound' }), act);
    assert.deepEqual(
      game.enemies.map((enemy) => enemy.id),
      ['shade3'],
    );
    assert.equal(
      game.logs.filter((entry) => entry.text === '祭坛旁凝聚了一只钟声幽影。')
        .length,
      1,
    );
  }
});
