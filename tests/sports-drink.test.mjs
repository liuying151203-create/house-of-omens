import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { resolveGameSet } from '../lib/game-sets.mjs';

const settle = (game) => drivePendingRequests(game, act);
const drink = (game) => actions(game).itemAbilities.find((entry) => entry.cardId === 'sports-drink' && entry.handler === 'item.use');
const choose = (game, choice) => act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });

test('运动饮料从当前回合结束起恢复两次，可分别选择力量和速度并保存恢复', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'sports-drink'));
  const initial = { ...game.heroes[0].stats };
  game = settle(act(game, drink(game).command));
  assert.deepEqual(game.heroes[0].stats, initial);
  assert(!game.heroes[0].items.includes('sports-drink'));
  game = act(game, { type: 'endHero' });
  assert.match(pending(game).title, /运动饮料/);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = settle(choose(game, 'might'));
  assert.equal(game.heroes[0].stats.might, initial.might + 1);
  assert.equal(game.heroes[0].stats.speed, initial.speed);
  assert.equal(game.heroes[0].statuses.find((status) => status.id === 'sports-drink').remainingTurns, 1);
  game.enemies[0].speed = 0;
  if (game.enemies[0].traits) game.enemies[0].traits.speed = 0;
  game.enemies[0].pos = 'basement';
  game = settle(act(game, { type: 'endRound' }));
  assert.equal(game.heroes[0].stats.speed, initial.speed);
  game = act(game, { type: 'endHero' });
  assert.match(pending(game).title, /运动饮料/);
  game = settle(choose(game, 'speed'));
  assert.equal(game.heroes[0].stats.speed, initial.speed + 1);
  assert(!game.heroes[0].statuses.some((status) => status.id === 'sports-drink'));
});

test('两项满初始值时本次恢复失效，下一回合受伤仍可恢复且不超上限', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'sports-drink'));
  const hero = game.heroes[0];
  hero.stats.might = hero.start.might;
  hero.stats.speed = hero.start.speed;
  game = settle(act(game, drink(game).command));
  game = settle(act(game, { type: 'endHero' }));
  assert.equal(game.heroes[0].statuses.find((status) => status.id === 'sports-drink').remainingTurns, 1);
  game.heroes[0].stats.might--;
  game.enemies[0].speed = 0;
  if (game.enemies[0].traits) game.enemies[0].traits.speed = 0;
  game.enemies[0].pos = 'basement';
  game = settle(act(game, { type: 'endRound' }));
  game = settle(act(game, { type: 'endHero' }));
  assert.equal(game.heroes[0].stats.might, game.heroes[0].start.might);
  assert.equal(game.heroes[0].stats.speed, game.heroes[0].start.speed);
  assert(!game.heroes[0].statuses.some((status) => status.id === 'sports-drink'));
});

test('运动饮料只进入通用扩展牌堆', () => {
  assert(resolveGameSet('expanded').decks.item.includes('sports-drink'));
  assert(!resolveGameSet('classic').decks.item.includes('sports-drink'));
});
