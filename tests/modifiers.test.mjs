import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveModifier } from '../lib/engine/modifiers.mjs';
import { cureBonus, modifierResult, modifierValue } from '../lib/modifiers.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { living, traitValue } from '../lib/game-engine.mjs';

test('modifier groups have explicit stacking and stable provenance', () => {
  const result = resolveModifier(3, [
    { id: 'a', value: 1, strategy: 'sum', stackGroup: 'sum', sourceId: 'a' },
    { id: 'b', value: 2, strategy: 'sum', stackGroup: 'sum', sourceId: 'b' },
    { id: 'c', value: 2, strategy: 'max', stackGroup: 'max', sourceId: 'c' },
    { id: 'd', value: 1, strategy: 'max', stackGroup: 'max', sourceId: 'd' },
    { id: 'e', value: 8, strategy: 'cap', stackGroup: 'cap', sourceId: 'e' },
  ]);
  assert.equal(result.value, 8);
  assert.deepEqual(
    result.contributions.map((entry) => entry.id),
    ['a', 'b', 'c', 'e'],
  );
});

test('card modifiers stack by category and report their sources', () => {
  const game = createHauntPlaytest('werewolf', 71, 3),
    hero = living(game)[0];
  hero.items = ['lucky', 'flashlight', 'flashlight', 'boots', 'boots'];
  const mental = modifierResult(
    game,
    'check.dice',
    { heroId: hero.id, checkKind: 'event', trait: 'sanity' },
    traitValue(hero, 'sanity'),
  );
  assert.equal(mental.delta, 2);
  assert.deepEqual(
    new Set(mental.contributions.map((entry) => entry.sourceLabel)),
    new Set(['幸运硬币', '手电筒']),
  );
  assert.equal(
    modifierValue(
      game,
      'check.dice',
      { heroId: hero.id, checkKind: 'event', trait: 'speed' },
      traitValue(hero, 'speed'),
    ),
    traitValue(hero, 'speed') + 1,
  );
  assert.equal(modifierValue(game, 'movement.initial', { heroId: hero.id }), 1);
});

test('scenario and room modifiers update without changing base definitions', () => {
  const game = createHauntPlaytest('werewolf', 73, 3),
    [healer, target] = living(game),
    enemy = game.enemies[0],
    room = game.rooms.find((entry) => entry.id === enemy.pos);
  room.windows = [0];
  healer.omens = ['locket'];
  target.omens = ['locket'];
  const healing = modifierResult(game, 'healing.cure.bonus', {
    healerId: healer.id,
    targetId: target.id,
  });
  assert.equal(cureBonus(game, healer, target), 2);
  assert.equal(healing.contributions.length, 1);
  assert.equal(healing.contributions[0].sourceLabel, '银色吊坠');
  assert.equal(
    modifierValue(game, 'enemy.might', { enemyId: enemy.id }, enemy.might),
    enemy.might + 1,
  );
  assert.equal(
    modifierValue(game, 'combat.damage.cap', { enemyId: enemy.id }, 3),
    2,
  );
  room.states = { boarded: true };
  assert.equal(
    modifierValue(game, 'enemy.might', { enemyId: enemy.id }, enemy.might),
    enemy.might,
  );
});

test('runtime modifiers can target a scenario, phase and hero', () => {
  const game = createHauntPlaytest('werewolf', 79, 3),
    hero = living(game)[0];
  game.ruleModifiers = [
    {
      id: 'scenario.fast-hero',
      query: 'movement.initial',
      heroId: hero.id,
      when: { phase: 'haunt', scenario: 'werewolf' },
      value: 2,
      strategy: 'sum',
      sourceLabel: '剧本加速',
    },
  ];
  const result = modifierResult(game, 'movement.initial', { heroId: hero.id });
  assert.equal(result.value, 2);
  assert.equal(result.contributions[0].sourceLabel, '剧本加速');
  game.phase = 'explore';
  assert.equal(modifierValue(game, 'movement.initial', { heroId: hero.id }), 0);
});
