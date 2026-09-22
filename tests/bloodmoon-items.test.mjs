import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  createGame,
  createSimulationGame,
  executeRuleEffects,
  restoreGameSave,
  movement,
  TRAITS,
} from '../lib/game-engine.mjs';
import { BLOODMOON_ITEMS } from '../lib/content/bloodmoon-items.mjs';
import { itemActionViews } from '../lib/content/item-actions.mjs';
import { addItemInstance, itemInstances } from '../lib/item-instances.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
import { canCleanseStatus } from '../lib/status-rules.mjs';
import { heroStatuses } from '../lib/hero-status.mjs';

function start() {
  return drivePendingRequests(createGame('werewolf', 23, 3), act);
}
const ability = (game, id, targetHeroId) =>
  actions(game).itemAbilities.find(
    (entry) =>
      entry.cardId === id &&
      entry.handler.startsWith('item.') &&
      (targetHeroId === undefined || entry.targetHeroId === targetHeroId),
  );
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: game.queue[0].uid, choice });
function withAntidote(targetHeroId = 1) {
  const game = start();
  addItemInstance(game.heroes[0], 'antidote', 'antidote:test');
  for (const status of [
    { id: 'bloodmoon-infection', label: '感染Ⅱ', level: 2 },
    { id: 'poison', label: '中毒' },
    { id: 'fear', label: '恐惧' },
    { id: 'immunity', label: '保护', until: 99 },
    { id: 'slow', label: '不可清除的减速', removable: false },
  ])
    executeRuleEffects(game, [
      { op: 'status.add', params: { heroId: targetHeroId, status } },
    ]);
  return game;
}

test('bloodmoon cards stay out of every existing random deck and ordinary werewolf fixture', () => {
  for (const scenario of ['mystery', 'bells', 'mirror', 'flood', 'werewolf']) {
    const game = createGame(scenario, 23, 3);
    assert.equal(game.decks.item.length, 10);
    assert(
      !game.decks.item.some((id) =>
        BLOODMOON_ITEMS.some((card) => card.id === id),
      ),
    );
  }
  const ordinary = createHauntPlaytest('werewolf', 23, 3);
  assert(!ordinary.heroes.some((hero) => hero.items.includes('antidote')));
  const directed = createHauntPlaytest('werewolf', 23, 3, 'bloodmoon-cards');
  assert(
    BLOODMOON_ITEMS.filter((card) =>
      ['boostTrait', 'cleanse'].includes(card.use),
    ).every((card) => directed.heroes[0].items.includes(card.id)),
  );
  assert.match(directed.queue[0].text, /不代表/);
  const target = directed.heroes.find((hero) =>
    hero.statuses.some((status) => status.id === 'bloodmoon-infection'),
  );
  const infection = heroStatuses(directed, target).find(
    (status) => status.label === '感染Ⅱ（测试）',
  );
  assert.equal(
    infection.count,
    undefined,
    'infection level is not a countdown',
  );
  assert.match(infection.description, /当前等级 2/);
});

test('potions raise the specified track beyond its start, cap at its right edge and cost no action', () => {
  for (const card of BLOODMOON_ITEMS.filter(
    (entry) => entry.use === 'boostTrait',
  )) {
    for (const nearCap of [false, true]) {
      let game = start();
      const hero = game.heroes[0],
        trait = card.useTrait;
      if (nearCap) hero.stats[trait] = hero.tracks[trait].length - 2;
      const before = structuredClone(hero);
      addItemInstance(hero, card.id, `potion:${card.id}`);
      const command = ability(game, card.id).command;
      game = act(game, command);
      const after = game.heroes[0];
      assert.equal(
        after.stats[trait],
        Math.min(before.stats[trait] + 2, hero.tracks[trait].length - 1),
      );
      assert(!after.items.includes(card.id));
      for (const field of [
        'moves',
        'attacked',
        'interacted',
        'rested',
        'stopped',
      ])
        assert.equal(after[field], before[field]);
      for (const other of Object.keys(TRAITS).filter((key) => key !== trait))
        assert.equal(after.stats[other], before.stats[other]);
      game = drivePendingRequests(game, act);
      assert.deepEqual(
        act(game, command),
        game,
        'repeating a consumed item command does nothing',
      );
    }
  }
});

test('potions can be transferred and dropped then picked up with their original instance', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'might-potion', 'potion:transfer');
  game = drivePendingRequests(
    act(game, {
      type: 'transferItem',
      instanceId: 'potion:transfer',
      targetHeroId: 1,
    }),
    act,
  );
  assert.equal(itemInstances(game.heroes[1])[0].instanceId, 'potion:transfer');
  game = act(game, { type: 'select', id: 1 });
  game = drivePendingRequests(
    act(game, { type: 'dropItem', instanceId: 'potion:transfer' }),
    act,
  );
  assert.equal(
    game.rooms.find((room) => room.id === game.heroes[1].pos).droppedItems[0]
      .instanceId,
    'potion:transfer',
  );
  const pickup = actions(game).abilities.find(
    (entry) => entry.handler === 'item.pickup',
  );
  game = drivePendingRequests(act(game, pickup.command), act);
  assert.equal(itemInstances(game.heroes[1])[0].instanceId, 'potion:transfer');
});

test('potion buffs survive other turns and saves, expire once at the owner next turn, and cannot be cleansed', () => {
  for (const factory of [createGame, createSimulationGame]) {
    let game = drivePendingRequests(factory('werewolf', 23, 3), act);
    game = act(game, { type: 'select', id: 1 });
    const original = structuredClone(game.heroes[1].stats);
    for (const card of BLOODMOON_ITEMS.filter(
      (entry) => entry.use === 'boostTrait',
    )) {
      addItemInstance(game.heroes[1], card.id, `buff:${card.id}`);
      game = drivePendingRequests(
        act(game, ability(game, card.id).command),
        act,
      );
    }
    const buffs = game.heroes[1].statuses;
    assert.equal(buffs.length, 3);
    assert.equal(new Set(buffs.map((status) => status.instanceId)).size, 3);
    assert(buffs.every((status) => !canCleanseStatus(status)));
    assert(
      heroStatuses(game, game.heroes[1]).every((status) =>
        /下次回合开始/.test(status.description),
      ),
    );
    game = act(game, { type: 'select', id: 0 });
    game = act(game, { type: 'select', id: 1 });
    assert.deepEqual(
      game.heroes[1].statuses,
      buffs,
      'reselecting within one round does not expire buffs',
    );
    game = drivePendingRequests(act(game, { type: 'endRound' }), act);
    assert.equal(game.active, 0);
    assert.deepEqual(
      game.heroes[1].statuses,
      buffs,
      'another hero starting the next round does not expire buffs',
    );
    game = restoreGameSave(JSON.parse(JSON.stringify(game)));
    assert(game);
    game = drivePendingRequests(act(game, { type: 'select', id: 1 }), act);
    assert.equal(game.heroes[1].statuses.length, 0);
    for (const trait of ['might', 'speed', 'sanity'])
      assert.equal(game.heroes[1].stats[trait], original[trait] + 1);
    assert.equal(game.heroes[1].moves, movement(game.heroes[1], game));
    assert.equal(
      game.events.filter(
        (event) => event.type === 'StatusRemoved' && event.reason === 'expired',
      ).length,
      3,
    );
    const expiredStats = structuredClone(game.heroes[1].stats);
    game = restoreGameSave(JSON.parse(JSON.stringify(game)));
    game = drivePendingRequests(act(game, { type: 'endRound' }), act);
    game = drivePendingRequests(act(game, { type: 'select', id: 1 }), act);
    assert.deepEqual(
      game.heroes[1].stats,
      expiredStats,
      'restoring an expired buff cannot roll back again',
    );
  }
});

test('potion expiry subtracts from the current track position and never kills, including at the right cap', () => {
  for (const factory of [createGame, createSimulationGame]) {
    for (const card of BLOODMOON_ITEMS.filter(
      (entry) => entry.use === 'boostTrait',
    )) {
      for (const position of [1, 2, 'cap']) {
        let game = drivePendingRequests(
          createHauntPlaytest('werewolf', 23, 3),
          act,
        );
        game.executionMode = factory('werewolf', 23, 3).executionMode;
        for (const enemy of game.enemies) {
          enemy.pos = 'basement';
          enemy.speed = 0;
        }
        const trait = card.useTrait,
          cap = game.heroes[0].tracks[trait].length - 1;
        if (position === 'cap') game.heroes[0].stats[trait] = cap;
        addItemInstance(game.heroes[0], card.id, `expiry:${card.id}`);
        game = drivePendingRequests(
          act(game, ability(game, card.id).command),
          act,
        );
        if (position !== 'cap') game.heroes[0].stats[trait] = position;
        game = drivePendingRequests(act(game, { type: 'endRound' }), act);
        assert.equal(
          game.heroes[0].stats[trait],
          position === 'cap' ? cap - 1 : 1,
        );
        assert.equal(game.heroes[0].dead, false);
        assert.equal(game.heroes[0].statuses.length, 0);
      }
    }
  }
});

test('potion expiration reactions can pause and restore without repeating the rollback', () => {
  let game = start();
  game = act(game, { type: 'select', id: 1 });
  addItemInstance(game.heroes[1], 'might-potion', 'potion:reaction');
  game = drivePendingRequests(
    act(game, ability(game, 'might-potion').command),
    act,
  );
  const boosted = game.heroes[1].stats.might;
  game = drivePendingRequests(act(game, { type: 'endRound' }), act);
  game.ruleTriggers = ['TurnStarting', 'StatusExpired'].map((when) => ({
    id: `test:${when}`,
    sourceId: `test:${when}`,
    when,
    priority: 30,
    effects: [
      {
        op: 'reaction.request',
        params: {
          heroId: 1,
          title: '测试到期反应',
          options: [
            { id: 'continue', label: '继续', effects: [] },
            { id: 'skip', label: '跳过', effects: [] },
          ],
        },
      },
    ],
  }));
  game = act(game, { type: 'select', id: 1 });
  assert.equal(
    game.queue[0].workflow.locals.reaction.resume.event.when,
    'TurnStarting',
  );
  assert.equal(game.heroes[1].stats.might, boosted);
  game = choose(restoreGameSave(JSON.parse(JSON.stringify(game))), 'continue');
  assert.equal(
    game.queue[0].workflow.locals.reaction.resume.event.when,
    'StatusExpired',
  );
  assert.equal(game.heroes[1].stats.might, boosted - 1);
  assert.equal(game.heroes[1].statuses.length, 0);
  game = choose(restoreGameSave(JSON.parse(JSON.stringify(game))), 'continue');
  assert.equal(game.queue.length, 0);
  assert.equal(game.heroes[1].stats.might, boosted - 1);
});

test('antidote selects up to two statuses, persists choices and commits removal and consumption together', () => {
  let game = withAntidote();
  const stats = structuredClone(game.heroes[1].stats),
    statuses = structuredClone(game.heroes[1].statuses);
  game = act(game, ability(game, 'antidote', 1).command);
  assert.equal(
    game.queue[0].heroId,
    0,
    'the item user chooses, not the target',
  );
  assert.deepEqual(
    game.queue[0].options.map((option) => option.value),
    ['status:0', 'status:1', 'status:2', 'cancel'],
  );
  game = choose(game, 'status:0');
  assert.deepEqual(game.heroes[1].statuses, statuses);
  assert(game.heroes[0].items.includes('antidote'));
  game = restoreGameSave(JSON.parse(JSON.stringify(game)));
  assert(game);
  game = choose(game, 'status:2');
  assert.deepEqual(
    game.queue[0].options.map((option) => option.value),
    ['confirm', 'cancel'],
  );
  assert.deepEqual(
    choose(game, 'status:1'),
    game,
    'a third status cannot be selected',
  );
  const confirmation = {
    type: 'resolveChoice',
    requestId: game.queue[0].uid,
    choice: 'confirm',
  };
  game = act(game, confirmation);
  assert.deepEqual(
    game.heroes[1].statuses.map((status) => status.id),
    ['poison', 'immunity', 'slow'],
  );
  assert.deepEqual(
    game.heroes[1].stats,
    stats,
    'removing infection does not undo track changes',
  );
  assert(!game.heroes[0].items.includes('antidote'));
  assert.equal(
    game.events.filter((event) => event.type === 'ItemUsed').length,
    1,
  );
  assert.deepEqual(act(game, confirmation), game);
});

test('antidote supports self use, one-status confirmation and cancellation without payment', () => {
  let game = withAntidote(0);
  const original = structuredClone(game.heroes[0]);
  game = act(game, ability(game, 'antidote', 0).command);
  game = choose(game, 'status:0');
  game = choose(game, 'cancel');
  assert.deepEqual(game.heroes[0], original);
  assert.equal(game.queue.length, 0);
  game = act(game, ability(game, 'antidote', 0).command);
  game = choose(game, 'status:1');
  game = choose(game, 'confirm');
  assert.equal(game.heroes[0].statuses.length, 4);
  assert(!game.heroes[0].items.includes('antidote'));
});

test('antidote rejects invalid targets and stale status instances without consuming the item', () => {
  const clean = start();
  addItemInstance(clean.heroes[0], 'antidote', 'antidote:clean');
  assert(
    itemActionViews(clean, clean.heroes[0], TRAITS).every(
      (entry) => !entry.available,
    ),
  );
  let game = withAntidote();
  const command = ability(game, 'antidote', 1).command;
  game.heroes[1].pos = 'upper';
  assert.deepEqual(act(game, command), game);
  game.heroes[1].pos = game.heroes[0].pos;
  game.heroes[1].traitor = true;
  assert.deepEqual(act(game, command), game);
  game.heroes[1].traitor = false;
  game = choose(act(game, command), 'status:0');
  game.heroes[1].statuses[0].instanceId = 'replaced';
  const before = structuredClone(game.heroes);
  game = choose(game, 'confirm');
  assert.deepEqual(game.heroes, before);
  assert(!game.events.some((event) => event.type === 'ItemUsed'));
  for (const status of [
    { id: 'immunity' },
    { id: 'unknown' },
    { id: 'infection', removable: false },
  ])
    assert.equal(canCleanseStatus(status), false);
  assert.equal(
    canCleanseStatus({ id: 'custom-debuff', negative: true, removable: true }),
    true,
  );
});

test('only the antidote user can answer in multiplayer; timeout cancels without consumption', () => {
  let clock = 1000;
  const service = createRoomService({
    now: () => clock,
    gameFactory: () => {
      const game = withAntidote();
      return act(game, ability(game, 'antidote', 1).command);
    },
  });
  const host = service.create({ scenario: 'werewolf', count: 3 });
  const guest = service.join({ code: host.code });
  const started = service.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const request = started.game.queue[0];
  assert.equal(request.workflow.locals, undefined);
  const guestView = service.read(host.code, guest.key);
  assert.equal(guestView.game.queue[0].kind, 'privateRequest');
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: started.revision,
        action: {
          type: 'resolveChoice',
          requestId: request.uid,
          choice: 'status:0',
        },
      }),
    /当前角色/,
  );
  clock += 30001;
  const cancelled = service.read(host.code, host.key);
  assert.equal(cancelled.game.queue.length, 0);
  assert(cancelled.game.heroes[0].items.includes('antidote'));
  assert.equal(cancelled.game.heroes[1].statuses.length, 5);
});
