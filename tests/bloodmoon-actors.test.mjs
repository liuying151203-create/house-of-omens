import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  pending,
  actions,
  traitValue,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import {
  createHauntPlaytest,
  makeCheckpoint,
  readCheckpoint,
} from '../lib/playtest.mjs';
import { rosterGroups } from '../lib/game-view.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
const clear = (game) => {
  for (let i = 0; pending(game) && i < 30; i++)
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  return game;
};
const fixture = (focus) => clear(createHauntPlaytest('werewolf', 31, 3, focus));

test('controlled alpha retains a seat and four tracks and never creates an HP enemy', () => {
  const game = fixture('bloodmoon-control'),
    alpha = game.heroes[0];
  assert.equal(alpha.faction, 'wolves');
  assert.equal(alpha.traitor, false);
  assert.equal(game.enemies.length, 0);
  assert.equal(game.limit, null);
  assert.equal(traitValue(alpha, 'might', game), 5);
  assert.equal(traitValue(alpha, 'speed', game), 5);
  assert(
    actions(game).abilities.some(
      (action) => action.command.type === 'actorAttack',
    ),
  );
  assert(
    rosterGroups(game)
      .find((group) => group.id === 'wolves')
      .heroes.includes(alpha),
  );
  assert.deepEqual(restoreGameSave(JSON.parse(JSON.stringify(game))), game);
});
test('moon changes only after the whole round, preserves positions and refreshes movement from the new track', () => {
  for (const [focus, phase, value] of [
    ['bloodmoon-fullmoon', 'full', 6],
    ['bloodmoon-bloodmoon', 'blood', 6],
  ]) {
    let game = fixture(focus);
    const before = { ...game.heroes[0].stats };
    game = clear(act(game, { type: 'endHero' }));
    assert.notEqual(game.bloodmoonCombat.moon, phase);
    game = clear(act(game, { type: 'endRound' }));
    assert.equal(game.bloodmoonCombat.moon, phase);
    assert.deepEqual(game.heroes[0].stats, before);
    assert.equal(traitValue(game.heroes[0], 'might', game), value);
    assert.equal(game.heroes[0].moves, 6);
    assert.equal(
      game.events.filter((event) => event.type === 'MoonPhaseChanged').length,
      1,
    );
  }
});
test('secondary wolves retain original tracks across moon changes', () => {
  let game = fixture('bloodmoon-secondary');
  const secondary = structuredClone(game.heroes[1]);
  for (let i = 0; i < 5; i++) game = clear(act(game, { type: 'endRound' }));
  assert.deepEqual(game.heroes[1].tracks, secondary.tracks);
  assert.deepEqual(game.heroes[1].stats, secondary.stats);
  assert.equal(game.phase, 'haunt');
});
test('actor combat persists two separately owned dice sides and waits for manual full-difference injury', () => {
  let game = fixture('bloodmoon-control');
  game = act(game, { type: 'actorAttack', targetId: 1 });
  assert.equal(pending(game).kind, 'diceRequest');
  assert.deepEqual(
    pending(game).rolls.map((roll) => roll.heroId),
    [0, 1],
  );
  const saved = readCheckpoint(makeCheckpoint(game), game);
  assert(saved);
  game = saved;
  pending(game).rolls.forEach(
    (roll, index) => (roll.dice = Array(roll.count).fill(index === 0 ? 2 : 0)),
  );
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 10);
  assert.equal(pending(game).heroId, 1);
  assert(game.heroes[0].attacked);
});
test('actors reject friendly and distant attacks without consuming an attack', () => {
  const game = fixture('bloodmoon-secondary');
  const same = act(game, { type: 'actorAttack', targetId: 1 });
  assert.deepEqual(same, game);
  game.heroes[2].pos = 'entrance';
  assert.deepEqual(act(game, { type: 'actorAttack', targetId: 2 }), game);
});

test('LAN controls the alpha through its original seat and keeps defender dice private to their owner', () => {
  const api = createRoomService({
    gameFactory: () => fixture('bloodmoon-control'),
  });
  const host = api.create({ scenario: 'werewolf', count: 3 }),
    guest = api.join({ code: host.code });
  let room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const update = (key, action) =>
    api.update(host.code, key, {
      type: 'action',
      revision: room.revision,
      action,
    });
  assert.throws(
    () => update(guest.key, { type: 'actorAttack', targetId: 1 }),
    /当前角色/,
  );
  room = update(host.key, { type: 'actorAttack', targetId: 1 });
  const request = pending(room.game),
    [attack, defense] = request.rolls;
  assert.throws(
    () => update(host.key, { type: 'rollDice', sideId: defense.id }),
    /负责的骰子/,
  );
  assert.throws(
    () => update(guest.key, { type: 'rollDice', sideId: attack.id }),
    /负责的骰子/,
  );
  room = update(host.key, { type: 'rollDice', sideId: attack.id });
  room = update(guest.key, { type: 'rollDice', sideId: defense.id });
  assert.throws(
    () => update(guest.key, { type: 'resolveDice', requestId: request.uid }),
    /当前角色/,
  );
  room = update(host.key, { type: 'resolveDice', requestId: request.uid });
  assert.notEqual(pending(room.game)?.kind, 'diceRequest');
});
