import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const settle = (game) => drivePendingRequests(game, act);
const start = () =>
  settle(createHauntPlaytest('werewolf', 23, 3, 'shifting-mirror'));
const mirror = (game) =>
  actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.shiftingMirror',
  );
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });

test('使用者取消时不交换，不消耗移形镜', () => {
  let game = start();
  const positions = game.heroes.map((hero) => hero.pos);
  game = act(game, mirror(game).command);
  assert.equal(pending(game).heroId, 0);
  game = choose(game, 'cancel');
  assert.deepEqual(
    game.heroes.map((hero) => hero.pos),
    positions,
  );
  assert(game.heroes[0].items.includes('shifting-mirror'));
});

test('确认后无视距离交换同楼层人物，存档恢复且重复确认不生效', () => {
  let game = start();
  const from = game.heroes[0].pos,
    to = game.heroes[1].pos;
  game.rooms.find((room) => room.id === to).x = 100;
  game.heroes[0].stopped = true;
  game = act(game, mirror(game).command);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const command = {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'confirm',
  };
  game = act(game, command);
  assert.equal(game.heroes[0].pos, to);
  assert.equal(game.heroes[1].pos, from);
  assert(!game.heroes[0].items.includes('shifting-mirror'));
  assert.deepEqual(act(game, command), game);
});

test('不同楼层和同室人物不能选为交换对象', () => {
  const game = start();
  game.heroes[1].pos = 'basement';
  assert(!mirror(game));
  game.heroes[1].pos = game.heroes[0].pos;
  assert(!mirror(game));
});

test('确认前目标位置变化时保留镜子，不产生移动', () => {
  let game = start();
  game = act(game, mirror(game).command);
  game.heroes[1].pos = 'basement';
  const origin = game.heroes[0].pos;
  game = choose(game, 'confirm');
  assert.equal(game.heroes[0].pos, origin);
  assert.equal(game.heroes[1].pos, 'basement');
  assert(game.heroes[0].items.includes('shifting-mirror'));
});

test('确认权限属于移形镜持有者', () => {
  const fixture = act(start(), mirror(start()).command);
  const service = createRoomService({
    gameFactory: () => structuredClone(fixture),
  });
  const host = service.create({ scenario: 'werewolf', count: 3 });
  const guest = service.join({ code: host.code });
  const started = service.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const request = service.read(host.code, host.key).game.queue[0];
  assert.equal(request.kind, 'choiceRequest');
  assert.equal(
    service.read(host.code, guest.key).game.queue[0].kind,
    'privateRequest',
  );
  const command = {
    type: 'resolveChoice',
    requestId: request.uid,
    choice: 'confirm',
  };
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: started.revision,
        action: command,
      }),
    /权限|等待|操作/,
  );
  const result = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: command,
  });
  assert.equal(result.game.heroes[1].pos, fixture.heroes[0].pos);
});

test('同楼层敌对狼人可作为交换目标，无需对方同意', () => {
  let game = settle(createHauntPlaytest('werewolf', 31, 3, 'shifting-mirror-hostile'));
  const from = game.heroes[1].pos;
  const target = game.heroes[0].pos;
  const option = actions(game).itemAbilities.find((entry) => entry.handler === 'item.shiftingMirror' && entry.targetHeroId === 0);
  assert(option);
  game = act(game, option.command);
  assert.equal(pending(game).heroId, 1);
  game = settle(choose(game, 'confirm'));
  assert.equal(game.heroes[1].pos, target);
  assert.equal(game.heroes[0].pos, from);
});

test('双方各自抵达时触发敌方陷阱，伤害与恢复流程不重复', () => {
  let game = start();
  for (const roomId of [game.heroes[0].pos, game.heroes[1].pos])
    game.rooms.find((room) => room.id === roomId).traps = [
      { id: `trap:${roomId}`, faction: 'wolves', ownerId: 2 },
    ];
  game = choose(act(game, mirror(game).command), 'confirm');
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = settle(game);
  const triggers = game.events.filter(
    (event) => event.type === 'TrapTriggered',
  );
  assert.deepEqual(
    triggers.map((event) => event.heroId),
    [0, 1],
  );
  assert(game.heroes[0].stopped && game.heroes[1].stopped);
  assert(!game.heroes[0].items.includes('shifting-mirror'));
});
