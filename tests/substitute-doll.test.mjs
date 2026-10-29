import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  executeRuleEffects,
  pending,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const settle = (game) => drivePendingRequests(game, act);
const start = () => {
  const game = settle(createHauntPlaytest('werewolf', 23, 4, 'basic'));
  addItemInstance(game.heroes[0], 'substitute-doll', 'test:doll');
  return game;
};
const deal = (game, amount, extra = {}) =>
  executeRuleEffects(game, [
    {
      op: 'damage.deal',
      params: { heroId: 0, damageType: 'physical', amount, ...extra },
    },
  ]);
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice });

test('转移身体伤害排除攻击来源，目标不能拒绝且超出安全格数的伤害失效', () => {
  let game = start();
  game.heroes[2].stats.might = 2;
  game.heroes[2].stats.speed = 2;
  deal(game, 4, { sourceHeroId: 1 });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert(!pending(game).options.some((option) => option.value === 'hero:1'));
  assert(pending(game).options.some((option) => option.value === 'hero:2'));
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = choose(game, 'hero:2');
  assert(!game.heroes[0].items.includes('substitute-doll'));
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).heroId, 2);
  assert.equal(pending(game).nonlethal, true);
  assert.deepEqual(
    act(game, {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation: { might: 4, speed: 0 },
    }),
    game,
  );
  game = act(game, {
    type: 'allocateDamage',
    requestId: pending(game).uid,
    allocation: { might: 3, speed: 1 },
  });
  game = settle(game);
  assert.equal(game.heroes[2].stats.might, 1);
  assert.equal(game.heroes[2].stats.speed, 1);
  assert(!game.heroes[2].dead);
  assert.equal(
    game.events.findLast(
      (event) => event.type === 'DamageApplied' && event.heroId === 2,
    ).discardedAmount,
    2,
  );
});

test('放弃转移保留木偶，精神伤害不触发', () => {
  let game = start();
  deal(game, 2);
  game = choose(game, 'skip');
  assert.equal(pending(game).heroId, 0);
  assert(game.heroes[0].items.includes('substitute-doll'));
  game = settle(game);
  executeRuleEffects(game, [
    {
      op: 'damage.deal',
      params: { heroId: 0, amount: 1, damageType: 'mental' },
    },
  ]);
  assert.notEqual(pending(game)?.title, '替身木偶 · 转移伤害');
});

test('转移后原受伤者的防暴盾不会再收到反应请求', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'riot-shield', 'test:shield');
  game.heroes[2].pos = 'entrance';
  deal(game, 3, { sourceHeroId: 1 });
  assert.match(pending(game).title, /替身木偶/);
  game = choose(game, 'hero:2');
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).heroId, 2);
});

test('转移目标的防暴盾可继续响应，目标仍不能被致死', () => {
  let game = start();
  game.heroes[2].pos = 'entrance';
  game.heroes[2].stats.might = 1;
  game.heroes[2].stats.speed = 1;
  addItemInstance(game.heroes[2], 'riot-shield', 'target:shield');
  deal(game, 3, { sourceHeroId: 1 });
  game = choose(game, 'hero:2');
  assert.match(pending(game).title, /防暴盾/);
  assert.equal(pending(game).heroId, 2);
  game = choose(game, 'absorb:2');
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).heroId, 2);
  assert.equal(pending(game).total, 1);
  game = settle(game);
  assert(!game.heroes[2].dead);
  assert.equal(game.heroes[2].stats.might, 1);
  assert.equal(game.heroes[2].stats.speed, 1);
});

test('血月剧本中可转移给不是伤害来源的狼人角色，且伤害不致死', () => {
  let game = createHauntPlaytest('werewolf', 31, 3, 'substitute-doll-wolf');
  while (pending(game) && pending(game).kind !== 'choiceRequest') game = act(game, { type: 'advance', requestId: pending(game).uid });
  const wolf = game.heroes[0];
  assert.equal(wolf.faction, 'wolves');
  assert(pending(game).options.some((option) => option.value === 'hero:0'));
  assert(!pending(game).options.some((option) => option.value === 'hero:2'));
  game = choose(game, 'hero:0');
  while (pending(game) && pending(game).kind !== 'damage') game = act(game, { type: 'advance', requestId: pending(game).uid });
  assert.equal(pending(game).heroId, 0);
  assert(pending(game).nonlethal);
  game = settle(game);
  assert(!game.heroes[0].dead);
  assert.equal(game.heroes[0].stats.might, 1);
  assert.equal(game.heroes[0].stats.speed, 1);
});

test('枪击伤害的替身木偶不能选择射击者', () => {
  for (const focus of ['substitute-doll-shot', 'bloodmoon-silver-first']) {
    let game = settle(createHauntPlaytest('werewolf', 31, 3, focus));
    if (focus === 'bloodmoon-silver-first') addItemInstance(game.heroes[1], 'substitute-doll', 'test:shot-doll');
    const shot = actions(game).abilities.find((entry) => entry.handler === 'firearm.shoot' && (focus === 'substitute-doll-shot' ? !entry.silver : entry.silver));
    assert(shot);
    game = act(game, shot.command);
    if (pending(game).kind === 'diceRequest') {
      pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
      game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
    }
    assert.match(pending(game).title, /替身木偶/);
    assert(!pending(game).options.some((option) => option.value === 'hero:0'));
    assert(pending(game).options.some((option) => option.value === 'hero:2'));
  }
});

test('定向测试点直接提供转移选择', () => {
  const game = createHauntPlaytest('werewolf', 23, 3, 'substitute-doll');
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /替身木偶/);
});

test('联机由木偶持有者选目标，目标负责分配且没有拒绝选项', () => {
  const fixture = start();
  deal(fixture, 2);
  const service = createRoomService({
    gameFactory: () => structuredClone(fixture),
  });
  const host = service.create({ scenario: 'werewolf', count: 4 });
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
  const result = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: { type: 'resolveChoice', requestId: request.uid, choice: 'hero:1' },
  });
  assert.equal(result.game.queue[0].kind, 'privateRequest');
  const targetRequest = service.read(host.code, guest.key).game.queue[0];
  assert.equal(targetRequest.kind, 'damage');
  assert.equal(targetRequest.heroId, 1);
  assert(targetRequest.nonlethal);
});
