import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, validSave } from '../lib/game-engine.mjs';
import {
  addItemInstance,
  itemInstances,
  itemInstanceUsed,
  markItemInstanceUsed,
  materializeItemInstances,
  removeItemInstance,
} from '../lib/item-instances.mjs';

test('legacy item ids materialize as distinct persistent instances', () => {
  const hero = {
    id: 2,
    items: ['coffee', 'coffee', 'boots'],
    used: [],
  };
  const instances = materializeItemInstances(hero);
  assert.equal(new Set(instances.map((item) => item.instanceId)).size, 3);
  assert.deepEqual(
    instances.map((item) => item.definitionId),
    hero.items,
  );
  markItemInstanceUsed(hero, instances[0]);
  assert(itemInstanceUsed(hero, instances[0]));
  assert(!itemInstanceUsed(hero, instances[1]));
  assert(removeItemInstance(hero, instances[0].instanceId));
  assert.deepEqual(
    itemInstances(hero).map((item) => item.instanceId),
    [instances[1].instanceId, instances[2].instanceId],
  );
});

test('two copies of a consumable can be used independently in one turn', () => {
  let game = act(createGame('bells', 121, 3), { type: 'advance' });
  const hero = game.heroes[0],
    moves = hero.moves;
  addItemInstance(hero, 'coffee', 'item-test-a');
  addItemInstance(hero, 'coffee', 'item-test-b');

  game = act(game, {
    type: 'useItem',
    id: 'coffee',
    instanceId: 'item-test-a',
  });
  assert.equal(game.heroes[0].moves, moves + 2);
  assert.deepEqual(game.heroes[0].items, ['coffee']);
  game = JSON.parse(JSON.stringify(game));
  assert(validSave(game));
  game = act(game, { type: 'advance' });

  game = act(game, {
    type: 'useItem',
    id: 'coffee',
    instanceId: 'item-test-b',
  });
  assert.equal(game.heroes[0].moves, moves + 4);
  assert.deepEqual(game.heroes[0].items, []);
  assert.deepEqual(game.heroes[0].itemInstances, []);
});
