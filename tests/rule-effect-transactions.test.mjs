import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createSimulationGame,
  executeRuleEffects,
  roomAt,
} from '../lib/game-engine.mjs';
import { addItemInstance, itemInstances } from '../lib/item-instances.mjs';

test('rule effects move item instances through heroes and room containers', () => {
  const game = createSimulationGame('mirror', 701, 3),
    owner = game.heroes[0],
    receiver = game.heroes[1],
    room = roomAt(game, owner.pos),
    instance = addItemInstance(owner, 'coffee', 'item:test:coffee');

  let receipt = executeRuleEffects(game, [
    {
      op: 'item.transfer',
      params: {
        instanceId: instance.instanceId,
        fromHeroId: owner.id,
        toHeroId: receiver.id,
      },
    },
  ]);
  assert.equal(receipt.executed[0].result.toHeroId, receiver.id);
  assert.equal(itemInstances(owner).length, 0);
  assert.equal(itemInstances(receiver)[0].instanceId, instance.instanceId);

  receipt = executeRuleEffects(game, [
    {
      op: 'item.drop',
      params: {
        instanceId: instance.instanceId,
        heroId: receiver.id,
        roomId: room.id,
      },
    },
    {
      op: 'item.pickup',
      params: {
        instanceId: instance.instanceId,
        heroId: owner.id,
        roomId: room.id,
      },
    },
  ]);
  assert.deepEqual(
    receipt.executed.map((entry) => entry.op),
    ['item.drop', 'item.pickup'],
  );
  assert.equal(itemInstances(owner)[0].instanceId, instance.instanceId);
  assert.equal(room.droppedItems.length, 0);
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt);
});

test('rule effects expose validated map transactions to content definitions', () => {
  const game = createSimulationGame('mirror', 702, 3);
  game.rooms.push({
    id: 'moving',
    name: '移动房间',
    floor: 0,
    x: 1,
    y: 0,
    rotation: 0,
    doors: [0, 1, 2, 3],
  });

  const receipt = executeRuleEffects(game, [
    {
      op: 'map.relocateRoom',
      params: {
        roomId: 'moving',
        destination: {
          floor: 0,
          x: 1,
          y: -1,
          rotation: 0,
          fromRoomId: 'stairs',
          direction: 1,
        },
        moveKind: 'test',
      },
    },
    {
      op: 'map.addLink',
      params: { fromRoomId: 'foyer', toRoomId: 'basement' },
    },
    {
      op: 'map.setCollapseLanding',
      params: { sourceRoomId: 'foyer', landingRoomId: 'basement' },
    },
  ]);

  assert.deepEqual(
    receipt.executed.map((entry) => entry.op),
    ['map.relocateRoom', 'map.addLink', 'map.setCollapseLanding'],
  );
  assert.equal(roomAt(game, 'moving').y, -1);
  assert(
    game.links.some(([from, to]) => from === 'foyer' && to === 'basement'),
  );
  assert.equal(roomAt(game, 'foyer').collapseLanding, 'basement');
  assert.deepEqual(
    game.events.slice(-3).map((event) => event.type),
    ['RoomRelocated', 'MapLinkAdded', 'CollapseLandingSet'],
  );
});

test('invalid map effects leave topology untouched and omit receipts', () => {
  const game = createSimulationGame('mirror', 703, 3),
    before = structuredClone(game.rooms);
  const receipt = executeRuleEffects(game, [
    {
      op: 'map.relocateRoom',
      params: {
        roomId: 'foyer',
        destination: {
          floor: 0,
          x: 99,
          y: 99,
          rotation: 0,
          fromRoomId: 'stairs',
          direction: 1,
        },
      },
    },
  ]);
  assert.deepEqual(receipt, { executed: [] });
  assert.deepEqual(game.rooms, before);
});

test('rule effects move entities, draw cards and emit committed facts', () => {
  const game = createSimulationGame('mirror', 704, 3),
    hero = game.heroes[0],
    fromRoomId = hero.pos,
    destination = game.rooms.find((room) => room.id !== fromRoomId);
  game.queue = [];
  const expectedCardId = game.decks.item[0];

  const receipt = executeRuleEffects(game, [
    {
      op: 'entity.move',
      params: {
        entityType: 'hero',
        entityId: hero.id,
        toRoomId: destination.id,
        moveKind: 'teleport',
      },
    },
    {
      op: 'card.draw',
      params: { heroId: hero.id, cardType: 'item' },
    },
  ]);

  assert.equal(hero.pos, destination.id);
  assert.equal(receipt.executed[1].result.cardId, expectedCardId);
  assert.equal(game.queue[0].cardId, expectedCardId);
  assert.equal(game.events.at(-1).type, 'EntityMoved');
  assert.deepEqual(JSON.parse(JSON.stringify(receipt)), receipt);
});

test('status effects report both addition and removal to the event stream', () => {
  const game = createSimulationGame('mirror', 705, 3),
    hero = game.heroes[0];
  executeRuleEffects(game, [
    {
      op: 'status.add',
      params: { heroId: hero.id, status: { id: 'test-ward' } },
    },
  ]);
  const instanceId = hero.statuses.at(-1).instanceId;
  executeRuleEffects(game, [
    {
      op: 'status.remove',
      params: { heroId: hero.id, instanceId },
    },
  ]);
  assert.deepEqual(
    game.events.slice(-2).map((event) => event.type),
    ['StatusAdded', 'StatusRemoved'],
  );
});

test('atomic effect batches commit completely or refund all earlier changes', () => {
  const game = createSimulationGame('mirror', 706, 3),
    hero = game.heroes[0],
    before = structuredClone(game);
  let receipt = executeRuleEffects(game, [
    {
      op: 'effect.atomic',
      params: {
        effects: [
          {
            op: 'status.add',
            params: { heroId: hero.id, status: { id: 'temporary-cost' } },
          },
          {
            op: 'hero.changeMoves',
            params: { heroId: 99, delta: -1 },
          },
        ],
      },
    },
  ]);
  assert.deepEqual(game, before);
  assert.deepEqual(receipt.executed, []);

  receipt = executeRuleEffects(game, [
    {
      op: 'effect.atomic',
      params: {
        effects: [
          {
            op: 'status.add',
            params: { heroId: hero.id, status: { id: 'paid-cost' } },
          },
          {
            op: 'hero.changeMoves',
            params: { heroId: hero.id, delta: -1 },
          },
        ],
      },
    },
  ]);
  assert.equal(receipt.executed[0].op, 'effect.atomic');
  assert.deepEqual(
    receipt.executed[0].result.effects.map((effect) => effect.op),
    ['status.add', 'hero.changeMoves'],
  );
  assert(
    game.heroes[hero.id].statuses.some((status) => status.id === 'paid-cost'),
  );
  assert.equal(game.heroes[hero.id].moves, before.heroes[hero.id].moves - 1);
});
