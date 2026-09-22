import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  createSimulationGame,
  TRAITS,
} from '../lib/game-engine.mjs';
import {
  itemActionViews,
  selectItemAction,
} from '../lib/content/item-actions.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { updateCardRule } from '../lib/card-rules.mjs';
import { itemUseDefinition } from '../lib/content/item-abilities.mjs';

const start = () =>
  act(createSimulationGame('bells', 151, 3), { type: 'advance' });

test('runtime item abilities use the same definitions as validation and execution', () => {
  for (const use of ['movement', 'healPhysical', 'healMental']) {
    let game = start();
    game.heroes[0].stats.might--;
    game.heroes[0].stats.sanity--;
    addItemInstance(game.heroes[0], 'coffee', 'ability-test');
    game = updateCardRule(game, {
      id: 'ability-override',
      cardType: 'item',
      cardId: 'coffee',
      patch: { use, useAmount: 1 },
    });
    const action = itemActionViews(game, game.heroes[0], TRAITS).find(
      (entry) => entry.available,
    );
    assert(action, use);
    assert(itemUseDefinition(use));
    const next = act(game, action.command);
    assert.notDeepEqual(next, game);
    assert(!next.heroes[0].items.includes('coffee'));
  }
  for (const use of ['unknown', 'toString', '__proto__']) {
    assert.equal(itemUseDefinition(use), undefined);
    assert.throws(
      () =>
        updateCardRule(start(), {
          id: 'invalid-ability',
          cardType: 'item',
          cardId: 'coffee',
          patch: { use },
        }),
      /无效的卡牌规则/,
    );
  }
});

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
    actions(game)
      .itemAbilities.filter((action) => action.handler === 'item.use')
      .map((action) => action.id),
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

test('runtime card charges persist per instance and disable only the depleted copy', () => {
  let game = updateCardRule(start(), {
    id: 'test-medkit-charges',
    cardType: 'item',
    cardId: 'medkit',
    patch: { consumable: false, charges: 2 },
  });
  const hero = game.heroes[0];
  hero.stats.might--;
  addItemInstance(hero, 'medkit', 'item-charged-medkit');
  const use = () =>
    itemActionViews(game, game.heroes[0], TRAITS).find(
      (action) => action.trait === 'might',
    );
  game = act(game, use().command);
  assert.equal(game.heroes[0].itemInstances[0].state.charges, 1);
  game = act(game, { type: 'advance' });
  game.heroes[0].stats.might--;
  game.heroes[0].usedItemInstances = [];
  game = act(game, use().command);
  assert.equal(game.heroes[0].itemInstances[0].state.charges, 0);
  game.heroes[0].stats.might--;
  game.heroes[0].usedItemInstances = [];
  assert.equal(use().available, false);
  assert.match(use().unavailableReason, /耗尽/);
});
