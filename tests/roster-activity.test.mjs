import test from 'node:test';
import assert from 'node:assert/strict';
import { rosterActivity } from '../lib/roster-activity.mjs';

test('人物活动状态来自当前移动和明确的骰子请求', () => {
  const game = { active: 0 };
  const hero = { id: 0, items: ['potion'] };
  assert.equal(
    rosterActivity(game, hero, null, { kind: 'move', heroId: 0 }).label,
    '正在移动',
  );
  assert.equal(
    rosterActivity(game, hero, {
      kind: 'diceRequest',
      rolls: [{ heroId: 0, label: '力量防御' }],
    }).label,
    '正在防御',
  );
  assert.equal(
    rosterActivity(game, hero, {
      kind: 'diceRequest',
      rolls: [{ heroId: 0, label: '力量攻击' }],
    }).label,
    '正在攻击',
  );
  assert.equal(
    rosterActivity(game, hero, {
      kind: 'diceRequest',
      heroId: 0,
      sourceCardId: 'potion',
      rolls: [{ heroId: 0, label: '知识检定' }],
    }).label,
    '正在使用物品',
  );
  assert.equal(
    rosterActivity(game, hero, { kind: 'itemUse', heroId: 0 }).label,
    '当前行动人物',
  );
  assert.equal(
    rosterActivity(game, { id: 1 }, null, { kind: 'move', heroId: 0 }),
    null,
  );
});
