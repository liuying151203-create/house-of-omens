import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const settle = (game) => drivePendingRequests(game, act);
const start = () =>
  settle(createHauntPlaytest('werewolf', 23, 3, 'wailing-violin'));
const violin = (game, roomId) =>
  actions(game).itemAbilities.find(
    (entry) =>
      entry.handler === 'item.wailingViolin' && entry.targetRoomId === roomId,
  );

test('房间内人物、固定怪物和属性轨怪物均受影响，精神免疫不受影响', () => {
  let game = start();
  const before = game.heroes[1].stats.sanity;
  const action = violin(game, 'entrance');
  assert(action);
  game = act(game, action.command);
  assert(game.heroes[0].attacked);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).heroId, 1);
  assert.deepEqual(pending(game).traits, ['sanity']);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = settle(game);
  assert.equal(game.heroes[1].stats.sanity, before - 1);
  assert(game.enemies.find((enemy) => enemy.id === 'violin-fixed').stunned);
  assert(!game.enemies.find((enemy) => enemy.id === 'violin-immune').stunned);
  const tracked = game.enemies.find((enemy) => enemy.id === 'violin-tracked');
  assert.equal(tracked.positions.sanity, 1);
  assert.equal(tracked.positions.knowledge, 2);
  assert.equal(tracked.hp, undefined);
  assert(!violin(game, 'entrance'));
});

test('不区分友我，选择自己所在房间时使用者也受到理智伤害', () => {
  let game = start();
  game.heroes[0].omens = game.heroes[0].omens.filter((id) => id !== 'locket');
  const before = game.heroes[0].stats.sanity;
  game = act(game, violin(game, game.heroes[0].pos).command);
  assert.equal(pending(game).heroId, 0);
  game = settle(game);
  assert.equal(game.heroes[0].stats.sanity, before - 1);
});

test('旧模型怪物也因精神伤害击晕，不扣生命值', () => {
  let game = start();
  game.enemies.push({
    id: 'old-test',
    name: '旧怪物',
    kind: 'shadow',
    pos: 'entrance',
    hp: 8,
    maxHp: 8,
    might: 2,
    speed: 1,
  });
  game = settle(act(game, violin(game, 'entrance').command));
  const enemy = game.enemies.find((entry) => entry.id === 'old-test');
  assert(enemy.stunned);
  assert.equal(enemy.hp, 8);
  const before = enemy.pos;
  game = settle(act(game, { type: 'endRound' }));
  const after = game.enemies.find((entry) => entry.id === 'old-test');
  assert(!after.stunned);
  assert.equal(after.pos, before);
});

test('受影响人物的护符减伤后继续结算同房间的怪物', () => {
  let game = start();
  addItemInstance(game.heroes[1], 'mind-amulet', 'target:amulet');
  const before = game.heroes[1].stats.sanity;
  game = act(game, violin(game, 'entrance').command);
  assert.match(pending(game).title, /精神防护/);
  game = act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: 'reduce',
  });
  game = settle(game);
  assert.equal(game.heroes[1].stats.sanity, before);
  assert(game.enemies.find((entry) => entry.id === 'violin-fixed').stunned);
});

test('作用房间无距离或连通要求，也可选择其他楼层', () => {
  let game = start();
  game.heroes[1].pos = 'basement';
  const before = game.heroes[1].stats.sanity;
  game = settle(act(game, violin(game, 'basement').command));
  assert.equal(game.heroes[1].stats.sanity, before - 1);
});

test('联机时各目标自行处理伤害，流程不会泄露隐藏怪物', () => {
  const fixture = start();
  fixture.enemies.push({
    id: 'secret-monster',
    name: '不可见怪物',
    hidden: true,
    pos: 'entrance',
    traitModel: 'fixed',
    traits: { might: 2, speed: 1, sanity: 1, knowledge: 1 },
  });
  const service = createRoomService({
    gameFactory: () => structuredClone(fixture),
  });
  const host = service.create({ scenario: 'werewolf', count: 3 });
  const guest = service.join({ code: host.code });
  const started = service.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const command = violin(started.game, 'entrance').command;
  const after = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: command,
  });
  assert.equal(after.game.queue[0].kind, 'privateRequest');
  const projected = service.read(host.code, guest.key).game;
  assert.equal(projected.queue[0].kind, 'damage');
  assert.equal(projected.queue[0].heroId, 1);
  assert(!JSON.stringify(projected).includes('secret-monster'));
  assert.throws(
    () =>
      service.update(host.code, host.key, {
        type: 'action',
        revision: after.revision,
        action: {
          type: 'allocateDamage',
          requestId: projected.queue[0].uid,
          allocation: { sanity: 1 },
        },
      }),
    /权限|等待|操作/,
  );
});
