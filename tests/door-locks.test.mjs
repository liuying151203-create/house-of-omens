import test from 'node:test';
import assert from 'node:assert/strict';
import {
  connectedDoor,
  doorLock,
  installDoorLock,
  lockAttemptAllowed,
  mayPassDoor,
  resolveLockAttempt,
} from '../lib/content/door-locks.mjs';
import {
  addItemInstance,
  itemInstances,
  transferItemInstance,
} from '../lib/item-instances.mjs';
import { act, actions } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';

const start = () =>
  drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'echo-spool'),
    act,
  );

test('人物测试点可实际装锁、转交钥匙并在失败后承受伤害', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'worn-lock'),
    act,
  );
  const install = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.installLock',
  );
  assert(install);
  const target = install.targetRoomId;
  game = drivePendingRequests(act(game, install.command), act);
  assert(game.doorLocks[0].active);
  assert(actions(game).move.includes(target));
  const transfer = actions(game).itemAbilities.find(
    (entry) =>
      entry.handler === 'item.transfer' && entry.cardId === 'worn-lock',
  );
  game = drivePendingRequests(act(game, transfer.command), act);
  assert(!actions(game).move.includes(target));
  const attempt = actions(game).abilities.find(
    (entry) => entry.handler === 'door.breakLock',
  );
  assert(attempt);
  const before = game.heroes[0].stats.might + game.heroes[0].stats.speed;
  game = act(game, attempt.command);
  assert.equal(game.queue[0].kind, 'diceRequest');
  game.queue[0].rolls[0].dice = Array(game.queue[0].rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: game.queue[0].uid });
  game = drivePendingRequests(game, act);
  assert(game.doorLocks[0].active);
  assert(
    !actions(game).abilities.some(
      (entry) => entry.handler === 'door.breakLock',
    ),
  );
  assert.equal(
    game.heroes[0].stats.might + game.heroes[0].stats.speed,
    before - 1,
  );
});

test('人物成功破锁后两侧标记消失，通路恢复且钥匙不能重复安装', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'worn-lock'),
    act,
  );
  const install = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.installLock',
  );
  const target = install.targetRoomId;
  game = drivePendingRequests(act(game, install.command), act);
  const transfer = actions(game).itemAbilities.find(
    (entry) =>
      entry.handler === 'item.transfer' && entry.cardId === 'worn-lock',
  );
  game = drivePendingRequests(act(game, transfer.command), act);
  const attempt = actions(game).abilities.find(
    (entry) => entry.handler === 'door.breakLock',
  );
  game = act(game, attempt.command);
  game.queue[0].rolls[0].dice = Array(game.queue[0].rolls[0].count).fill(2);
  game = drivePendingRequests(
    act(game, { type: 'resolveDice', requestId: game.queue[0].uid }),
    act,
  );
  assert.equal(game.doorLocks[0].active, false);
  assert(actions(game).move.includes(target));
  for (const roomId of game.doorLocks[0].rooms)
    assert(
      !game.rooms
        .find((room) => room.id === roomId)
        .tokens.some((token) => token.id === game.doorLocks[0].id),
    );
  assert(game.heroes[transfer.targetHeroId].items.includes('worn-lock'));
  assert(
    itemInstances(game.heroes[transfer.targetHeroId]).find(
      (item) => item.definitionId === 'worn-lock',
    ).state.lockInstalled,
  );
});

test('人物破锁失败后下一个自己的回合可以再次尝试', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'worn-lock'), act);
  const install = actions(game).itemAbilities.find((entry) => entry.handler === 'item.installLock');
  game = drivePendingRequests(act(game, install.command), act);
  const transfer = actions(game).itemAbilities.find((entry) => entry.handler === 'item.transfer' && entry.cardId === 'worn-lock');
  game = drivePendingRequests(act(game, transfer.command), act);
  const attempt = actions(game).abilities.find((entry) => entry.handler === 'door.breakLock');
  game = act(game, attempt.command);
  game.queue[0].rolls[0].dice = Array(game.queue[0].rolls[0].count).fill(0);
  game = drivePendingRequests(act(game, { type: 'resolveDice', requestId: game.queue[0].uid }), act);
  assert(!actions(game).abilities.some((entry) => entry.handler === 'door.breakLock'));
  game.enemies[0].stunned = true;
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  assert(game.doorLocks[0].active);
  assert(actions(game).abilities.some((entry) => entry.handler === 'door.breakLock'));
});

test('持钥匙人物经过后门仍保持上锁', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'worn-lock'),
    act,
  );
  const install = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.installLock',
  );
  game = drivePendingRequests(act(game, install.command), act);
  game = drivePendingRequests(
    act(game, { type: 'move', pos: install.targetRoomId }),
    act,
  );
  assert.equal(game.heroes[0].pos, install.targetRoomId);
  assert(game.doorLocks[0].active);
  assert(game.heroes[0].items.includes('worn-lock'));
});

test('只能将锁装在已双向接通的门，钥匙转交后权限随实例转移', () => {
  const game = start(),
    owner = game.heroes[0],
    recipient = game.heroes[1];
  const destination = actions(game).move[0];
  addItemInstance(owner, 'worn-lock', 'test:lock');
  assert(connectedDoor(game, owner.pos, destination));
  assert.equal(installDoorLock(game, owner, 'test:lock', 'basement'), false);
  const lock = installDoorLock(game, owner, 'test:lock', destination);
  assert(lock);
  assert.equal(doorLock(game, destination, owner.pos), lock);
  assert(mayPassDoor(game, owner, owner.pos, destination));
  assert(!mayPassDoor(game, recipient, destination, owner.pos));
  assert(transferItemInstance(owner, recipient, 'test:lock'));
  assert(!mayPassDoor(game, owner, owner.pos, destination));
  assert(mayPassDoor(game, recipient, destination, owner.pos));
  assert(lock.active);
  assert.equal(
    installDoorLock(game, recipient, 'test:lock', destination),
    false,
  );
});

test('破锁失败限制该角色当回合重试，其他角色和下回合仍可尝试', () => {
  const game = start(),
    owner = game.heroes[0],
    destination = actions(game).move[0];
  addItemInstance(owner, 'worn-lock', 'test:lock');
  const lock = installDoorLock(game, owner, 'test:lock', destination);
  assert.deepEqual(resolveLockAttempt(lock, 'hero:1', 'round:1', 3), {
    broken: false,
    damage: 1,
  });
  assert(!lockAttemptAllowed(lock, 'hero:1', 'round:1'));
  assert.equal(resolveLockAttempt(lock, 'hero:1', 'round:1', 4), false);
  assert(lockAttemptAllowed(lock, 'enemy:wolf', 'round:1'));
  assert(lockAttemptAllowed(lock, 'hero:1', 'round:2'));
  assert.deepEqual(resolveLockAttempt(lock, 'enemy:wolf', 'round:1', 4), {
    broken: true,
    damage: 0,
  });
  assert(mayPassDoor(game, null, owner.pos, destination));
});

test('已上锁的门阻挡无钥匙人物的常规移动', () => {
  const game = start(),
    owner = game.heroes[0],
    recipient = game.heroes[1];
  const destination = actions(game).move[0];
  addItemInstance(owner, 'worn-lock', 'test:lock');
  installDoorLock(game, owner, 'test:lock', destination);
  assert(mayPassDoor(game, owner, owner.pos, destination));
  assert(transferItemInstance(owner, recipient, 'test:lock'));
  assert(!actions(game).move.includes(destination));
  assert.deepEqual(act(game, { type: 'move', pos: destination }), game);
  game.rooms.find((room) => room.id === destination).special = 'collapse';
  assert.deepEqual(act(game, { type: 'move', pos: destination }), game);
});

test('回声线轴不能借未持钥匙的锁门计算返回通路', () => {
  let game = start();
  const origin = game.heroes[0].pos;
  const spool = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.echoSpool',
  );
  game = act(game, spool.command);
  game = act(game, {
    type: 'resolveChoice',
    requestId: game.queue[0].uid,
    choice: 'confirm',
  });
  const destination = actions(game).move[0];
  game = drivePendingRequests(
    act(game, { type: 'move', pos: destination }),
    act,
  );
  const other = game.heroes[1];
  addItemInstance(other, 'worn-lock', 'test:echo-lock');
  other.pos = origin;
  assert(installDoorLock(game, other, 'test:echo-lock', destination));
  const returnAction = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.echoSpool',
  );
  game = act(game, returnAction.command);
  assert.equal(game.queue[0].title, '无法回返');
  assert.equal(game.heroes[0].pos, destination);
  assert(game.heroes[0].items.includes('echo-spool'));
});

function monsterAtLockedDoor(seed) {
  const game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'fixed-monster'),
    act,
  );
  const owner = game.heroes[0];
  const destination = actions(game).move[0];
  addItemInstance(owner, 'worn-lock', 'test:monster-lock');
  assert(installDoorLock(game, owner, 'test:monster-lock', destination));
  game.heroes
    .filter((hero) => !hero.traitor)
    .forEach((hero) => {
      hero.pos = owner.pos;
    });
  game.enemies[0].pos = destination;
  game.enemies[0].traits.might = 4;
  game.enemies[0].traits.speed = 1;
  game.seed = seed;
  return game;
}

test('固定属性怪物破锁成功后通过门，不创建生命值', () => {
  let game = monsterAtLockedDoor(0);
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  const attempt = game.events.find(
    (event) => event.type === 'DoorLockAttempted',
  );
  assert(attempt?.success);
  assert.equal(game.doorLocks[0].active, false);
  assert.equal(game.enemies[0].pos, game.heroes[0].pos);
  assert.equal(game.enemies[0].hp, undefined);
});

test('由持钥匙人物转化的怪物经过锁门无需破锁，门保持上锁', () => {
  let game = drivePendingRequests(createHauntPlaytest('werewolf', 23, 3, 'worn-lock-monster-key'), act);
  game.seed = 2;
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  assert.equal(game.enemies[0].pos, game.heroes[0].pos);
  assert(game.doorLocks[0].active);
  assert(!game.events.some((event) => event.type === 'DoorLockAttempted'));
});

test('锁的定向测试点可通过真实上锁操作观察门外怪物破锁', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'worn-lock'),
    act,
  );
  const install = actions(game).itemAbilities.find(
    (entry) =>
      entry.handler === 'item.installLock' && entry.targetRoomId === 'entrance',
  );
  game = drivePendingRequests(act(game, install.command), act);
  game.seed = 2;
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  assert(
    game.events.some(
      (event) =>
        event.type === 'DoorLockAttempted' &&
        event.enemyId === 'lock-monster-test',
    ),
  );
});

test('固定属性怪物破锁失败停在门前并被击晕，属性不下降', () => {
  let game = monsterAtLockedDoor(2);
  const position = game.enemies[0].pos,
    traits = structuredClone(game.enemies[0].traits);
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  const attempt = game.events.find(
    (event) => event.type === 'DoorLockAttempted',
  );
  assert(attempt && !attempt.success);
  assert(game.doorLocks[0].active);
  assert.equal(game.enemies[0].pos, position);
  assert(game.enemies[0].stunned);
  assert.deepEqual(game.enemies[0].traits, traits);
  assert.equal(game.enemies[0].hp, undefined);
});

test('属性轨怪物破锁失败扣减身体属性，不创建生命值', () => {
  let game = monsterAtLockedDoor(2);
  const monster = game.enemies[0];
  monster.traitModel = 'tracks';
  monster.tracks = {
    might: [0, 1, 2, 3, 4],
    speed: [0, 1, 2],
    sanity: [0, 1, 2],
    knowledge: [0, 1, 2],
  };
  monster.positions = { might: 4, speed: 1, sanity: 2, knowledge: 2 };
  delete monster.traits;
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  assert.equal(
    game.events.find((event) => event.type === 'DoorLockAttempted').success,
    false,
  );
  assert.equal(game.enemies[0].positions.might, 3);
  assert.equal(game.enemies[0].hp, undefined);
});

test('怪物在到达锁门前被陷阱拦住时不会提前进行破锁检定', () => {
  let game = monsterAtLockedDoor(0);
  const hero = game.heroes[0],
    enemy = game.enemies[0];
  game.doorLocks = [];
  hero.pos = 'entrance';
  const key = itemInstances(hero).find(
    (item) => item.definitionId === 'worn-lock',
  );
  hero.itemInstances.find((item) => item.instanceId === key.instanceId).state =
    {};
  assert(installDoorLock(game, hero, key.instanceId, 'foyer'));
  game.heroes
    .filter((entry) => !entry.traitor)
    .forEach((entry) => {
      entry.pos = 'foyer';
    });
  enemy.pos = 'greenhouse';
  enemy.traits.speed = 3;
  game.rooms.find((room) => room.id === 'entrance').traps = [
    { id: 'before-lock', faction: 'heroes', ownerId: 0 },
  ];
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  assert(!game.events.some((event) => event.type === 'DoorLockAttempted'));
  assert(game.doorLocks[0].active);
  assert.equal(game.enemies[0].pos, 'entrance');
});
