import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, createGame, TRAITS } from '../lib/game-engine.mjs';
import {
  itemActionViews,
  selectItemAction,
} from '../lib/content/item-actions.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';

const start = () => act(createGame('bells', 151, 3), { type: 'advance' });

test('item action views share availability, targets and effects with execution', () => {
  let game = start();
  const hero = game.heroes[0];
  hero.stats.might--;
  addItemInstance(hero, 'medkit', 'item-medkit-test');

  const views = itemActionViews(game, hero, TRAITS),
    might = views.find((action) => action.trait === 'might'),
    speed = views.find((action) => action.trait === 'speed');
  assert(might.available);
  assert(!speed.available);
  assert.deepEqual(might.effects, [
    {
      op: 'hero.restoreTrait',
      params: { heroId: hero.id, trait: 'might', amount: 2 },
    },
  ]);
  assert.deepEqual(JSON.parse(JSON.stringify(views)), views);
  assert.deepEqual(
    actions(game).itemAbilities.map((action) => action.id),
    [might.id],
  );
  assert.equal(
    selectItemAction(game, hero, {
      type: 'useItem',
      actionId: speed.id,
      instanceId: speed.instanceId,
      trait: speed.trait,
    }),
    undefined,
  );

  game = act(game, {
    type: 'useItem',
    actionId: might.id,
    instanceId: might.instanceId,
    id: might.cardId,
    trait: might.trait,
  });
  assert.equal(game.heroes[0].stats.might, game.heroes[0].start.might);
  assert(!game.heroes[0].items.includes('medkit'));
  assert.equal(game.queue[0].effects[0].op, 'hero.restoreTrait');
});

test('stopped movement items remain visible but cannot execute', () => {
  const game = start(),
    hero = game.heroes[0];
  addItemInstance(hero, 'coffee', 'item-coffee-test');
  hero.stopped = true;
  hero.moves = 0;
  const [view] = itemActionViews(game, hero, TRAITS);
  assert(!view.available);
  assert.match(view.unavailableReason, /停止移动/);
  assert.deepEqual(
    act(game, {
      type: 'useItem',
      actionId: view.id,
      instanceId: view.instanceId,
      id: view.cardId,
    }),
    game,
  );
});
