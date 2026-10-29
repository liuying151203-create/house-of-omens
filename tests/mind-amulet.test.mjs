import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  executeRuleEffects,
  pending,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance, itemInstances } from '../lib/item-instances.mjs';

const start = () => {
  const game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'basic'),
    act,
  );
  game.heroes[0].omens = game.heroes[0].omens.filter((id) => id !== 'locket');
  addItemInstance(game.heroes[0], 'mind-amulet', 'test:mind-amulet');
  return game;
};
const deal = (game, type, amount) =>
  executeRuleEffects(game, [
    {
      op: 'damage.deal',
      params: { heroId: 0, damageType: type, amount, sourceKind: 'test' },
    },
  ]);
const choose = (game, value) =>
  act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: value,
  });
const settle = (game) => drivePendingRequests(game, act);

test('每轮首次精神伤害可减1，放弃也消耗本轮机会', () => {
  let game = start();
  deal(game, 'mental', 2);
  assert.equal(pending(game).kind, 'choiceRequest');
  game = choose(game, 'reduce');
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).total, 1);
  game = settle(game);
  deal(game, 'mental', 1);
  assert.equal(pending(game).kind, 'damage');
  game = settle(game);
  game.round++;
  deal(game, 'mental', 2);
  assert.equal(pending(game).kind, 'choiceRequest');
  game = choose(game, 'skip');
  assert.equal(pending(game).total, 2);
  game = settle(game);
  deal(game, 'mental', 1);
  assert.equal(pending(game).kind, 'damage');
});

test('护符抵挡致命身体伤害，其他伤害照常结算，超出安全格数失效', () => {
  let game = start();
  game.heroes[0].stats.might = 2;
  game.heroes[0].stats.speed = 2;
  deal(game, 'physical', 4);
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 2, speed: 2 },
  });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /抵挡致命伤/);
  assert.equal(game.heroes[0].stats.might, 1);
  assert(
    !game.events.some((event) => event.type === 'TraitChanged' && event.dead),
  );
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const requestId = pending(game).uid;
  game = choose(game, 'protect');
  game = settle(game);
  assert.equal(game.heroes[0].stats.might, 1);
  assert.equal(game.heroes[0].stats.speed, 1);
  assert(!game.heroes[0].dead);
  assert(!game.heroes[0].items.includes('mind-amulet'));
  const applied = game.events.findLast(
    (entry) => entry.type === 'DamageApplied',
  );
  assert.equal(applied.actualAmount, 2);
  assert.equal(applied.discardedAmount, 2);
  assert.deepEqual(
    act(game, { type: 'resolveChoice', requestId, choice: 'protect' }),
    game,
  );
});

test('拒绝保命时正常死亡且护符不损毁', () => {
  let game = start();
  game.heroes[0].stats.might = 1;
  deal(game, 'physical', 1);
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 1, speed: 0 },
  });
  game = choose(game, 'skip');
  assert(game.heroes[0].dead);
  assert(game.heroes[0].items.includes('mind-amulet'));
});

test('精神减伤后仍发生致命伤时可用同一护符保命', () => {
  let game = start();
  game.heroes[0].stats.sanity = 1;
  deal(game, 'mental', 2);
  game = choose(game, 'reduce');
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { sanity: 1, knowledge: 0 },
  });
  assert.match(pending(game).title, /抵挡致命伤/);
  game = settle(choose(game, 'protect'));
  assert.equal(game.heroes[0].stats.sanity, 1);
  assert(!game.heroes[0].dead);
  assert(!game.heroes[0].items.includes('mind-amulet'));
});

test('逐点分配时护符持续保护本次剩余伤害', () => {
  let game = start();
  game.heroes[0].stats.might = 1;
  game.heroes[0].stats.speed = 1;
  deal(game, 'physical', 2);
  game = act(game, {
    type: 'allocate',
    requestId: pending(game).uid,
    trait: 'might',
  });
  game = choose(game, 'protect');
  assert.equal(pending(game).kind, 'damage');
  game = settle(
    act(game, {
      type: 'allocate',
      requestId: pending(game).uid,
      trait: 'speed',
    }),
  );
  assert.equal(game.heroes[0].stats.might, 1);
  assert.equal(game.heroes[0].stats.speed, 1);
  assert(!game.heroes[0].dead);
});

test('定向测试点从精神伤害减伤选择开始', () => {
  let game = createHauntPlaytest('werewolf', 23, 3, 'mind-amulet');
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /精神防护/);
  assert(
    itemInstances(game.heroes[0]).some(
      (item) => item.definitionId === 'mind-amulet',
    ),
  );
  game = choose(game, 'reduce');
  for (let index = 0; index < 10 && pending(game)?.kind !== 'damage'; index++)
    game = act(game, { type: 'advance' });
  assert.equal(pending(game)?.kind, 'damage');
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { sanity: 1, knowledge: 0 },
  });
  assert.match(pending(game).title, /抵挡致命伤/);
});
