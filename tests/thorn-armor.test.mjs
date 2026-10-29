import test from 'node:test';
import assert from 'node:assert/strict';
import { act, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';

function receiveAttack(game, enemyId, uid) {
  const hero = game.heroes[game.active];
  game.queue = [
    {
      uid,
      kind: 'damage',
      heroId: hero.id,
      damageType: 'physical',
      traits: ['might', 'speed'],
      remaining: 1,
      total: 1,
      allocation: [],
      rawAmount: 1,
      prevented: 0,
      actualApplied: 0,
      rootActionId: `thorn-test:${uid}`,
      sourceKind: 'enemy',
      sourceEnemyId: enemyId,
      causeTag: 'attack',
      triggerUsage: [],
      beforeTriggers: [],
    },
  ];
  return act(game, {
    type: 'allocateDamage',
    requestId: uid,
    allocation: { might: 1, speed: 0 },
  });
}

test('荆棘铠甲每次近战实际受伤后可选择反伤，保存恢复后不重复', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 91, 4, 'thorn-armor'),
    act,
  );
  const hero = game.heroes[game.active],
    enemyId = game.enemies[0].id;
  // 保留旧生命值怪物上的连续反伤兼容测试。
  delete game.enemies[0].traitModel;
  Object.assign(game.enemies[0], { hp: 10, maxHp: 10, might: 5, speed: 2 });
  assert(hero.items.includes('thorn-armor'));
  const before = game.enemies[0].hp;
  game = receiveAttack(game, enemyId, 900);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /荆棘铠甲/);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const requestId = pending(game).uid;
  game = act(game, { type: 'resolveChoice', requestId, choice: 'retaliate' });
  game = drivePendingRequests(game, act);
  assert.equal(
    game.enemies.find((enemy) => enemy.id === enemyId).hp,
    before - 1,
  );
  assert.deepEqual(
    act(game, { type: 'resolveChoice', requestId, choice: 'retaliate' }),
    game,
  );
  game = receiveAttack(game, enemyId, 901);
  assert.equal(pending(game).kind, 'choiceRequest');
  game = act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'retaliate',
  });
  game = drivePendingRequests(game, act);
  assert.equal(
    game.enemies.find((enemy) => enemy.id === enemyId).hp,
    before - 2,
  );
});

test('荆棘铠甲对非近战来源不触发', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 91, 4, 'thorn-armor'),
    act,
  );
  const hero = game.heroes[game.active];
  game.queue = [
    {
      uid: 902,
      kind: 'damage',
      heroId: hero.id,
      damageType: 'physical',
      traits: ['might', 'speed'],
      remaining: 1,
      total: 1,
      allocation: [],
      rawAmount: 1,
      prevented: 0,
      actualApplied: 0,
      rootActionId: 'environment-test',
      sourceKind: 'room',
      causeTag: 'environment',
      triggerUsage: [],
      beforeTriggers: [],
    },
  ];
  game = act(game, {
    type: 'allocateDamage',
    requestId: 902,
    allocation: { might: 1, speed: 0 },
  });
  assert.notEqual(pending(game)?.kind, 'choiceRequest');
});

test('荆棘铠甲可反伤同室敌方人物，由受伤者分配伤害', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 91, 4, 'thorn-armor'),
    act,
  );
  const hero = game.heroes[game.active],
    attacker = game.heroes.find(
      (entry) => entry.id !== hero.id && !entry.traitor,
    );
  attacker.faction = 'wolves';
  attacker.pos = hero.pos;
  game.queue = [
    {
      uid: 903,
      kind: 'damage',
      heroId: hero.id,
      damageType: 'physical',
      traits: ['might', 'speed'],
      remaining: 1,
      total: 1,
      allocation: [],
      rawAmount: 1,
      prevented: 0,
      actualApplied: 0,
      rootActionId: 'actor-test',
      sourceKind: 'hero',
      sourceHeroId: attacker.id,
      causeTag: 'actorAttack',
      triggerUsage: [],
      beforeTriggers: [],
    },
  ];
  game = act(game, {
    type: 'allocateDamage',
    requestId: 903,
    allocation: { might: 1, speed: 0 },
  });
  assert.equal(pending(game).kind, 'choiceRequest');
  game = act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'retaliate',
  });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).heroId, attacker.id);
  assert.equal(pending(game).remaining, 1);
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 1, speed: 0 },
  });
  assert.equal(game.heroes[attacker.id].stats.might, attacker.stats.might - 1);
});

test('荆棘铠甲反伤固定属性怪物会击晕，不创建生命值', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'fixed-monster'),
    act,
  );
  addItemInstance(game.heroes[game.active], 'thorn-armor', 'test-thorns');
  game = receiveAttack(game, 'fixed-monster-test', 904);
  game = act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'retaliate',
  });
  game = drivePendingRequests(game, act);
  assert.equal(game.enemies[0].stunned, true);
  assert.equal(game.enemies[0].hp, undefined);
});

test('荆棘铠甲反伤属性轨怪物时扣除身体属性格', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'tracked-monster'),
    act,
  );
  addItemInstance(
    game.heroes[game.active],
    'thorn-armor',
    'test-thorns-tracked',
  );
  const before =
    game.enemies[0].positions.might + game.enemies[0].positions.speed;
  game = receiveAttack(game, 'tracked-monster-test', 905);
  game = act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'retaliate',
  });
  game = drivePendingRequests(game, act);
  assert.equal(
    game.enemies[0].positions.might + game.enemies[0].positions.speed,
    before - 1,
  );
  assert.equal(game.enemies[0].hp, undefined);
});

test('荆棘反伤使最后一只属性轨怪物达到特殊消灭条件后结算胜利', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'thorn-armor-tracked'), act);
  const enemyId = game.enemies[0].id;
  game = receiveAttack(game, enemyId, 913);
  assert.match(pending(game).title, /荆棘铠甲/);
  game = act(restoreGameSave(JSON.parse(JSON.stringify(game))), { type: 'resolveChoice', requestId: pending(game).uid, choice: 'retaliate' });
  game = drivePendingRequests(game, act);
  assert(!game.enemies.some((entry) => entry.id === enemyId));
  assert(game.result.won);
});

test('真实近战反击造成伤害后可触发荆棘铠甲', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 91, 4, 'thorn-armor'),
    act,
  );
  const enemy = game.enemies[0];
  delete enemy.traitModel;
  Object.assign(enemy, { hp: 10, maxHp: 10, might: 5, speed: 2 });
  const before = enemy.hp;
  game = act(game, { type: 'attack', id: enemy.id });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 0 : 2);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  for (let i = 0; pending(game)?.kind !== 'damage' && i < 20; i++)
    game = act(game, { type: 'advance' });
  const request = pending(game);
  assert.equal(request.kind, 'damage');
  game = act(game, {
    type: 'allocateDamage',
    requestId: request.uid,
    allocation: { might: 1, speed: request.remaining - 1 },
  });
  assert.equal(pending(game).kind, 'choiceRequest');
  game = act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'retaliate',
  });
  game = drivePendingRequests(game, act);
  assert.equal(
    game.enemies.find((entry) => entry.id === enemy.id).hp,
    before - 1,
  );
});
