import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createHauntPlaytest,
  saveKeyFor,
  PLAYTEST_SAVE_KEY,
  NORMAL_SAVE_KEY,
  playtestPresets,
  makeCheckpoint,
  readCheckpoint,
} from '../lib/playtest.mjs';
import {
  createGame,
  act,
  actions,
  living,
  pathTo,
  validSave,
  movement,
  ROOM_DECK,
} from '../lib/game-engine.mjs';
import { moonlit, statusOf } from '../lib/werewolf.mjs';
import { gameModeLabel } from '../lib/game-view.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

test('treatment preset provides two real infections, an injury and the normal locket cure bonus', () => {
  for (const count of [3, 4, 5, 6]) {
    let game = createHauntPlaytest('werewolf', 23, count, 'treatment');
    const allies = living(game);
    assert.equal(allies.filter((h) => statusOf(h, 'infection')).length, 2);
    assert.equal(allies[0].stats.might, allies[0].start.might - 1);
    assert.equal(statusOf(allies[0], 'infection').turns, 3);
    game = act(game, { type: 'advance' });
    game = act(game, { type: 'cure', heroId: allies[1].id });
    assert.equal(game.queue[0].kind, 'diceRequest');
    assert.equal(game.queue[0].rolls[0].bonus, 2);
    assert(statusOf(game.heroes[allies[1].id], 'infection'));
    assert.deepEqual(
      createHauntPlaytest(
        game.scenario,
        game.playtest.seed,
        game.count,
        game.playtest.focus,
      ),
      createHauntPlaytest('werewolf', 23, count, 'treatment'),
    );
  }
});

test('conversion preset changes faction on the next enemy phase and the new wolf waits to hunt', () => {
  let game = createHauntPlaytest('werewolf', 23, 4, 'conversion');
  const target = living(game).find((h) => statusOf(h, 'infection'));
  assert.equal(statusOf(target, 'infection').turns, 1);
  game = act(game, { type: 'advance' });
  game = act(game, { type: 'endRound' });
  assert.equal(game.queue[0].kind, 'diceRequest');
  game = act(game, { type: 'rollAll' });
  game = act(game, { type: 'advance' });
  assert.equal(game.heroes[target.id].faction, 'wolves');
  const newWolf = game.enemies.find((e) => e.heroId === target.id);
  assert.equal(newWolf.bornAt, game.elapsed);
  assert.equal(newWolf.kind, 'wolf');
  assert(game.logs.every((l) => !l.text.includes(newWolf.name + '攻击')));
});

test('ritual preset enables the real exit ritual and clears infection on victory', () => {
  let game = createHauntPlaytest('werewolf', 23, 3, 'ritual');
  assert.equal(game.progress, 2);
  assert(
    game.rooms
      .filter((r) => r.target === 'moonSeal')
      .every((r) => r.done && r.charges === r.requiredCharges),
  );
  assert.equal(game.heroes[game.active].pos, 'entrance');
  game = act(game, { type: 'advance' });
  assert(actions(game).interact);
  game = act(game, { type: 'interact' });
  assert.equal(game.phase, 'over');
  assert.equal(game.result.winnerFaction, 'heroes');
  assert(game.heroes.every((h) => !statusOf(h, 'infection')));
});

test('checkpoints preserve pending rolls exactly and refuse other fixtures, normal games or malformed data', () => {
  let game = createHauntPlaytest('werewolf', 23, 4, 'treatment');
  game = act(game, { type: 'advance' });
  game = act(game, { type: 'cure', heroId: game.active });
  game = act(game, { type: 'rollAll' });
  const raw = makeCheckpoint(game);
  const resolved = act(game, { type: 'advance' });
  const restored = readCheckpoint(raw, resolved);
  assert.deepEqual(restored, game);
  assert.deepEqual(act(restored, { type: 'advance' }), resolved);
  assert.deepEqual(act(restored, { type: 'rollAll' }), restored);
  restored.heroes[0].name = 'changed';
  assert.notEqual(readCheckpoint(raw, resolved).heroes[0].name, 'changed');
  for (const other of [
    createHauntPlaytest('werewolf', 24, 4, 'treatment'),
    createHauntPlaytest('werewolf', 23, 3, 'treatment'),
    createHauntPlaytest('werewolf', 23, 4, 'conversion'),
    createHauntPlaytest('bells', 23, 4),
    createGame('werewolf', 23, 4),
  ])
    assert.equal(readCheckpoint(raw, other), null);
  for (const malformed of [null, '{', '{}', '{"version":99}'])
    assert.equal(readCheckpoint(malformed, game), null);
  assert.throws(
    () => makeCheckpoint(createGame('werewolf', 23, 4)),
    /快速测试/,
  );
});

test('preset selection is validated for direct and LAN starts and guests cannot insert it', () => {
  assert.deepEqual(
    playtestPresets('mirror').map((p) => p.id),
    ['basic', 'elevator', 'collapse'],
  );
  assert.throws(() => createHauntPlaytest('mirror', 23, 3, 'ritual'), /不支持/);
  assert.throws(
    () => createHauntPlaytest('werewolf', 23, 3, '__proto__'),
    /不支持/,
  );
  const api = createRoomService();
  const host = api.create({ scenario: 'werewolf', count: 3 });
  const guest = api.join({ code: host.code });
  const start = {
    type: 'start',
    hauntPlaytest: true,
    playtestFocus: 'conversion',
    revision: guest.revision,
  };
  assert.throws(() => api.update(host.code, guest.key, start), /房主/);
  assert.throws(
    () => api.update(host.code, host.key, { ...start, playtestFocus: 'bad' }),
    /不支持/,
  );
  const room = api.update(host.code, host.key, start);
  assert.equal(room.game.playtest.focus, 'conversion');
  const playerViews = [host.key, guest.key].map(
    (key) => api.read(host.code, key).game,
  );
  assert.equal(
    Math.max(
      ...playerViews.map(
        (view) =>
          living(view).filter((h) => statusOf(h, 'infection')?.turns === 1)
            .length,
      ),
    ),
    1,
  );
  assert.throws(
    () =>
      api.update(host.code, host.key, { ...start, revision: room.revision }),
    /已经/,
  );
});

test('all directed quick starts have connected floors, reachable objectives and exactly one haunt prompt', () => {
  const originalRooms = structuredClone(ROOM_DECK);
  for (const scenario of ['werewolf', 'bells', 'mirror', 'flood']) {
    for (const count of [3, 4, 5, 6]) {
      for (const seed of [1, 23, 92]) {
        let game = createHauntPlaytest(scenario, seed, count);
        assert(validSave(game));
        assert.equal(game.phase, 'haunt');
        assert.equal(game.scenario, scenario);
        assert.equal(game.automaticHaunt, false);
        assert.equal(game.executionMode, 'workflow');
        assert.deepEqual(
          game.queue.map((p) => p.kind),
          ['haunt'],
        );
        assert.equal(game.progress, 0);
        assert.equal(game.elapsed, 0);
        assert.equal(game.rooms.length, 11);
        assert.equal(
          new Set(game.rooms.map((r) => `${r.floor},${r.x},${r.y}`)).size,
          11,
        );
        for (const room of game.rooms)
          assert(
            pathTo(game, 'entrance', room.id).length,
            `${scenario}: ${room.name}`,
          );
        for (const id of game.targetRooms)
          assert(pathTo(game, 'entrance', id).length);
        for (const h of living(game)) {
          assert(!h.ended && !h.stopped);
          assert.equal(h.moves, movement(h));
        }
        assert.equal(
          game.decks.rooms.length + game.rooms.filter((r) => !r.starter).length,
          ROOM_DECK.length,
        );
        assert(
          game.rooms
            .filter((r) => !r.starter)
            .every((r) => !game.decks.rooms.includes(r.id)),
        );
        game = act(game, { type: 'advance' });
        assert.equal(game.queue.length, 0);
        assert(actions(game).move.length > 0);
      }
    }
  }
  assert.deepEqual(ROOM_DECK, originalRooms);
});

test('werewolf quick start exposes window and combat testing, while the kit uses real card effects', () => {
  let game = createHauntPlaytest('werewolf', 23, 4);
  const h = game.heroes[0];
  assert.deepEqual(h.items, ['coffee', 'bandage']);
  assert.deepEqual(h.omens, ['locket']);
  assert.equal(h.stats.sanity, h.start.sanity + 1);
  assert(!game.decks.omen.includes('locket'));
  assert(!game.decks.item.includes('coffee'));
  assert(!game.decks.item.includes('bandage'));
  assert.equal(game.omens, 1);
  assert(
    moonlit(
      game,
      game.rooms.find((r) => r.id === h.pos),
    ),
  );
  game = act(game, { type: 'advance' });
  assert.equal(actions(game).attack.length, 1);
  const boarded = act(game, { type: 'boardWindow' });
  assert(boarded.rooms.find((r) => r.id === h.pos).states.boarded);
  const attack = act(game, { type: 'attack', id: actions(game).attack[0] });
  assert.equal(attack.queue[0].kind, 'diceRequest');
});

test('reset reproduces the same fixture and saves stay separate from normal play', () => {
  const initial = createHauntPlaytest('werewolf', 1234, 6);
  let played = act(initial, { type: 'advance' });
  played = act(played, { type: 'useItem', id: 'coffee' });
  const saved = JSON.parse(JSON.stringify(played));
  assert(validSave(saved));
  assert.equal(saveKeyFor(saved), PLAYTEST_SAVE_KEY);
  assert.equal(saveKeyFor(createGame('werewolf', 1234, 6)), NORMAL_SAVE_KEY);
  assert.notEqual(PLAYTEST_SAVE_KEY, NORMAL_SAVE_KEY);
  assert.deepEqual(
    createHauntPlaytest(saved.scenario, saved.playtest.seed, saved.count),
    initial,
  );
  assert.match(gameModeLabel(saved), /作祟快速测试/);
  const normal = createGame('werewolf', 1234, 6);
  assert.equal(normal.phase, 'explore');
  assert.equal(normal.rooms.length, 5);
  assert.equal(normal.heroes[0].items.length, 0);
  assert.throws(() => createHauntPlaytest('mystery'), /指定/);
});

test('only the LAN host can quick-start a directed room; ordinary starts still explore', () => {
  const api = createRoomService();
  const host = api.create({ scenario: 'werewolf', count: 4 });
  const guest = api.join({ code: host.code });
  assert.throws(
    () =>
      api.update(host.code, guest.key, {
        type: 'start',
        revision: guest.revision,
        hauntPlaytest: true,
      }),
    /房主/,
  );
  const started = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
    hauntPlaytest: true,
  });
  assert.equal(started.game.phase, 'haunt');
  assert.equal(started.game.playtest.mode, 'haunt');
  assert.deepEqual(api.read(host.code, host.key).game, started.game);
  const guestView = api.read(host.code, guest.key).game;
  assert(
    guestView.heroes.some((hero) => hero.inventoryHidden),
    'opposing inventories should be projected out of the guest snapshot',
  );
  assert.throws(
    () =>
      api.update(host.code, host.key, {
        type: 'start',
        revision: started.revision,
        hauntPlaytest: true,
      }),
    /已经/,
  );
  const normalHost = api.create({ scenario: 'werewolf', count: 3 });
  const normalGuest = api.join({ code: normalHost.code });
  assert.equal(
    api.update(normalHost.code, normalHost.key, {
      type: 'start',
      revision: normalGuest.revision,
    }).game.phase,
    'explore',
  );
  const mysteryHost = api.create({ scenario: 'mystery', count: 3 });
  const mysteryGuest = api.join({ code: mysteryHost.code });
  assert.throws(
    () =>
      api.update(mysteryHost.code, mysteryHost.key, {
        type: 'start',
        revision: mysteryGuest.revision,
        hauntPlaytest: true,
      }),
    /指定/,
  );
});
