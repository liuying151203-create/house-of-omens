import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';

test('清醒盐和褪色茶包分别恢复知识与理智，旧 ID 和存档仍可使用', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'mental-recovery-items'), act);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const hero = game.heroes[game.active];
  const before = structuredClone(hero.stats);
  const salt = actions(game).itemAbilities.filter((entry) => entry.cardId === 'tonic' && entry.handler === 'item.use');
  const tea = actions(game).itemAbilities.filter((entry) => entry.cardId === 'tea' && entry.handler === 'item.use');
  assert.deepEqual(salt.map((entry) => entry.trait), ['knowledge']);
  assert.deepEqual(tea.map((entry) => entry.trait), ['sanity']);
  game = drivePendingRequests(act(game, salt[0].command), act);
  assert.equal(game.heroes[game.active].stats.knowledge, hero.start.knowledge);
  assert.equal(game.heroes[game.active].stats.sanity, before.sanity);
  assert(!game.heroes[game.active].items.includes('tonic'));
  const currentTea = actions(game).itemAbilities.find((entry) => entry.cardId === 'tea' && entry.handler === 'item.use');
  game = drivePendingRequests(act(game, currentTea.command), act);
  assert.equal(game.heroes[game.active].stats.sanity, hero.start.sanity);
  assert(!game.heroes[game.active].items.includes('tea'));
});

test('对应属性达到起始位置时不能无效消耗恢复物品', () => {
  const game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'mental-recovery-items'), act);
  game.heroes[game.active].stats.knowledge = game.heroes[game.active].start.knowledge;
  assert(!actions(game).itemAbilities.some((entry) => entry.cardId === 'tonic' && entry.handler === 'item.use'));
  assert(actions(game).itemAbilities.some((entry) => entry.cardId === 'tea' && entry.handler === 'item.use'));
  assert(game.heroes[game.active].items.includes('tonic'));
});
