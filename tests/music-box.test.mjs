import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';

const settle = (game) => drivePendingRequests(game, act);
const choice = (game, value) =>
  act(game, {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: value,
  });
function startBox() {
  const game = settle(createHauntPlaytest('werewolf', 23, 3, 'old-music-box'));
  const action = actions(game).itemAbilities.find(
    (entry) =>
      entry.cardId === 'old-music-box' && entry.handler === 'item.musicBox',
  );
  assert(action);
  return act(game, action.command);
}

test('旧八音盒检定成功可选择两人，确认后各恢复一格并可恢复存档', () => {
  let game = startBox();
  assert.equal(pending(game).kind, 'diceRequest');
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(2);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'choiceRequest');
  const before = game.heroes.map((hero) => hero.stats.sanity);
  game = choice(game, 'hero:0');
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  assert(game);
  game = choice(game, 'hero:1');
  game = choice(game, 'confirm');
  assert.equal(game.heroes[0].stats.sanity, before[0] + 1);
  assert.equal(game.heroes[1].stats.sanity, before[1] + 1);
  game = settle(game);
  assert(
    !actions(game).itemAbilities.some(
      (entry) => entry.handler === 'item.musicBox',
    ),
  );
});

test('旧八音盒失败不恢复，仍消耗本轮机会且物品不销毁', () => {
  let game = startBox();
  const before = game.heroes.map((hero) => hero.stats.sanity);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = settle(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
  assert.deepEqual(
    game.heroes.map((hero) => hero.stats.sanity),
    before,
  );
  assert(game.heroes[0].items.includes('old-music-box'));
  assert(
    !actions(game).itemAbilities.some(
      (entry) => entry.handler === 'item.musicBox',
    ),
  );
});

test('旧八音盒成功流程完成后派发检定生命周期事件', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'old-music-box'));
  game.ruleTriggers = [
    {
      id: 'box-after-check',
      sourceId: 'test:box',
      when: 'AfterCheck',
      condition: { checkKind: 'item.musicBox', success: true, totalAtLeast: 4 },
      effects: [
        {
          op: 'status.add',
          params: {
            heroId: '$event.heroId',
            status: { id: 'box-check-finished' },
          },
        },
      ],
    },
  ];
  const action = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.musicBox',
  );
  game = act(game, action.command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(2);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = choice(game, 'hero:0');
  game = choice(game, 'confirm');
  game = settle(game);
  assert(
    game.heroes[0].statuses.some(
      (status) => status.id === 'box-check-finished',
    ),
  );
});

test('旧八音盒目标不能重复，满起始理智不会超过上限，可放弃恢复', () => {
  let game = startBox();
  game.heroes[0].stats.sanity = game.heroes[0].start.sanity;
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(2);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  game = choice(game, 'hero:0');
  assert(!pending(game).options.some((option) => option.value === 'hero:0'));
  const repeated = choice(game, 'hero:0');
  assert.deepEqual(repeated, game);
  game = choice(game, 'confirm');
  assert.equal(game.heroes[0].stats.sanity, game.heroes[0].start.sanity);
  game = settle(game);
  assert(game.heroes[0].items.includes('old-music-box'));
});

test('旧八音盒联机选择仅由使用者操作', () => {
  let fixture = startBox();
  pending(fixture).rolls[0].dice = Array(pending(fixture).rolls[0].count).fill(
    2,
  );
  fixture = act(fixture, {
    type: 'resolveDice',
    requestId: pending(fixture).uid,
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
  const request = started.game.queue[0];
  assert.equal(
    service.read(host.code, guest.key).game.queue[0].kind,
    'privateRequest',
  );
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: started.revision,
        action: {
          type: 'resolveChoice',
          requestId: request.uid,
          choice: 'hero:0',
        },
      }),
    /权限|等待|操作/,
  );
  const next = service.update(host.code, host.key, {
    type: 'action',
    revision: started.revision,
    action: { type: 'resolveChoice', requestId: request.uid, choice: 'hero:0' },
  });
  assert.equal(next.game.queue[0].kind, 'choiceRequest');
});

test('旧八音盒检定与命运戒指的重掷反应可连续恢复', () => {
  let game = settle(createHauntPlaytest('werewolf', 23, 3, 'old-music-box'));
  addItemInstance(game.heroes[0], 'family-ring', 'box:ring');
  const action = actions(game).itemAbilities.find(
    (entry) => entry.handler === 'item.musicBox',
  );
  game = act(game, action.command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(2);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.match(pending(game).title, /命运戒指/);
  game = choice(restoreGameSave(JSON.parse(JSON.stringify(game))), 'skip');
  assert.match(pending(game).title, /旧八音盒/);
  game = choice(game, 'hero:0');
  game = choice(game, 'confirm');
  assert.equal(game.heroes[0].stats.sanity, game.heroes[0].start.sanity);
});

test('旧八音盒本轮已使用后交付不会刷新次数', () => {
  let game = startBox();
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = settle(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
  const owner = game.heroes[0];
  const target = game.heroes.find(
    (hero) => hero.id !== owner.id && !hero.traitor && hero.pos === owner.pos,
  );
  const instanceId = owner.itemInstances.find(
    (item) => item.definitionId === 'old-music-box',
  ).instanceId;
  game = settle(
    act(game, { type: 'transferItem', instanceId, targetHeroId: target.id }),
  );
  game = act(game, { type: 'select', id: target.id });
  assert(
    !actions(game).itemAbilities.some(
      (action) => action.handler === 'item.musicBox',
    ),
  );
  assert(game.heroes[target.id].items.includes('old-music-box'));
});
