import test from 'node:test';
import assert from 'node:assert/strict';
import {
  builtinGameSets,
  resolveGameSet,
  validateGameSet,
  validateGameSetPack,
  validateGameSetLibrary,
} from '../lib/game-sets.mjs';
import {
  createGame,
  createSimulationGame,
  restoreGameSave,
  act,
  drawCard,
  actions,
  executeRuleEffects,
  ROOM_DECK,
} from '../lib/game-engine.mjs';
import { drivePendingRequests } from '../lib/automatic-driver.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { rollOutcomes } from '../lib/roll-outcomes.mjs';
import {
  createRoomState,
  joinRoomState,
  updateRoomState,
  restoreRoomState,
  readRoomState,
} from '../lib/network/room-domain.mjs';
import {
  decomposeRoomState,
  composeRoomState,
} from '../lib/network/room-persistence.mjs';

const settle = (game) => drivePendingRequests(game, act);
const custom = () => ({
  ...resolveGameSet('expanded'),
  id: 'set-test',
  name: '我的通用游戏集',
});

test('classic preset keeps original decks, RNG and state for every scenario and execution mode', () => {
  for (const factory of [createGame, createSimulationGame])
    for (const scenario of ['mystery', 'werewolf', 'bells', 'mirror', 'flood'])
      for (const count of [3, 6]) {
        const original = factory(scenario, 123, count);
        const selected = factory(scenario, 123, count, { gameSet: 'classic' });
        assert.equal(selected.gameSet.id, 'classic');
        delete selected.gameSet;
        assert.deepEqual(selected, original);
      }
});

test('expanded sets include reusable items and rooms in all scenarios, excluding manufactured silver', () => {
  for (const scenario of ['mystery', 'werewolf', 'bells', 'mirror', 'flood']) {
    const game = createGame(scenario, 11, 3, { gameSet: 'expanded' });
    for (const id of [
      'family-ring',
      'saint-badge',
      'bear-trap',
      'might-potion',
      'speed-potion',
      'sanity-potion',
      'antidote',
    ])
      assert(game.decks.item.includes(id), `${scenario}: ${id}`);
    assert(!game.decks.item.includes('silver-bullet'));
    assert(game.decks.rooms.includes('bloodmoon-laboratory'));
    assert.equal(game.decks.rooms.length, ROOM_DECK.length);
  }
});

test('a game captures its selected set and survives edits, deletion, save restore and replay', () => {
  const set = custom();
  set.decks.item = ['family-ring', 'bear-trap'];
  const snapshot = structuredClone(set);
  const game = createGame('bells', 12, 3, { gameSet: set });
  set.name = '修改后的预设';
  set.decks.item.length = 0;
  assert.deepEqual(game.gameSet, snapshot);
  assert.deepEqual(new Set(game.decks.item), new Set(snapshot.decks.item));
  const restored = restoreGameSave(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(restored, game);
  assert.deepEqual(
    createGame('bells', 12, 3, { gameSet: restored.gameSet }),
    game,
  );
  const invalid = structuredClone(game);
  invalid.gameSet.decks.item = ['unknown'];
  assert.equal(restoreGameSave(invalid), null);
});

test('game sets reject unknown rules, duplicated rooms, manufactured cards and unusable exploration pools', () => {
  for (const mutate of [
    (set) => {
      set.decks.item.push('unimplemented-draft');
    },
    (set) => {
      set.decks.rooms.push(set.decks.rooms[0]);
    },
    (set) => {
      set.decks.item.push('silver-bullet');
    },
    (set) => {
      set.effects = [{ op: 'arbitrary' }];
    },
    (set) => {
      set.decks.event = [];
    },
    (set) => {
      set.decks.omen = set.decks.omen.slice(0, 2);
    },
    (set) => {
      set.decks.rooms = set.decks.rooms.filter((id) => id !== 'stairs-down');
    },
    (set) => {
      set.decks.rooms = set.decks.rooms.filter(
        (id) => ROOM_DECK.find((room) => room.id === id).icon !== 'omen',
      );
    },
  ]) {
    const set = custom();
    mutate(set);
    assert.throws(() => validateGameSet(set));
    assert.throws(() => createGame('mirror', 13, 3, { gameSet: set }));
  }
  assert.throws(() => resolveGameSet('missing'));
});

test('game-set imports validate versions, limits and collisions without mutating builtins', () => {
  const set = custom(),
    pack = { version: 1, gameSets: [set], selectedId: set.id };
  assert.deepEqual(
    validateGameSetLibrary(JSON.parse(JSON.stringify(pack))),
    pack,
  );
  assert.throws(() => validateGameSetPack({ ...pack, version: 2 }));
  assert.throws(() => validateGameSetPack({ ...pack, gameSets: [set, set] }));
  assert.throws(() =>
    validateGameSetPack({ ...pack, gameSets: Array(31).fill(set) }),
  );
  assert.throws(() =>
    validateGameSetLibrary({ ...pack, selectedId: 'missing' }),
  );
  assert.throws(() =>
    validateGameSetLibrary({ ...pack, gameSets: builtinGameSets() }),
  );
  const exported = validateGameSetPack({
    version: 1,
    gameSets: builtinGameSets(),
  });
  exported[0].decks.item.length = 0;
  assert(builtinGameSets()[0].decks.item.length > 0);
});

test('the selected final omen starts the haunt even with a failed roll, and keeps the matching preview', () => {
  for (const factory of [createGame, createSimulationGame]) {
    const set = custom();
    set.decks.omen = set.decks.omen.slice(0, 3);
    let game = settle(factory('mirror', 14, 3, { gameSet: set }));
    game.omens = 2;
    game.decks.omen = [set.decks.omen[2]];
    drawCard(game, 'omen', game.heroes[0]);
    game = act(game, { type: 'continueCard', requestId: game.queue[0].uid });
    assert.equal(game.queue[0].kind, 'hauntRoll');
    assert.match(rollOutcomes(game, {}, game.queue[0])[0].effect, /最后一张/);
    game = act(game, { type: 'advance' });
    if (game.queue[0].kind === 'diceRequest') {
      game.queue[0].rolls.forEach((group) => {
        group.dice = Array(group.count).fill(0);
      });
      game = act(game, { type: 'resolveDice', requestId: game.queue[0].uid });
    }
    assert.equal(game.queue[0].triggers, true);
    game = settle(game);
    assert.equal(game.phase, 'haunt');
  }
});

test('ring, badge and traps operate in a non-werewolf game through the shared action and reaction system', () => {
  let game = settle(createGame('bells', 15, 3, { gameSet: 'expanded' }));
  addItemInstance(game.heroes[0], 'family-ring', 'generic:ring');
  addItemInstance(game.heroes[0], 'saint-badge', 'generic:badge');
  addItemInstance(game.heroes[0], 'bear-trap', 'generic:trap');
  executeRuleEffects(game, [
    { op: 'status.gain', params: { heroId: 0, status: { id: 'poison' } } },
  ]);
  assert.match(game.queue[0].title, /圣者徽章/);
  game = act(game, {
    type: 'resolveChoice',
    requestId: game.queue[0].uid,
    choice: 'protect',
  });
  game.queue[0].rolls.forEach((group) => {
    group.dice = Array(group.count).fill(0);
  });
  game = act(game, { type: 'resolveDice', requestId: game.queue[0].uid });
  assert.match(game.queue[0].title, /家族戒指/);
  game = act(game, {
    type: 'resolveChoice',
    requestId: game.queue[0].uid,
    choice: 'skip',
  });
  assert(game.heroes[0].statuses.some((status) => status.id === 'poison'));
  game.heroes[0].pos = 'foyer';
  game = act(
    game,
    actions(game).abilities.find((ability) => ability.kind === 'trap').command,
  );
  game.heroes.forEach((hero) => {
    hero.pos = 'entrance';
  });
  game.phase = 'haunt';
  game.limit = 20;
  game.enemies = [
    {
      id: 'generic-shadow',
      name: '幽影',
      kind: 'shadow',
      pos: 'stairs',
      hp: 6,
      speed: 3,
      might: 1,
    },
  ];
  game = settle(act(game, { type: 'endRound' }));
  assert.equal(game.enemies[0].pos, 'foyer');
  assert.equal(game.enemies[0].hp, 4);
});

test('multiplayer freezes and shares host selection, validates input, and persists it through remote storage', () => {
  const set = custom(),
    identity = { id: 'host', key: 'host-key' };
  assert.throws(
    () =>
      createRoomState(
        { scenario: 'bells', count: 3, gameSet: 'missing' },
        { code: 'ABC123', identity },
      ),
    (error) => error.status === 400,
  );
  const created = createRoomState(
    { scenario: 'bells', count: 3, gameSet: set },
    { code: 'ABC123', identity },
  );
  const guest = joinRoomState(
    created.room,
    {},
    { identity: { id: 'guest', key: 'guest-key' } },
  );
  assert.deepEqual(guest.gameSet, set);
  set.decks.item.length = 0;
  const persisted = decomposeRoomState(created.room),
    room = composeRoomState(persisted);
  assert(room.gameSet.decks.item.includes('family-ring'));
  assert.throws(
    () =>
      updateRoomState(room, guest.key, {
        type: 'start',
        revision: guest.revision,
      }),
    (error) => error.status === 403,
  );
  const started = updateRoomState(room, identity.key, {
    type: 'start',
    revision: guest.revision,
    gameSet: 'classic',
  });
  assert.equal(started.game.gameSet.id, 'set-test');
  assert(room.game.decks.item.includes('family-ring'));
  assert(
    started.game.decks.item.every((id) => id === null),
    'preset metadata must not reveal shuffled order',
  );
  assert.deepEqual(
    readRoomState(restoreRoomState(room), guest.key).gameSet,
    room.gameSet,
  );
  const invalid = structuredClone(room);
  invalid.gameSet.decks.item = ['invalid'];
  assert.equal(restoreRoomState(invalid), null);
});
