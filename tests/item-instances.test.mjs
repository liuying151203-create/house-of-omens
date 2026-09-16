import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createSimulationGame, validSave } from '../lib/game-engine.mjs';
import {
  addItemInstance,
  dropItemInstance,
  itemInstanceCharges,
  itemInstances,
  itemInstanceUsed,
  markItemInstanceUsed,
  materializeItemInstances,
  pickupItemInstance,
  removeItemInstance,
  spendItemCharge,
  transferItemInstance,
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

test('item instances retain usage, state and identity across owners and rooms', () => {
  const from = { id: 0, items: [], itemInstances: [] },
    to = { id: 1, items: [], itemInstances: [] },
    room = { id: 'room', droppedItems: [] },
    instance = addItemInstance(from, 'tools', 'item-stateful');
  instance.state.charges = 3;
  markItemInstanceUsed(from, instance);
  assert(transferItemInstance(from, to, instance.instanceId));
  assert.equal(itemInstanceCharges(itemInstances(to)[0]), 3);
  assert(itemInstanceUsed(to, itemInstances(to)[0]));
  assert.equal(spendItemCharge(to, instance.instanceId, 1), 2);
  assert(dropItemInstance(to, room, instance.instanceId));
  assert.equal(room.droppedItems[0].state.charges, 2);
  assert(pickupItemInstance(from, room, instance.instanceId));
  assert.equal(itemInstances(from)[0].instanceId, instance.instanceId);
  assert(itemInstanceUsed(from, itemInstances(from)[0]));
  assert.equal(room.droppedItems.length, 0);
});

test('registered inventory actions transfer, drop and recover exact instances', () => {
  let game = act(createSimulationGame('bells', 122, 3), { type: 'advance' });
  const owner = game.heroes[0],
    teammate = game.heroes[1];
  addItemInstance(owner, 'tools', 'item-shared');
  game = act(game, {
    type: 'transferItem',
    instanceId: 'item-shared',
    targetHeroId: teammate.id,
  });
  assert.equal(itemInstances(game.heroes[owner.id]).length, 0);
  assert.equal(
    itemInstances(game.heroes[teammate.id])[0].instanceId,
    'item-shared',
  );
  game = act(game, { type: 'advance' });
  game = act(game, { type: 'select', id: teammate.id });
  game = act(game, { type: 'dropItem', instanceId: 'item-shared' });
  assert.equal(itemInstances(game.heroes[teammate.id]).length, 0);
  assert.equal(
    game.rooms.find((room) => room.id === teammate.pos).droppedItems[0]
      .instanceId,
    'item-shared',
  );
  game = act(game, { type: 'advance' });
  game = act(game, { type: 'pickupItem', instanceId: 'item-shared' });
  assert.equal(
    itemInstances(game.heroes[game.active])[0].instanceId,
    'item-shared',
  );
});

test('two copies of a consumable can be used independently in one turn', () => {
  let game = act(createSimulationGame('bells', 121, 3), { type: 'advance' });
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
