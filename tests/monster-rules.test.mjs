import test from 'node:test';
import assert from 'node:assert/strict';
import {
  monsterTraitValue,
  monsterDamage,
  automaticMonsterDamage,
  changeMonsterTrait,
  consumeMonsterStun,
} from '../lib/content/monster-rules.mjs';
import {
  act,
  actions,
  pending,
  restoreGameSave,
  executeRuleEffects,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';

test('固定属性怪物受到普通伤害击晕，重复伤害不叠加回合', () => {
  const monster = {
    traitModel: 'fixed',
    traits: { might: 4, speed: 3, sanity: 2, knowledge: 1 },
  };
  const before = structuredClone(monster.traits);
  assert.deepEqual(
    ['might', 'speed', 'sanity', 'knowledge'].map((trait) =>
      monsterTraitValue(monster, trait),
    ),
    [4, 3, 2, 1],
  );
  assert.equal(monsterDamage(monster, 'physical', 3).stunned, true);
  monsterDamage(monster, 'physical', 2);
  assert.deepEqual(monster.traits, before);
  assert.equal(consumeMonsterStun(monster), true);
  assert.equal(consumeMonsterStun(monster), false);
});

test('属性轨狼王不会继承旧生命值模型的厚皮伤害上限', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'tracked-alpha'), act);
  const monster = game.enemies[0];
  const before = monster.positions.might + monster.positions.speed;
  game = act(game, { type: 'attack', id: monster.id });
  const request = pending(game);
  request.rolls[0].dice = Array(request.rolls[0].count).fill(2);
  request.rolls[1].dice = Array(request.rolls[1].count).fill(0);
  const expected = request.rolls[0].dice.reduce((sum, face) => sum + face, 0) + (request.rolls[0].bonus || 0);
  assert(expected > 3);
  game = drivePendingRequests(act(game, { type: 'resolveDice', requestId: request.uid }), act);
  const after = game.enemies.find((entry) => entry.id === monster.id);
  assert.equal(before - after.positions.might - after.positions.speed, expected);
});

test('固定怪物定向测试：战斗击晕、存档恢复及跳过一次怪物回合', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'fixed-monster'),
    act,
  );
  assert(actions(game).attack.includes('fixed-monster-test'));
  const before = structuredClone(game.heroes.map((hero) => hero.stats));
  game = drivePendingRequests(
    act(game, { type: 'attack', id: 'fixed-monster-test' }),
    act,
  );
  const monster = game.enemies.find(
    (entry) => entry.id === 'fixed-monster-test',
  );
  assert(monster.stunned);
  assert.equal(monster.hp, undefined);
  const position = monster.pos;
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  assert.equal(game.enemies[0].stunned, false);
  assert.equal(game.enemies[0].pos, position);
  assert.deepEqual(
    game.heroes.map((hero) => hero.stats),
    before,
  );
});

test('固定怪物进入人物所在房间触发捕兽夹后不能继续攻击', () => {
  for (const mode of ['workflow', 'simulation']) {
    let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'fixed-monster-trap'), act);
    game.executionMode = mode;
    const destination = game.heroes[game.active].pos;
    const before = structuredClone(game.heroes.map((hero) => hero.stats));
    game = drivePendingRequests(act(game, { type: 'endRound' }), act);
    assert(game.enemies[0].stunned);
    assert.equal(game.enemies[0].pos, destination);
    assert.deepEqual(game.heroes.map((hero) => hero.stats), before);
    assert(!game.events.some((event) => event.type === 'MovementQueued' && event.enemyId === 'fixed-monster-test' && event.attacks));
  }
});

test('被陷阱击晕的怪物仍结算同室蒸汽，存档恢复后不会继续攻击或提前解除击晕', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'fixed-monster-trap-steam'), act);
  game = act(game, { type: 'endRound' });
  while (pending(game) && pending(game).kind !== 'diceRequest') game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.match(pending(game).title, /蒸汽/);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = drivePendingRequests(act(game, { type: 'resolveDice', requestId: pending(game).uid }), act);
  assert(game.enemies[0].stunned);
  assert(!game.events.some((event) => event.type === 'MovementQueued' && event.enemyId === 'fixed-monster-test' && event.attacks));
  assert.equal(game.events.filter((event) => event.type === 'EnemyDamaged').length, 2);
});

test('固定怪物只有满足指定的击晕与封印条件才永久消灭', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'fixed-monster'),
    act,
  );
  const invalid = act(game, { type: 'sealMonster', id: 'fixed-monster-test' });
  assert.deepEqual(invalid, game);
  game = drivePendingRequests(
    act(game, { type: 'attack', id: 'fixed-monster-test' }),
    act,
  );
  assert(game.enemies[0].stunned);
  const seal = actions(game).abilities.find(
    (entry) => entry.handler === 'monster.seal',
  );
  assert(seal);
  game = act(game, seal.command);
  assert(!game.enemies.some((entry) => entry.id === 'fixed-monster-test'));
  assert.equal(game.phase, 'over');
});

test('精神免疫防止精神伤害，属性轨怪物按格数分配身体伤害', () => {
  const monster = {
    traitModel: 'tracks',
    mentalImmune: true,
    elimination: 'traitZero',
    tracks: {
      might: [0, 2, 3],
      speed: [0, 1, 2],
      sanity: [0, 2],
      knowledge: [0, 3],
    },
    positions: { might: 2, speed: 2, sanity: 1, knowledge: 1 },
  };
  assert.equal(monsterDamage(monster, 'mental', 1).immune, true);
  assert.equal(monster.positions.sanity, 1);
  assert.throws(
    () => monsterDamage(monster, 'physical', 3, { might: 1, speed: 1 }),
    /分配/,
  );
  assert.deepEqual(monster.positions, {
    might: 2,
    speed: 2,
    sanity: 1,
    knowledge: 1,
  });
  assert.equal(
    monsterDamage(monster, 'physical', 3, { might: 2, speed: 1 }).applied,
    3,
  );
  assert.equal(monsterTraitValue(monster, 'might'), 0);
  assert.equal(monsterTraitValue(monster, 'speed'), 1);
});

test('没有指定消灭条件的属性轨怪物不能由手动伤害分配扣到死亡点', () => {
  const monster = {
    traitModel: 'tracks',
    tracks: { might: [0, 1, 2], speed: [0, 1, 2] },
    positions: { might: 2, speed: 1 },
  };
  assert.throws(
    () => monsterDamage(monster, 'physical', 2, { might: 2, speed: 0 }),
    /分配/,
  );
  assert.deepEqual(monster.positions, { might: 2, speed: 1 });
  assert.equal(monsterDamage(monster, 'physical', 1, { might: 1 }).applied, 1);
  assert.equal(monster.positions.might, 1);
});

test('属性轨怪物自动分配伤害，可升降属性并尊重精神免疫', () => {
  const monster = {
    traitModel: 'tracks',
    mentalImmune: true,
    tracks: {
      might: [0, 1, 2, 3],
      speed: [0, 1, 2, 3],
      sanity: [0, 1, 2],
      knowledge: [0, 1, 2],
    },
    positions: { might: 3, speed: 2, sanity: 2, knowledge: 2 },
  };
  const result = automaticMonsterDamage(monster, 'physical', 9);
  assert.deepEqual(result.allocation, { might: 2, speed: 1 });
  assert.equal(result.ignored, 6);
  assert.equal(monster.positions.might, 1);
  assert.equal(monster.positions.speed, 1);
  assert.equal(changeMonsterTrait(monster, 'might', 2).after, 3);
  assert.equal(
    changeMonsterTrait(monster, 'sanity', -1, { mentalEffect: true }).immune,
    true,
  );
  assert.equal(monster.positions.sanity, 2);
  assert.equal(changeMonsterTrait(monster, 'speed', -1, { mentalEffect: true }).immune, true);
  assert.equal(monster.positions.speed, 1);
  assert.equal(changeMonsterTrait(monster, 'speed', 1).after, 2);
});

test('精神免疫阻挡精神效果对任何属性的改变，但不阻挡普通身体效果', () => {
  const game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'tracked-mental-immune'), act);
  const monster = game.enemies[0];
  assert(monster.mentalImmune);
  const before = structuredClone(monster.positions);
  for (const trait of ['might', 'speed', 'sanity', 'knowledge']) {
    const result = executeRuleEffects(game, [{ op: 'enemy.changeTrait', params: { enemyId: monster.id, trait, delta: -1, mentalEffect: true } }]);
    assert.equal(result.executed.length, 0);
  }
  assert.deepEqual(monster.positions, before);
  const physical = executeRuleEffects(game, [{ op: 'enemy.changeTrait', params: { enemyId: monster.id, trait: 'might', delta: -1 } }]);
  assert.equal(physical.executed.length, 1);
  assert.equal(monster.positions.might, before.might - 1);
});

test('精神免疫属性轨怪物不受小提琴影响但仍受到身体攻击', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'tracked-mental-immune'), act);
  const monsterId = game.enemies[0].id;
  const before = structuredClone(game.enemies[0].positions);
  const violin = actions(game).itemAbilities.find((entry) => entry.handler === 'item.wailingViolin' && entry.targetRoomId === game.heroes[game.active].pos);
  assert(violin);
  game = drivePendingRequests(act(game, violin.command), act);
  assert.deepEqual(game.enemies[0].positions, before);
  const hit = executeRuleEffects(game, [{ op: 'enemy.receiveDamage', params: { enemyId: monsterId, damageType: 'physical', amount: 1 } }]);
  assert.equal(hit.executed[0].result.applied, 1);
  assert.equal(game.enemies[0].positions.might + game.enemies[0].positions.speed, before.might + before.speed - 1);
});

test('规则反伤消灭最后一只属性轨怪物时立即结算胜利', () => {
  const game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'tracked-monster'), act);
  const monster = game.enemies[0];
  monster.positions.might = monster.positions.speed = 1;
  const result = executeRuleEffects(game, [{ op: 'enemy.receivePhysicalDamage', params: { enemyId: monster.id, amount: 1, sourceCardId: 'thorn-armor' } }]);
  assert.equal(result.executed.length, 1);
  assert(!game.enemies.some((entry) => entry.id === monster.id));
  assert.equal(game.phase, 'over');
  assert(game.result.won);
});

test('属性轨怪物在真实战斗中受伤、升属性并经指定骷髅条件消灭', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'tracked-monster'),
    act,
  );
  assert(actions(game).attack.includes('tracked-monster-test'));
  game = act(game, { type: 'attack', id: 'tracked-monster-test' });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 1 : 0);
  });
  game = drivePendingRequests(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
    act,
  );
  let monster = game.enemies.find(
    (entry) => entry.id === 'tracked-monster-test',
  );
  assert(monster);
  assert.equal(monster.hp, undefined);
  assert.equal(monster.positions.might + monster.positions.speed, 3);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  monster = game.enemies[0];
  const before = monster.positions.might;
  const changed = executeRuleEffects(game, [
    {
      op: 'enemy.changeTrait',
      params: { enemyId: monster.id, trait: 'might', delta: 1 },
    },
  ]);
  assert.equal(changed.executed.length, 1);
  assert.equal(game.enemies[0].positions.might, before + 1);
  executeRuleEffects(game, [
    {
      op: 'enemy.changeTrait',
      params: { enemyId: monster.id, trait: 'might', delta: -10 },
    },
  ]);
  assert(!game.enemies.some((entry) => entry.id === monster.id));
  assert.equal(game.phase, 'over');
});

test('怪物精神免疫在真实效果入口生效，解除免疫后承受精神伤害', () => {
  const game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'fixed-monster'),
    act,
  );
  const monster = game.enemies[0];
  monster.mentalImmune = true;
  const effect = {
    op: 'enemy.receiveDamage',
    params: { enemyId: monster.id, damageType: 'mental', amount: 2 },
  };
  const immune = executeRuleEffects(game, [effect]);
  assert.equal(immune.executed[0].result.immune, true);
  assert.equal(monster.stunned, false);
  monster.mentalImmune = false;
  const hit = executeRuleEffects(game, [effect]);
  assert.equal(hit.executed[0].result.stunned, true);
  assert.equal(monster.stunned, true);
  assert.equal(monster.hp, undefined);
});

test('属性轨怪物普通攻击达到其指定消灭条件时结束测试局', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'tracked-monster'),
    act,
  );
  game.enemies[0].positions.might = 1;
  game.enemies[0].positions.speed = 1;
  game = act(game, { type: 'attack', id: 'tracked-monster-test' });
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 2 : 0);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert(!game.enemies.some((entry) => entry.id === 'tracked-monster-test'));
  assert.equal(game.phase, 'over');
});

test('枪击属性轨怪物使用当前速度闪避并扣除身体属性', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'tracked-monster'),
    act,
  );
  const monster = game.enemies[0],
    before = monster.positions.might + monster.positions.speed;
  addItemInstance(game.heroes[game.active], 'pistol', 'tracked-gun');
  const shoot = actions(game).abilities.find(
    (entry) =>
      entry.handler === 'firearm.shoot' && entry.targetId === monster.id,
  );
  assert(shoot);
  game = act(game, shoot.command);
  assert.equal(pending(game).kind, 'diceRequest');
  assert.equal(
    pending(game).rolls[0].count,
    monster.tracks.speed[monster.positions.speed],
  );
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = drivePendingRequests(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
    act,
  );
  assert.equal(
    game.enemies[0].positions.might + game.enemies[0].positions.speed,
    before - 2,
  );
  assert.equal(game.enemies[0].hp, undefined);
});

test('生命值规则不能修改或创建新怪物生命字段', () => {
  for (const focus of ['fixed-monster', 'tracked-monster']) {
    const game = drivePendingRequests(
      createHauntPlaytest('werewolf', 23, 3, focus),
      act,
    );
    const monster = game.enemies[0];
    const result = executeRuleEffects(game, [
      { op: 'enemy.changeHp', params: { enemyId: monster.id, delta: -1 } },
    ]);
    assert.equal(result.executed.length, 0);
    assert.equal(monster.hp, undefined);
    assert.equal(Object.hasOwn(monster, 'hp'), false);
  }
});
