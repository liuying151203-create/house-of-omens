import test from 'node:test';
import assert from 'node:assert/strict';
import { act, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

function start() {
  let game = createHauntPlaytest('werewolf', 23, 3, 'luck-cup');
  game = act(game, { type: 'continueCard', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'diceRequest');
  return game;
}
function roll(game, face) {
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(face);
  return act(game, { type: 'resolveDice', requestId: pending(game).uid });
}
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });

test('事件失败后重掷整组并销毁骰盅，存档恢复后只执行一次', () => {
  let game = roll(start(), 0);
  assert.match(pending(game).title, /改运骰盅/);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  const requestId = pending(game).uid;
  const count =
    pending(game).workflow.locals.reaction.event.groups[0].dice.length;
  game = choose(game, 'reroll');
  assert(!game.heroes[0].items.includes('luck-cup'));
  const reroll = game.events.findLast(
    (entry) => entry.type === 'DiceRolled' && entry.sourceItemId === 'luck-cup',
  );
  assert.equal(reroll.count, count);
  assert.deepEqual(
    reroll.rerollDieIndices,
    Array.from({ length: count }, (_, index) => index),
  );
  assert.deepEqual(
    act(game, { type: 'resolveChoice', requestId, choice: 'reroll' }),
    game,
  );
  assert.equal(pending(game).total, reroll.rerollTotal);
});

test('检定成功不出现骰盅，拒绝使用时不消耗', () => {
  let game = roll(start(), 2);
  assert.notEqual(pending(game)?.title, '改运骰盅 · 重掷');
  assert(game.heroes[0].items.includes('luck-cup'));
  game = roll(start(), 0);
  game = choose(game, 'skip');
  assert(game.heroes[0].items.includes('luck-cup'));
  assert.equal(pending(game).total, 0);
});

test('命运戒指先结算，放弃后仍可使用骰盅', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'test:ring');
  game = roll(game, 0);
  assert.match(pending(game).title, /命运戒指/);
  game = choose(game, 'skip');
  assert.match(pending(game).title, /改运骰盅/);
  game = choose(game, 'reroll');
  assert(!game.heroes[0].items.includes('luck-cup'));
  assert.notEqual(pending(game)?.title, '命运戒指 · 命运回环');
});

test('命运戒指改变结果后，骰盅按最新成败决定是否出现', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'test:ring');
  const dice = Array(pending(game).rolls[0].count).fill(0);
  assert(dice.length >= 3);
  dice[0] = 2;
  dice[1] = 1;
  pending(game).rolls[0].dice = dice;
  game.seed = 4000000000;
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = choose(game, '0:2');
  if (pending(game)?.kind === 'ringResult')
    game = act(game, { type: 'advance' });
  assert.notEqual(pending(game)?.title, '改运骰盅 · 重掷');
  assert(game.heroes[0].items.includes('luck-cup'));

  game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'test:ring');
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  pending(game).rolls[0].dice[0] = 2;
  pending(game).rolls[0].dice[1] = 2;
  game.seed = 0;
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = choose(game, '0:0');
  if (pending(game)?.kind === 'ringResult')
    game = act(game, { type: 'advance' });
  assert.match(pending(game).title, /改运骰盅/);
});

test('战斗对抗失败不会触发骰盅', () => {
  let game = drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'fixed-monster'),
    act,
  );
  addItemInstance(game.heroes[0], 'luck-cup', 'test:cup');
  game = act(game, { type: 'attack', id: 'fixed-monster-test' });
  pending(game).rolls.forEach((group, index) => {
    group.dice = Array(group.count).fill(index ? 2 : 0);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.notEqual(pending(game)?.title, '改运骰盅 · 重掷');
  assert(game.heroes[0].items.includes('luck-cup'));
});

test('联机中只有骰盅持有者能选择重掷', () => {
  const fixture = roll(start(), 0);
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
    choice: 'reroll',
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
  assert(!result.game.heroes[0].items.includes('luck-cup'));
});
