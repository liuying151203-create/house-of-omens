import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createGame,
  createSimulationGame,
  act,
  actions,
  executeRuleEffects,
  restoreGameSave,
  connections,
  ROOM_DECK,
} from '../lib/game-engine.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance, itemInstances } from '../lib/item-instances.mjs';
import { BLOODMOON_ROOMS } from '../lib/content/bloodmoon-rooms.mjs';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { roomBadges } from '../lib/room-badges.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
import { POTION_USAGE_RULE } from '../lib/content/bloodmoon-items.mjs';

const settle = (game) => drivePendingRequests(game, act);
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));
const choose = (game, choice) =>
  act(game, { type: 'resolveChoice', requestId: game.queue[0].uid, choice });
const ability = (game, kind, instanceId) =>
  actions(game).abilities.find(
    (entry) =>
      entry.kind === kind && (!instanceId || entry.instanceId === instanceId),
  );
function start(factory = createGame) {
  const game = settle(factory('werewolf', 173, 3));
  for (const [index, definition] of BLOODMOON_ROOMS.entries())
    game.rooms.push({
      ...structuredClone(definition),
      floor: -1,
      x: -index - 1,
      y: 0,
      rotation: 1,
      roomBonus: [],
      states: {},
      target: null,
      done: false,
    });
  game.heroes[0].pos = 'bloodmoon-laboratory';
  return game;
}
function dice(game, faces) {
  assert.equal(game.queue[0].kind, 'diceRequest');
  for (const group of game.queue[0].rolls)
    group.dice = Array.from({ length: group.count }, (_, index) =>
      Array.isArray(faces) ? faces[index % faces.length] : faces,
    );
  return act(game, { type: 'resolveDice', requestId: game.queue[0].uid });
}

test('new map tiles are isolated, discoverable from an explicit pool and connected in the fixture', () => {
  const game = start();
  assert.equal(
    game.decks.rooms.length,
    ROOM_DECK.filter((tile) => !tile.supply).length,
  );
  assert(BLOODMOON_ROOMS.every((tile) => !game.decks.rooms.includes(tile.id)));
  let discovery = settle(createGame('werewolf', 31, 3));
  discovery.heroes[0].pos = 'basement';
  discovery.decks.rooms = ['bloodmoon-laboratory'];
  discovery = act(discovery, { type: 'explore', dir: 1 });
  assert.equal(discovery.queue[0].tileId, 'bloodmoon-laboratory');
  discovery = settle(act(discovery, { type: 'place' }));
  assert(ability(discovery, 'craft'));
  const fixture = settle(
    createHauntPlaytest('werewolf', 31, 3, 'bloodmoon-mechanics'),
  );
  assert(connections(fixture, 'bloodmoon-laboratory').includes('basement'));
  assert(connections(fixture, 'bloodmoon-boiler').includes('sterilization'));
});

test('crafting consumes the shared interaction, persists production limits, and survives choice restore', () => {
  for (const factory of [createGame, createSimulationGame]) {
    let game = start(factory);
    addItemInstance(game.heroes[0], 'family-ring', 'material');
    game = act(game, ability(game, 'craft').command);
    assert(!ability(game, 'craft'));
    game = dice(game, 2);
    if (game.queue[0]?.title.includes('家族戒指')) game = choose(game, 'skip');
    assert.equal(game.queue[0].title, '选择制备药剂');
    game = choose(restore(game), 'might-potion');
    assert.deepEqual(game.bloodmoon.crafted, ['might-potion']);
    assert.equal(game.heroes[0].interacted, true);
    assert.equal(ability(game, 'smelt'), undefined);
    const potion = actions(game).itemAbilities.find(
      (entry) => entry.cardId === 'might-potion',
    );
    game = settle(act(game, potion.command));
    game = settle(act(game, { type: 'endRound' }));
    game = act(game, ability(game, 'craft').command);
    game = dice(game, 2);
    if (game.queue[0]?.title.includes('家族戒指')) game = choose(game, 'skip');
    assert(
      !game.queue[0].options.some((option) => option.value === 'might-potion'),
    );
    game = choose(game, 'speed-potion');
    assert.deepEqual(game.bloodmoon.crafted, ['might-potion', 'speed-potion']);
  }
});

test('crafting states shared potion rules once and keeps each option attribute and production limit', () => {
  let game = start();
  game = act(game, ability(game, 'craft').command);
  const request = game.queue[0];
  assert(request.text.includes('知识 5+'));
  assert(request.text.includes(POTION_USAGE_RULE));
  assert.equal(
    JSON.stringify(request.outcomes).includes('下次回合开始'),
    false,
  );
  assert.match(
    request.outcomes[0].effect,
    /力量药剂（力量轨道）.*速度药剂（速度轨道）.*神智药剂（理智轨道）/,
  );
  assert.match(request.outcomes[1].effect, /本轮制药机会已使用/);
  game = dice(game, 2);
  const choice = game.queue[0];
  assert.equal(choice.kind, 'choiceRequest');
  assert(choice.text.includes(POTION_USAGE_RULE));
  assert.match(choice.text, /消耗后不能重制/);
  assert.deepEqual(
    choice.options.map((entry) => entry.detail),
    ['力量轨道', '速度轨道', '理智轨道'],
  );
});

test('failed production spends an attempt; smelting follows the material across trades and cannot exceed two types', () => {
  let game = start();
  game.heroes[1].pos = game.heroes[0].pos;
  addItemInstance(game.heroes[0], 'saint-badge', 'smelt:badge');
  game = dice(act(game, ability(game, 'craft').command), 0);
  assert(!ability(game, 'craft'));
  assert.equal(game.heroes[0].interacted, true);
  assert.equal(ability(game, 'smelt'), undefined);
  game = settle(act(game, { type: 'endRound' }));
  game = dice(act(game, ability(game, 'smelt').command), 0);
  assert(game.heroes[0].items.includes('saint-badge'));
  assert(!ability(game, 'smelt'));
  game = settle(
    act(game, {
      type: 'transferItem',
      instanceId: 'smelt:badge',
      targetHeroId: 1,
    }),
  );
  game = act(game, { type: 'select', id: 1 });
  assert(!ability(game, 'smelt'));
  game = settle(act(game, { type: 'endRound' }));
  game = act(game, { type: 'select', id: 1 });
  game = dice(act(game, ability(game, 'smelt').command), 2);
  assert(!game.heroes[1].items.includes('saint-badge'));
  assert(game.heroes[1].items.includes('silver-bullet'));
  addItemInstance(game.heroes[1], 'saint-badge', 'duplicate');
  assert(!ability(game, 'smelt'));
});

test('ring permits only own 0/2 dice, records a round on its instance, and resumes the original check once', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'ring');
  game.heroes[1].pos = game.heroes[0].pos;
  game = dice(act(game, ability(game, 'craft').command), [0, 1, 2]);
  assert.equal(game.queue[0].title, '家族戒指 · 命运回环');
  assert(!game.queue[0].options.some((option) => option.value === '0:1'));
  assert.deepEqual(choose(game, '0:1'), game);
  game = choose(restore(game), '0:0');
  assert.equal(game.queue[0].kind, 'ringResult');
  assert.equal(game.queue[0].before, 0);
  assert.equal(game.queue[0].dice[0], game.queue[0].after);
  assert.equal(
    game.queue[0].total,
    game.queue[0].dice.reduce((sum, face) => sum + face, 0),
  );
  assert.equal(act(game, { type: 'endHero' }).queue[0].kind, 'ringResult');
  game = settle(restore(game));
  assert.equal(
    itemInstances(game.heroes[0]).find((item) => item.instanceId === 'ring')
      .state.ringRound,
    game.round,
  );
  game = settle(
    act(game, { type: 'transferItem', instanceId: 'ring', targetHeroId: 1 }),
  );
  game = act(game, { type: 'select', id: 1 });
  game = dice(act(game, ability(game, 'craft').command), 0);
  assert.equal(game.queue.length, 0, 'trading does not refresh the reroll');
});

test('a successful craft shows the rerolled die before asking which potion to make', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'family-ring', 'ring:craft');
  game = dice(act(game, ability(game, 'craft').command), [2, 2, 0]);
  assert.equal(game.queue[0].kind, 'choiceRequest');
  game = choose(game, '0:2');
  assert.equal(game.queue[0].kind, 'ringResult');
  assert.equal(game.queue[0].sourceRequestUid > 0, true);
  assert(game.queue.some((request) => request.title === '选择制备药剂'));
  game = act(game, { type: 'advance' });
  assert.equal(game.queue[0].title, '选择制备药剂');
});

test('badge can block initial status or upgrades, preserves history, and carries effect continuations through restore', () => {
  for (const face of [0, 2]) {
    let game = start();
    addItemInstance(game.heroes[0], 'saint-badge', 'badge');
    game.heroes[1].pos = game.heroes[0].pos;
    executeRuleEffects(game, [
      {
        op: 'status.add',
        params: {
          heroId: 1,
          status: { id: 'bloodmoon-infection', label: '感染Ⅰ', level: 1 },
        },
      },
    ]);
    const stats = structuredClone(game.heroes[1].stats);
    const result = executeRuleEffects(game, [
      {
        op: 'status.gain',
        params: {
          heroId: 1,
          status: { id: 'bloodmoon-infection', label: '感染Ⅱ', level: 2 },
        },
      },
      { op: 'status.add', params: { heroId: 1, status: { id: 'after-gain' } } },
    ]);
    assert(result.paused);
    assert.equal(game.heroes[1].statuses[0].level, 1);
    game = choose(restore(game), 'protect');
    game = dice(restore(game), face);
    assert.equal(game.queue.length, 0);
    assert.equal(game.heroes[1].statuses[0].level, face === 2 ? 1 : 2);
    assert(
      game.heroes[1].statuses.some((status) => status.id === 'after-gain'),
    );
    assert.deepEqual(game.heroes[1].stats, stats);
    assert.equal(itemInstances(game.heroes[0])[0].state.badgeRound, game.round);
    executeRuleEffects(game, [
      { op: 'status.gain', params: { heroId: 1, status: { id: 'poison' } } },
    ]);
    assert.equal(
      game.queue.length,
      0,
      'an attempted ward is spent for this round',
    );
    assert(game.heroes[1].statuses.some((status) => status.id === 'poison'));
  }
});

test('badge skip is free, distant/opposing/positive statuses do not offer protection, and a success cancels later badges', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'saint-badge', 'badge:0');
  game.heroes[1].pos = game.heroes[0].pos;
  addItemInstance(game.heroes[1], 'saint-badge', 'badge:1');
  executeRuleEffects(game, [
    { op: 'status.gain', params: { heroId: 0, status: { id: 'poison' } } },
  ]);
  game = dice(choose(game, 'protect'), 2);
  assert.equal(game.queue.length, 0);
  assert.equal(game.heroes[0].statuses.length, 0);
  assert.equal(itemInstances(game.heroes[1])[0].state.badgeRound, undefined);
  executeRuleEffects(game, [
    { op: 'status.gain', params: { heroId: 1, status: { id: 'fear' } } },
  ]);
  game = choose(game, 'skip');
  assert.equal(itemInstances(game.heroes[1])[0].state.badgeRound, undefined);
  game.heroes[1].pos = 'upper';
  for (const status of [
    { id: 'custom-positive' },
    { id: 'poison', removable: false },
  ]) {
    executeRuleEffects(game, [
      { op: 'status.gain', params: { heroId: 2, status } },
    ]);
    assert.equal(game.queue.length, 0);
  }
});

test('sterilization lowers one level, costs once per game, can be declined and never rolls back stats', () => {
  let game = start();
  game.heroes[0].pos = 'sterilization';
  executeRuleEffects(game, [
    {
      op: 'status.add',
      params: {
        heroId: 0,
        status: { id: 'bloodmoon-infection', level: 2, label: '感染Ⅱ' },
      },
    },
  ]);
  const stats = structuredClone(game.heroes[0].stats);
  game = act(game, { type: 'endHero' });
  assert.equal(game.queue[0].title, '消毒杀菌室 · 净化');
  game = choose(restore(game), 'status:0');
  assert.equal(game.heroes[0].statuses[0].level, 1);
  assert.equal(game.heroes[0].sterilizationUsed, true);
  assert.deepEqual(game.heroes[0].stats, stats);
  game = settle(act(game, { type: 'endRound' }));
  game = act(game, { type: 'endHero' });
  assert.equal(game.queue[0].kind, 'turnStart');
  assert.equal(settle(game).queue.length, 0);
});

test('steam activates after the owner turn, tests each room independently, stops movement on failure and expires at owner start', () => {
  let game = start();
  // 锅炉房位于直廊中间，旋转后的东西门分别连实验室与消毒室。
  game.heroes[0].pos = 'bloodmoon-boiler';
  game.heroes[1].pos = 'bloodmoon-laboratory';
  game.heroes[2].pos = 'sterilization';
  game = act(game, ability(game, 'valve').command);
  assert.equal(game.heroes[0].interacted, true);
  assert.equal(game.bloodmoon.steam[0].active, false);
  assert(!ability(game, 'valve'));
  game = act(game, { type: 'endHero' });
  assert.equal(game.bloodmoon.steam[0].active, true);
  assert.deepEqual(
    new Set(game.bloodmoon.steam[0].roomIds),
    new Set(['bloodmoon-laboratory', 'sterilization']),
  );
  assert.equal(game.queue[0].kind, 'turnStart');
  game = act(game, { type: 'advance' });
  assert.equal(game.queue[0].title, '锅炉房 · 避开蒸汽');
  assert.equal(game.queue[0].sourceRoomId, 'bloodmoon-boiler');
  assert.match(game.queue[0].outcomes[1].effect, /受到 1 点肉体伤害/);
  game = dice(restore(game), 2);
  game.heroes[1].moves = 10;
  game = act(game, { type: 'move', pos: 'bloodmoon-boiler' });
  game = act(game, { type: 'move', pos: 'sterilization' });
  assert.equal(game.queue[0].title, '锅炉房 · 避开蒸汽');
  const before = game.heroes[1].stats.might + game.heroes[1].stats.speed;
  game = settle(dice(restore(game), 0));
  assert.equal(game.heroes[1].moves, 0);
  assert.equal(game.heroes[1].stopped, true);
  assert.equal(
    game.heroes[1].stats.might + game.heroes[1].stats.speed,
    before - 1,
  );
  game = settle(act(game, { type: 'endRound' }));
  assert.equal(game.bloodmoon.steam.length, 0);
});

test('traps are faction-private and stop an enemy at the intermediate room, not the path endpoint', () => {
  for (const factory of [createGame, createSimulationGame]) {
    let game = start(factory);
    game.phase = 'haunt';
    game.heroes[0].pos = 'foyer';
    addItemInstance(game.heroes[0], 'bear-trap', 'trap');
    game.enemies = [
      {
        id: 'test-wolf',
        name: '测试狼人',
        kind: 'wolf',
        pos: 'stairs',
        hp: 8,
        maxHp: 8,
        speed: 3,
        might: 1,
      },
    ];
    game = act(game, ability(game, 'trap').command);
    assert(!game.heroes[0].items.includes('bear-trap'));
    assert.equal(game.heroes[0].interacted, true);
    game.heroes[2].faction = 'wolves';
    const room = { hostId: 'host', seats: ['hero', 'hero', 'wolf'] };
    assert.equal(
      projectGameForPlayer(game, room, 'hero').rooms.find(
        (tile) => tile.id === 'foyer',
      ).traps.length,
      1,
    );
    const enemyView = projectGameForPlayer(game, room, 'wolf');
    assert.equal(
      enemyView.rooms.find((tile) => tile.id === 'foyer').traps,
      undefined,
    );
    assert(
      !enemyView.logs.some((entry) => entry.text.includes('布置了捕兽夹')),
    );
    game.heroes.forEach((hero) => {
      hero.pos = 'entrance';
    });
    game = settle(act(game, { type: 'endRound' }));
    assert.equal(game.enemies[0].pos, 'foyer');
    assert.equal(game.enemies[0].hp, 6);
    const movement = game.events.find(
      (event) => event.type === 'EntityMoved' && event.entityId === 'test-wolf',
    );
    assert.equal(movement.fromRoomId, 'stairs');
    assert.equal(movement.toRoomId, 'foyer');
    assert.equal(
      game.rooms.find((tile) => tile.id === 'foyer').traps.length,
      0,
    );
    assert(!game.events.some((event) => event.type === 'DamageApplied'));
  }
});

test('alpha wolf entering a prepared trap stops there and records the trigger', () => {
  let game = start();
  game.phase = 'haunt';
  game.heroes[0].pos = 'foyer';
  addItemInstance(game.heroes[0], 'bear-trap', 'alpha-trap');
  game = act(game, ability(game, 'trap').command);
  game.heroes[2].traitor = true;
  game.heroes[2].pos = 'stairs';
  game.heroes[0].pos = 'entrance';
  game.heroes[1].pos = 'entrance';
  game.enemies = [
    {
      id: 'alpha-test',
      name: '测试狼王',
      kind: 'alpha',
      heroId: 2,
      pos: 'stairs',
      hp: 10,
      maxHp: 10,
      speed: 3,
      might: 3,
    },
  ];
  game = settle(act(game, { type: 'endRound' }));
  assert.equal(game.enemies[0].pos, 'foyer');
  assert.equal(game.enemies[0].hp, 8);
  assert(
    game.events.some(
      (event) =>
        event.type === 'TrapTriggered' &&
        event.enemyId === 'alpha-test' &&
        event.roomId === 'foyer',
    ),
  );
});

test('hostile trap hero entry waits for damage before room continuation and cannot trigger twice after restore', () => {
  let game = start();
  game.heroes[0].pos = 'entrance';
  game.rooms.find((room) => room.id === 'foyer').traps = [
    { id: 'hostile', faction: 'wolves', ownerId: 2 },
  ];
  const before = game.heroes[0].stats.might + game.heroes[0].stats.speed;
  game = act(game, { type: 'move', pos: 'foyer' });
  assert.equal(game.queue[0].kind, 'damage');
  game = restore(game);
  game = act(game, {
    type: 'allocateDamage',
    requestId: game.queue[0].uid,
    allocation: { might: 2, speed: 0 },
  });
  assert.notEqual(game.queue[0]?.kind, 'contentResume');
  game = settle(game);
  assert.equal(
    game.heroes[0].stats.might + game.heroes[0].stats.speed,
    before - 2,
  );
  assert.equal(game.heroes[0].stopped, true);
  assert.equal(game.rooms.find((room) => room.id === 'foyer').traps.length, 0);
  assert(
    !roomBadges(
      game,
      game.rooms.find((room) => room.id === 'foyer'),
    ).some((badge) => badge.id === 'hostile'),
  );
});

test('enemy steam checks pause at intermediate rooms and resume without moving past a failed check', () => {
  let game = start();
  game.phase = 'haunt';
  game.heroes.forEach((hero) => {
    hero.pos = 'entrance';
  });
  game.enemies = [
    {
      id: 'steam-wolf',
      name: '蒸汽测试狼人',
      kind: 'wolf',
      pos: 'stairs',
      hp: 8,
      maxHp: 8,
      speed: 3,
      might: 1,
    },
  ];
  game.bloodmoon = {
    steam: [
      {
        id: 'test-steam',
        active: true,
        ownerId: 1,
        expiresRound: game.round + 1,
        roomIds: ['foyer'],
        checked: [],
      },
    ],
  };
  game = act(game, { type: 'endRound' });
  assert.equal(game.queue[0].title, '蒸汽测试狼人 · 避开蒸汽');
  assert.equal(game.enemies[0].pos, 'foyer');
  game = settle(dice(restore(game), 0));
  assert.equal(game.enemies[0].hp, 7);
  assert.equal(game.enemies[0].pos, 'foyer');
  assert.equal(
    game.events.filter((event) => event.type === 'EnemyDamaged').length,
    1,
  );
});

test('a stopped enemy still resolves every steam in the entered trap room after restoring', () => {
  let game = start();
  game.phase = 'haunt';
  game.heroes.forEach((hero) => {
    hero.pos = 'entrance';
  });
  game.enemies = [
    {
      id: 'combined-wolf',
      name: '组合测试狼人',
      kind: 'wolf',
      pos: 'stairs',
      hp: 8,
      maxHp: 8,
      speed: 3,
      might: 1,
    },
  ];
  game.rooms.find((room) => room.id === 'foyer').traps = [
    { id: 'combined-trap', faction: 'heroes', ownerId: 0 },
  ];
  game.bloodmoon = {
    steam: [0, 1].map((index) => ({
      id: `combined-steam:${index}`,
      active: true,
      ownerId: 1,
      expiresRound: game.round + 1,
      roomIds: ['foyer'],
      checked: [],
    })),
  };
  game = act(game, { type: 'endRound' });
  assert.equal(game.enemies[0].hp, 6);
  game = dice(restore(game), 0);
  assert.equal(game.enemies[0].hp, 5);
  assert.equal(game.queue[0].title, '组合测试狼人 · 避开蒸汽');
  game = settle(dice(restore(game), 0));
  assert.equal(game.enemies[0].hp, 4);
  assert.equal(game.enemies[0].pos, 'foyer');
  assert.equal(
    game.events.filter((event) => event.type === 'EnemyDamaged').length,
    3,
  );
});

test('a nested status ward resumes the owning turn trigger and later effects after saving', () => {
  let game = start();
  addItemInstance(game.heroes[0], 'saint-badge', 'badge:nested');
  game.ruleTriggers = [
    {
      id: 'new-poison',
      sourceId: 'room:test',
      when: 'TurnEnding',
      condition: { heroId: 0 },
      effects: [
        { op: 'status.gain', params: { heroId: 0, status: { id: 'poison' } } },
        {
          op: 'status.add',
          params: { heroId: 0, status: { id: 'following-effect' } },
        },
      ],
    },
  ];
  game = act(game, { type: 'endHero' });
  assert.equal(game.heroes[0].ended, false);
  game = choose(restore(game), 'protect');
  game = dice(restore(game), 2);
  assert.equal(game.heroes[0].ended, true);
  assert(!game.heroes[0].statuses.some((status) => status.id === 'poison'));
  assert.equal(
    game.heroes[0].statuses.filter((status) => status.id === 'following-effect')
      .length,
    1,
  );
  assert.equal(game.queue[0].kind, 'turnStart');
});

test('badge protection during enemy attack resumes exactly once and does not repeat attack damage', () => {
  let game = start();
  game.phase = 'haunt';
  game.heroes.forEach((hero) => {
    hero.pos = 'entrance';
  });
  addItemInstance(game.heroes[0], 'saint-badge', 'battle-badge');
  game.enemies = [
    {
      id: 'ward-wolf',
      name: '测试狼人',
      kind: 'wolf',
      pos: 'entrance',
      hp: 8,
      maxHp: 8,
      speed: 0,
      might: 3,
    },
  ];
  const before = game.heroes[0].stats.might + game.heroes[0].stats.speed;
  game = act(game, { type: 'endRound' });
  game.queue[0].rolls.forEach((group, index) => {
    group.dice = Array(group.count).fill(index === 0 ? 2 : 0);
  });
  game = act(game, { type: 'resolveDice', requestId: game.queue[0].uid });
  assert.equal(game.queue[0].title, '圣者徽章 · 庇护');
  game = dice(choose(restore(game), 'protect'), 2);
  game = settle(restore(game));
  assert.equal(
    game.heroes[0].stats.might + game.heroes[0].stats.speed,
    before - 3,
  );
  assert(!game.heroes[0].statuses.some((status) => status.id === 'infection'));
  assert.equal(
    game.events.filter((event) => event.type === 'DamageApplied').length,
    1,
  );
});

test('ring handles sixteen candidate dice without truncation and multiplayer only accepts its owner', () => {
  let time = 1000;
  const service = createRoomService({
    now: () => time,
    gameFactory: () => {
      let game = start();
      addItemInstance(game.heroes[0], 'family-ring', 'network-ring');
      game.traitRules = [
        {
          id: 'sixteen',
          sourceId: 'test',
          heroId: 0,
          trait: 'knowledge',
          patch: { fixedValue: 16 },
        },
      ];
      game = dice(act(game, ability(game, 'craft').command), 0);
      return game;
    },
  });
  const host = service.create({ scenario: 'werewolf', count: 3 }),
    guest = service.join({ code: host.code });
  const started = service.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const request = started.game.queue[0];
  assert.equal(request.options.length, 17);
  assert(request.options.some((option) => option.value === '0:15'));
  assert.equal(request.workflow.locals, undefined);
  assert.throws(
    () =>
      service.update(host.code, guest.key, {
        type: 'action',
        revision: started.revision,
        action: {
          type: 'resolveChoice',
          requestId: request.uid,
          choice: '0:15',
        },
      }),
    /当前角色/,
  );
  time += 30001;
  const timedOut = service.read(host.code, host.key).game;
  assert.equal(timedOut.queue.length, 0);
  assert.equal(itemInstances(timedOut.heroes[0])[0].state.ringRound, undefined);
});

test('steam excludes non-door links and expires if its owner can no longer take a turn', () => {
  let game = start();
  game.heroes[0].pos = 'bloodmoon-boiler';
  game.links.push(['bloodmoon-boiler', 'upper']);
  game = act(game, ability(game, 'valve').command);
  game = settle(act(game, { type: 'endHero' }));
  assert(!game.bloodmoon.steam[0].roomIds.includes('upper'));
  game.heroes[0].dead = true;
  game = settle(act(game, { type: 'endRound' }));
  assert.equal(game.bloodmoon.steam.length, 0);
});

test('a trap killing the last wolf wins before the same enemy phase timeout', () => {
  for (const factory of [createGame, createSimulationGame]) {
    let game = start(factory);
    game.phase = 'haunt';
    game.limit = 1;
    game.heroes.forEach((hero) => {
      hero.pos = 'entrance';
    });
    game.rooms.find((room) => room.id === 'foyer').traps = [
      { id: 'fatal-trap', faction: 'heroes', ownerId: 0 },
    ];
    game.enemies = [
      {
        id: 'last-wolf',
        name: '最后狼人',
        kind: 'wolf',
        pos: 'stairs',
        hp: 1,
        maxHp: 1,
        speed: 3,
        might: 1,
      },
    ];
    game = act(game, { type: 'endRound' });
    assert.equal(game.phase, 'over');
    assert.equal(game.result.won, true);
    assert.equal(game.enemies.length, 0);
  }
});
