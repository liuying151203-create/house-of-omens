import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, echoSpoolPath, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { itemInstances } from '../lib/item-instances.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const settle = (game) => drivePendingRequests(game, act);
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });
const action = (game) =>
  actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.echoSpool',
  );
const start = () =>
  settle(createHauntPlaytest('werewolf', 23, 3, 'echo-spool'));

test('系线可取消，确认后保存标记，零移动力也可回返且不重复消耗', () => {
  let game = start();
  const origin = game.heroes[0].pos;
  game = act(game, action(game).command);
  game = choose(game, 'cancel');
  assert.equal(
    itemInstances(game.heroes[0]).find(
      (item) => item.definitionId === 'echo-spool',
    ).state.echoRoomId,
    undefined,
  );
  game = act(game, action(game).command);
  game = choose(game, 'confirm');
  assert.equal(
    itemInstances(game.heroes[0]).find(
      (item) => item.definitionId === 'echo-spool',
    ).state.echoRoomId,
    origin,
  );
  assert(
    game.rooms
      .find((room) => room.id === origin)
      .tokens.some((token) => token.label === '回声线头'),
  );
  const destination = actions(game).move[0];
  game = settle(act(game, { type: 'move', pos: destination }));
  game.heroes[0].moves = 0;
  game = act(game, action(game).command);
  const saved = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const command = {
    type: 'resolveChoice',
    requestId: pending(saved).uid,
    choice: 'confirm',
  };
  game = act(saved, command);
  assert.equal(game.heroes[0].pos, origin);
  assert.equal(game.heroes[0].moves, 0);
  assert(!game.heroes[0].items.includes('echo-spool'));
  assert(
    !game.rooms
      .find((room) => room.id === origin)
      .tokens.some((token) => token.label === '回声线头'),
  );
  assert.deepEqual(act(game, command), game);
});

test('过期确认会重新检查标记和回返距离', () => {
  let game = start();
  game = choose(act(game, action(game).command), 'confirm');
  game = settle(act(game, { type: 'move', pos: actions(game).move[0] }));
  game = act(game, action(game).command);
  game.heroes[0].stopped = true;
  const position = game.heroes[0].pos;
  game = choose(game, 'confirm');
  assert.equal(game.heroes[0].pos, position);
  assert(game.heroes[0].items.includes('echo-spool'));
});

test('四步内可以回返，五步之外保留线轴并说明范围', () => {
  let game = start();
  game = choose(act(game, action(game).command), 'confirm');
  const origin = game.heroes[0].pos;
  for (let index = 1; index <= 5; index++) {
    const id = `echo-route-${index}`;
    game.rooms.push({
      id,
      name: id,
      floor: 9,
      x: index,
      y: 0,
      doors: [],
      rotation: 0,
      roomBonus: [],
      states: {},
    });
    game.links.push([index === 1 ? origin : `echo-route-${index - 1}`, id]);
  }
  game.heroes[0].pos = 'echo-route-5';
  game = act(game, action(game).command);
  assert.match(pending(game).text, /5步外/);
  assert(game.heroes[0].items.includes('echo-spool'));
  game = settle(game);
  game.heroes[0].pos = 'echo-route-4';
  game = choose(act(game, action(game).command), 'confirm');
  assert.equal(game.heroes[0].pos, origin);
  assert(!game.heroes[0].items.includes('echo-spool'));
});

test('线头随实例转交，停止移动时不能返回', () => {
  let game = start();
  game = choose(act(game, action(game).command), 'confirm');
  const transfer = actions(game).itemAbilities.find(
    (entry) =>
      entry.handler === 'item.transfer' && entry.cardId === 'echo-spool',
  );
  game = settle(act(game, transfer.command));
  const newOwner = game.heroes[transfer.targetHeroId];
  assert.equal(
    itemInstances(newOwner).find((item) => item.definitionId === 'echo-spool')
      .state.echoRoomId,
    game.heroes[0].pos,
  );
  game.active = newOwner.id;
  newOwner.pos = 'entrance';
  newOwner.stopped = true;
  assert(!action(game));
  newOwner.stopped = false;
  assert(action(game));
});

test('回返触发目的地敌方陷阱且不重复抽房间牌', () => {
  let game = start();
  game = choose(act(game, action(game).command), 'confirm');
  const room = game.rooms.find((entry) => entry.id === game.heroes[0].pos);
  const destination = actions(game).move[0];
  game = settle(act(game, { type: 'move', pos: destination }));
  game.rooms.find((entry) => entry.id === room.id).traps = [
    { id: 'spool-trap', faction: 'wolves', ownerId: 2 },
  ];
  const deck = structuredClone(game.decks);
  game = choose(act(game, action(game).command), 'confirm');
  assert.equal(game.heroes[0].pos, room.id);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(
    game.rooms.find((entry) => entry.id === room.id).traps.length,
    0,
  );
  assert(!game.heroes[0].items.includes('echo-spool'));
  assert.deepEqual(game.decks, deck);
});

test('回返跨过中途陷阱，不影响同行者，也不改变剩余行动资源', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'echo-spool-hazard'));
  const origin = 'greenhouse';
  game.heroes[1].pos = 'foyer';
  assert(echoSpoolPath(game, game.heroes[0].pos, origin).includes('entrance'));
  const before = { moves: game.heroes[0].moves, attacked: game.heroes[0].attacked, interacted: game.heroes[0].interacted };
  game = choose(act(game, action(game).command), 'confirm');
  game = settle(restoreGameSave(JSON.parse(JSON.stringify(game))));
  assert.equal(game.heroes[0].pos, origin);
  assert.equal(game.heroes[1].pos, 'foyer');
  assert.equal(game.heroes[0].moves, before.moves);
  assert.equal(game.heroes[0].attacked, before.attacked);
  assert.equal(game.heroes[0].interacted, before.interacted);
  assert.equal(game.rooms.find((room) => room.id === 'entrance').traps.length, 1);
  assert(!game.events.some((event) => event.type === 'TrapTriggered' && event.trapId === 'playtest:echo-trap'));
});

test('联机确认只能由线轴持有者操作，线头标记公开', () => {
  const fixture = act(start(), action(start()).command);
  const service = createRoomService({
    gameFactory: () => structuredClone(fixture),
  });
  const host = service.create({ scenario: 'werewolf', count: 3 });
  const guest = service.join({ code: host.code });
  const started = service.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const request = started.game.queue[0];
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
  service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: command,
  });
  const visible = service.read(host.code, guest.key).game;
  assert(
    visible.rooms
      .find((room) => room.id === fixture.heroes[0].pos)
      .tokens.some((token) => token.label === '回声线头'),
  );
});
