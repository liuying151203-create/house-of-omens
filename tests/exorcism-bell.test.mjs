import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance, itemInstances, transferItemInstance } from '../lib/item-instances.mjs';
import { installDoorLock } from '../lib/content/door-locks.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const settle = (game) => drivePendingRequests(game, act);
const start = () =>
  settle(createHauntPlaytest('werewolf', 23, 3, 'exorcism-bell'));
const bell = (game) =>
  actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.exorcismBell',
  );
const choose = (game, value) =>
  act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: value,
  });
const resume = (game) =>
  pending(game)?.kind === 'contentResume'
    ? act(game, { type: 'advance' })
    : game;
const charge = (game) =>
  itemInstances(game.heroes[0]).find(
    (item) => item.definitionId === 'exorcism-bell',
  )?.state.charges ?? 2;

test('选择同室人物逐格移动三次，累计两次使用后销毁', () => {
  let game = start();
  game = choose(act(game, bell(game).command), 'hero:1');
  game = choose(game, 'entrance');
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = resume(game);
  game = resume(choose(game, 'foyer'));
  game = resume(choose(game, 'stairs'));
  assert.equal(game.heroes[1].pos, 'stairs');
  assert.equal(charge(game), 1);
  assert(!pending(game));
  game = choose(act(game, bell(game).command), 'hero:0');
  game = resume(choose(game, 'entrance'));
  game = choose(game, 'stop');
  assert(!game.heroes[0].items.includes('exorcism-bell'));
});

test('取消或不移动不消耗次数，不能选择不在同室或相邻房间的人物', () => {
  let game = start();
  game.heroes[1].pos = 'foyer';
  game = act(game, bell(game).command);
  assert(!pending(game).options.some((option) => option.value === 'hero:1'));
  game = choose(game, 'cancel');
  assert.equal(charge(game), 2);
  game = choose(act(game, bell(game).command), 'hero:0');
  game = choose(game, 'stop');
  assert.equal(charge(game), 2);
});

test('相邻怪物可被移动，房间陷阱会造成伤害并停止移动', () => {
  let game = start();
  game.rooms.find((room) => room.id === 'foyer').traps = [
    { id: 'bell:trap', faction: 'heroes', ownerId: 0 },
  ];
  game = choose(act(game, bell(game).command), 'enemy:bell-monster-test');
  game = choose(game, 'foyer');
  game = settle(game);
  const monster = game.enemies.find(
    (entry) => entry.id === 'bell-monster-test',
  );
  assert.equal(monster.pos, 'foyer');
  assert(monster.stunned);
  assert.equal(charge(game), 1);
  assert(
    game.events.some(
      (event) => event.type === 'TrapTriggered' && event.enemyId === monster.id,
    ),
  );
});

test('人物移动进入敌方陷阱后结算伤害并停止继续移动', () => {
  let game = start();
  game.rooms.find((room) => room.id === 'entrance').traps = [
    { id: 'bell:trap', faction: 'wolves', ownerId: 2 },
  ];
  game = choose(act(game, bell(game).command), 'hero:1');
  game = choose(game, 'entrance');
  game = settle(game);
  assert.equal(game.heroes[1].pos, 'entrance');
  assert(game.heroes[1].stopped);
  assert(
    game.events.some(
      (event) => event.type === 'TrapTriggered' && event.heroId === 1,
    ),
  );
  assert.equal(charge(game), 1);
});

test('人物被手铃移动进入蒸汽并检定失败后，剩余强制移动停止', () => {
  for (const alreadyStopped of [false, true]) {
    let game = settle(createHauntPlaytest('werewolf', 23, 3, 'exorcism-bell-steam'));
    game.heroes[1].stopped = alreadyStopped;
    game = choose(act(game, bell(game).command), 'hero:1');
    game = choose(game, 'entrance');
    assert.equal(pending(game).kind, 'diceRequest');
    assert.match(pending(game).title, /蒸汽/);
    pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
    game = act(restoreGameSave(JSON.parse(JSON.stringify(game))), { type: 'resolveDice', requestId: pending(game).uid });
    for (let i = 0; pending(game) && i < 20; i++) {
      const request = pending(game);
      if (request.kind === 'choiceRequest') break;
      game = request.kind === 'damage'
        ? act(game, { type: 'allocateDamage', requestId: request.uid, allocation: { might: 1, speed: 0 } })
        : act(game, { type: 'advance', requestId: request.uid });
    }
    assert.equal(game.heroes[1].pos, 'entrance');
    assert(game.heroes[1].stopped);
    assert(!pending(game));
    assert.equal(game.events.filter((event) => event.type === 'EntityMoved' && event.entityId === 1 && event.moveKind === 'exorcismBell').length, 1);
  }
});

test('蒸汽检定成功后可继续手铃移动', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'exorcism-bell-steam'));
  game = choose(act(game, bell(game).command), 'hero:1');
  game = choose(game, 'entrance');
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(2);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  for (let i = 0; pending(game) && pending(game).kind !== 'choiceRequest' && i < 20; i++) game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.match(pending(game).title, /选择方向/);
  assert(pending(game).options.some((option) => option.value === 'foyer'));
});

test('被停止移动的人物仍可被手铃移动，原有移动力不恢复', () => {
  let game = start();
  game.heroes[1].moves = 0;
  game.heroes[1].stopped = true;
  game = choose(act(game, bell(game).command), 'hero:1');
  game = resume(choose(game, 'entrance'));
  game = choose(game, 'stop');
  assert.equal(game.heroes[1].pos, 'entrance');
  assert.equal(game.heroes[1].moves, 0);
  assert(game.heroes[1].stopped);
});

test('锁门阻挡没有钥匙的被移动目标，无路可走不消耗次数', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'worn-lock', 'test:lock');
  assert(installDoorLock(game, game.heroes[0], 'test:lock', 'entrance'));
  game = choose(act(game, bell(game).command), 'hero:1');
  assert(!pending(game));
  assert.equal(charge(game), 2);
  assert.equal(game.heroes[1].pos, 'greenhouse');
});

test('手铃移动持钥匙人物转化的怪物时可以经过锁门且锁保持有效', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'worn-lock', 'test:monster-key');
  assert(installDoorLock(game, game.heroes[0], 'test:monster-key', 'entrance'));
  const transformed = game.heroes.find((hero) => hero.traitor);
  assert(transferItemInstance(game.heroes[0], transformed, 'test:monster-key'));
  game.enemies[0].heroId = transformed.id;
  transformed.pos = game.enemies[0].pos;
  game = choose(act(game, bell(game).command), 'enemy:bell-monster-test');
  assert(pending(game).options.some((option) => option.value === 'greenhouse'));
  game = resume(choose(game, 'greenhouse'));
  game = choose(game, 'stop');
  assert.equal(game.enemies[0].pos, 'greenhouse');
  assert(game.doorLocks[0].active);
  assert(!game.events.some((event) => event.type === 'DoorLockAttempted'));
});

test('怪物进入蒸汽时可存档恢复，并只移动与检定一次', () => {
  let game = start();
  game.bloodmoon = {
    steam: [
      {
        id: 'bell:steam',
        active: true,
        ownerId: 0,
        roomIds: ['foyer'],
        checked: [],
        expiresRound: 9,
      },
    ],
  };
  game = choose(act(game, bell(game).command), 'enemy:bell-monster-test');
  game = choose(game, 'foyer');
  assert.equal(pending(game).kind, 'diceRequest');
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = settle(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
  const enemy = game.enemies.find((entry) => entry.id === 'bell-monster-test');
  assert.equal(enemy.pos, 'foyer');
  assert(enemy.stunned);
  assert.equal(
    game.events.filter(
      (event) =>
        event.type === 'EntityMoved' &&
        event.entityId === enemy.id &&
        event.moveKind === 'exorcismBell',
    ).length,
    1,
  );
  assert.equal(charge(game), 1);
});

test('联机只有持有者可选择目标和移动方向', () => {
  const fixture = start();
  const service = createRoomService({
    gameFactory: () => structuredClone(fixture),
  });
  const host = service.create({ scenario: 'werewolf', count: 3 });
  const guest = service.join({ code: host.code });
  const started = service.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const begin = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: bell(started.game).command,
  });
  const request = begin.game.queue[0];
  assert.equal(
    service.read(host.code, guest.key).game.queue[0].kind,
    'privateRequest',
  );
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: begin.revision,
        action: {
          type: 'resolveChoice',
          requestId: request.uid,
          choice: 'hero:1',
        },
      }),
    /权限|等待|操作/,
  );
  const next = service.update(host.code, host.key, {
    type: 'action',
    revision: begin.revision,
    action: { type: 'resolveChoice', requestId: request.uid, choice: 'hero:1' },
  });
  assert.match(next.game.queue[0].title, /选择方向/);
});

test('人物被入场陷阱击杀后，不再触发该房间的属性奖励', () => {
  let game = start();
  game.heroes[1].stats.might = 1;
  const room = game.rooms.find((entry) => entry.id === 'entrance');
  room.special = 'knowledge';
  room.traps = [{ id: 'fatal:trap', faction: 'wolves', ownerId: 2 }];
  game = choose(act(game, bell(game).command), 'hero:1');
  game = choose(game, 'entrance');
  assert.equal(pending(game).kind, 'damage');
  const before = game.heroes[1].stats.knowledge;
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 2, speed: 0 },
  });
  game = settle(game);
  assert(game.heroes[1].dead);
  assert.equal(game.heroes[1].stats.knowledge, before);
});
