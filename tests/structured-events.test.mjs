import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  createSimulationGame,
  recordEvent,
  roll,
} from '../lib/game-engine.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { attributeChangesFromEvents } from '../lib/game-view.mjs';

test('authoritative state records serializable movement, dice and trait events', () => {
  let game = createSimulationGame('mirror', 701, 3);
  game.queue = [];
  game = act(game, { type: 'move', pos: 'foyer' });
  const movement = game.events.find((event) => event.type === 'EntityMoved');
  assert.deepEqual(
    {
      entityId: movement.entityId,
      from: movement.fromRoomId,
      to: movement.toRoomId,
      kind: movement.moveKind,
    },
    { entityId: 0, from: 'entrance', to: 'foyer', kind: 'walk' },
  );
  const dice = roll(game, 2, { heroId: 0, label: '测试骰子' });
  assert.deepEqual(game.events.at(-1).dice, dice);

  const hero = game.heroes[0];
  hero.stats.might--;
  addItemInstance(hero, 'medkit', 'event-medkit');
  game = act(game, {
    type: 'useItem',
    instanceId: 'event-medkit',
    trait: 'might',
  });
  const trait = game.events.findLast((event) => event.type === 'TraitChanged');
  assert.equal(trait.heroId, hero.id);
  assert.equal(trait.trait, 'might');
  assert.equal(trait.steps, 1);
  assert.deepEqual(attributeChangesFromEvents(game, trait.id - 1), [
    {
      eventId: trait.id,
      heroId: hero.id,
      name: hero.name,
      trait: 'might',
      label: trait.label,
      from: trait.before,
      to: trait.after,
      steps: 1,
      dead: false,
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(game.events)), game.events);
});

test('structured events retain bounded order and explicit visibility', () => {
  const game = createSimulationGame('mirror', 702, 3);
  for (let index = 0; index < 205; index++)
    recordEvent(game, 'TestEvent', { index }, { heroIds: [0] });
  assert.equal(game.events.length, 200);
  assert.equal(game.events[0].index, 5);
  assert.equal(game.events.at(-1).id, 205);
});
