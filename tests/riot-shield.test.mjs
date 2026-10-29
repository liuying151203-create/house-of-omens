import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  executeRuleEffects,
  pending,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import {
  addItemInstance,
  itemInstances,
  transferItemInstance,
} from '../lib/item-instances.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const start = () =>
  drivePendingRequests(
    createHauntPlaytest('werewolf', 23, 3, 'riot-shield'),
    act,
  );
const deal = (game, heroId, amount, type = 'physical') =>
  executeRuleEffects(game, [
    {
      op: 'damage.deal',
      params: { heroId, amount, damageType: type, sourceKind: 'test' },
    },
  ]);
const choose = (game, value) =>
  act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: value,
  });
const shield = (game) =>
  itemInstances(game.heroes[0]).find(
    (item) => item.definitionId === 'riot-shield',
  );

test('防暴盾定向测试通过真实敌人攻击触发防护', () => {
  let game = act(start(), { type: 'endRound' });
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls.forEach((roll, index) => {
    roll.dice = Array(roll.count).fill(index === 0 ? 2 : 0);
  });
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /防暴盾/);
});

test('同室队友受伤时持盾者选择承受部分伤害，原目标仍至少承受1点', () => {
  let game = start();
  deal(game, 1, 3);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.equal(pending(game).heroId, 0);
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  game = choose(game, 'absorb:2');
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).heroId, 1);
  assert.equal(pending(game).total, 1);
  assert.equal(shield(game).state.charges, 2);
});

test('盾牌累计最多承受4点，耗尽后损毁，超出耐久的伤害由目标承受', () => {
  let game = start();
  deal(game, 1, 3);
  game = choose(game, 'absorb:2');
  game = drivePendingRequests(game, act);
  deal(game, 1, 5);
  assert(!pending(game).options.some((option) => option.value === 'absorb:3'));
  game = choose(game, 'absorb:2');
  assert.equal(pending(game).heroId, 1);
  assert.equal(pending(game).total, 3);
  assert(!shield(game));
});

test('拒绝防护、同室持盾者自身、不同房间及精神伤害', () => {
  let game = start();
  deal(game, 1, 2);
  game = choose(game, 'skip');
  assert.equal(pending(game).heroId, 1);
  assert.equal(pending(game).total, 2);
  game = drivePendingRequests(game, act);
  deal(game, 0, 2);
  assert.equal(pending(game).kind, 'choiceRequest');
  game = choose(game, 'skip');
  game = drivePendingRequests(game, act);
  game.heroes[1].pos = 'entrance';
  deal(game, 1, 2);
  assert.equal(pending(game).kind, 'damage');
  game = drivePendingRequests(game, act);
  deal(game, 0, 2, 'mental');
  assert.equal(pending(game).kind, 'damage');
});

test('沉重铠甲减伤先结算，盾牌只能承受剩余伤害中超过1点的部分', () => {
  let game = start();
  addItemInstance(game.heroes[1], 'heavy-armor', 'test:heavy');
  deal(game, 1, 3);
  assert.equal(pending(game).kind, 'choiceRequest');
  assert(pending(game).options.some((option) => option.value === 'absorb:1'));
  assert(!pending(game).options.some((option) => option.value === 'absorb:2'));
  game = choose(game, 'absorb:1');
  assert.equal(pending(game).heroId, 1);
  assert.equal(pending(game).total, 1);
});

test('耐久随盾牌实例转交，新持有人决定是否防护', () => {
  let game = start();
  deal(game, 1, 3);
  game = drivePendingRequests(choose(game, 'absorb:2'), act);
  assert(
    transferItemInstance(
      game.heroes[0],
      game.heroes[1],
      'playtest:riot-shield',
    ),
  );
  assert.equal(
    itemInstances(game.heroes[1]).find(
      (item) => item.definitionId === 'riot-shield',
    ).state.charges,
    2,
  );
  deal(game, 0, 3);
  assert.equal(pending(game).heroId, 1);
  game = choose(game, 'absorb:2');
  assert.equal(pending(game).heroId, 0);
  assert.equal(pending(game).total, 1);
  assert(!game.heroes[1].items.includes('riot-shield'));
});

test('联机防护决定仅由持盾者作出', () => {
  const fixture = start();
  deal(fixture, 1, 3);
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
    choice: 'absorb:2',
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
  assert.equal(result.game.queue[0].kind, 'privateRequest');
  assert.equal(service.read(host.code, guest.key).game.queue[0].heroId, 1);
});
