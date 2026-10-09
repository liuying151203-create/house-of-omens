import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  actions,
  pending,
  restoreGameSave,
  traitValue,
  createGame,
  triggerHaunt,
  updateRoomRule,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import {
  isWounded,
  isIsolated,
  pursuitAvailable,
} from '../lib/content/bloodmoon-pursuit.mjs';
import { projectGameForPlayer } from '../lib/engine/projection.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const clear = (game) => {
  while (
    pending(game) &&
    !['diceRequest', 'damage', 'choiceRequest'].includes(pending(game).kind)
  )
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  return game;
};
const fixture = (focus = 'bloodmoon-pursuit') =>
  clear(createHauntPlaytest('werewolf', 31, 3, focus));
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));

test('haunt records the actual current body values, rather than character start positions', () => {
  const game = clear(createGame('werewolf', 31, 3));
  game.scenario = 'bloodmoon';
  game.heroes[0].omens.push('bite-mark');
  game.heroes[1].stats.might = 6;
  triggerHaunt(game);
  assert.equal(
    game.heroes[1].hauntBodyValues.might,
    traitValue(game.heroes[1], 'might', game),
  );
  assert.equal(isWounded(game, game.heroes[1]), false);
});

test('wounded compares values, handles equal neighboring cells, recovery, death and conversion', () => {
  const game = fixture(),
    hero = game.heroes[1];
  hero.tracks.might = [0, 2, 3, 4, 4, 6, 7, 8];
  hero.hauntBodyValues.might = 4;
  hero.stats.might = 3;
  assert.equal(isWounded(game, hero), false);
  hero.stats.might = 2;
  assert.equal(isWounded(game, hero), true);
  hero.stats.might = 4;
  assert.equal(isWounded(game, hero), false);
  hero.stats.might = 1;
  hero.dead = true;
  assert.equal(isWounded(game, hero), false);
  hero.dead = false;
  hero.faction = 'wolves';
  assert.equal(isWounded(game, hero), false);
});

test('extra movement is directional, spent once per round and cannot be refreshed by selecting or restoring', () => {
  let game = fixture();
  assert.deepEqual(actions(game).move, ['shoot-room-1']);
  assert.deepEqual(act(game, { type: 'move', pos: 'entrance' }), game);
  const stats = { ...game.heroes[0].stats };
  game = clear(act(restore(game), { type: 'move', pos: 'shoot-room-1' }));
  assert.equal(game.heroes[0].pos, 'shoot-room-1');
  assert.equal(game.heroes[0].moves, 0);
  assert.deepEqual(game.heroes[0].stats, stats);
  assert.equal(game.heroes[0].pursuitSpentRound, game.round);
  assert.deepEqual(actions(game).move, []);
  game = clear(act(game, { type: 'select', id: 2 }));
  game = clear(act(restore(game), { type: 'select', id: 0 }));
  assert.deepEqual(actions(game).move, []);
  game = clear(act(game, { type: 'endRound' }));
  game.heroes[0].moves = 0;
  assert(actions(game).move.includes('shoot-room-2'));
  assert.equal(
    game.events.filter((event) => event.type === 'PursuitUsed').length,
    1,
  );
});

test('base movement is spent first; pursuit adds one movement point rather than a free high-cost step', () => {
  let game = fixture();
  game.heroes[0].moves = 1;
  game = clear(act(game, { type: 'move', pos: 'shoot-room-1' }));
  assert(pursuitAvailable(game, game.heroes[0]));
  game = clear(act(game, { type: 'move', pos: 'shoot-room-2' }));
  assert.equal(game.heroes[0].moves, 0);
  assert(!pursuitAvailable(game, game.heroes[0]));
  game = fixture();
  game = updateRoomRule(game, {
    id: 'cost',
    roomId: 'foyer',
    sourceId: 'test-cost',
    patch: { moveCostDelta: 1 },
  });
  assert.deepEqual(actions(game).move, []);
  game.heroes[0].moves = 1;
  assert(actions(game).move.includes('shoot-room-1'));
  game = clear(act(game, { type: 'move', pos: 'shoot-room-1' }));
  assert.equal(game.heroes[0].moves, 0);
  assert.equal(game.heroes[0].pursuitSpentRound, game.round);
});

test('healed, dead or converted targets and stopped wolves cannot provide pursuit movement', () => {
  for (const mutate of [
    (game) => (game.heroes[1].stats = { ...game.heroes[1].start }),
    (game) => (game.heroes[1].dead = true),
    (game) => (game.heroes[1].faction = 'wolves'),
    (game) => (game.heroes[0].stopped = true),
  ]) {
    const game = fixture();
    mutate(game);
    assert.deepEqual(actions(game).move, []);
  }
});

test('secondary wolves have pursuit during awakening while alpha does not, and bonus cannot explore', () => {
  const game = fixture('bloodmoon-pursuit-secondary');
  assert.equal(game.active, 1);
  assert(actions(game).move.includes('shoot-room-1'));
  assert.deepEqual(actions(game).explore, []);
  assert(!pursuitAvailable(game, game.heroes[0]));
});

test('pursuit entry still triggers a hostile trap, manual injury and movement stop after restore', () => {
  let game = fixture('bloodmoon-pursuit-trap');
  game = act(game, { type: 'move', pos: 'shoot-room-1' });
  assert.equal(game.heroes[0].pos, 'shoot-room-1');
  assert(game.heroes[0].stopped);
  assert.equal(pending(game).kind, 'damage');
  game = clear(
    act(restore(game), {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation: { might: 1, speed: 1 },
    }),
  );
  assert.deepEqual(actions(game).move, []);
  assert.equal(
    game.events.filter((event) => event.type === 'PursuitUsed').length,
    1,
  );
  assert.equal(
    game.events.filter((event) => event.type === 'TrapTriggered').length,
    1,
  );
});

test('isolation uses other living heroes in the same room or through bidirectional doors, excluding links and walls', () => {
  const game = fixture('bloodmoon-isolation'),
    target = game.heroes[1],
    other = game.heroes[2];
  assert(isIsolated(game, target));
  other.pos = 'shoot-room-1';
  assert(!isIsolated(game, target));
  other.dead = true;
  assert(isIsolated(game, target));
  other.dead = false;
  other.faction = 'wolves';
  assert(isIsolated(game, target));
  other.faction = 'heroes';
  game.rooms.find((room) => room.id === other.pos).rotation = 1;
  assert(isIsolated(game, target));
  game.links.push(['foyer', 'shoot-room-1']);
  assert(isIsolated(game, target));
});

test('isolation adds one final attack point without increasing dice, and save keeps the bonus once', () => {
  let game = fixture('bloodmoon-isolation');
  const count = traitValue(game.heroes[0], 'might', game);
  game = act(game, { type: 'actorAttack', targetId: 1 });
  assert.equal(pending(game).rolls[0].count, count);
  assert.match(pending(game).text, /最终攻击结果加1/);
  pending(game).rolls.forEach(
    (group) =>
      (group.dice = Array.from({ length: group.count }, (_, index) =>
        index === 0 ? 2 : 0,
      )),
  );
  game = clear(
    act(restore(game), { type: 'resolveDice', requestId: pending(game).uid }),
  );
  assert.equal(pending(game).remaining, 1);
  assert.match(
    game.events.findLast((event) => event.type === 'ActorAttackResolved').text,
    /骰子2点，落单加1/,
  );
});

test('LAN exposes wounded eligibility without exposing the victim baseline or private tracks', () => {
  const game = fixture();
  const projected = projectGameForPlayer(
    game,
    {
      hostId: 'wolf-player',
      seats: { 0: 'wolf-player', 1: 'hero-player', 2: 'hero-player' },
    },
    'wolf-player',
  );
  assert.equal(projected.heroes[1].wounded, true);
  assert.equal(projected.heroes[1].hauntBodyValues, undefined);
  assert.equal(projected.heroes[1].stats, null);
  assert(actions(projected).move.includes('shoot-room-1'));
  const api = createRoomService({ gameFactory: () => fixture() });
  const host = api.create({ scenario: 'werewolf', count: 3 }),
    guest = api.join({ code: host.code });
  const room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  assert.throws(
    () =>
      api.update(host.code, guest.key, {
        type: 'action',
        revision: room.revision,
        action: { type: 'move', pos: 'shoot-room-1' },
      }),
    /当前角色/,
  );
  const next = api.update(host.code, host.key, {
    type: 'action',
    revision: room.revision,
    action: { type: 'move', pos: 'shoot-room-1' },
  });
  assert.equal(next.game.heroes[0].pos, 'shoot-room-1');
});

test('isolation bonus contributes to actual three-point injury and its infection threshold', () => {
  let game = fixture('bloodmoon-isolation');
  game.heroes[1].stats.speed = 7;
  game = act(game, { type: 'actorAttack', targetId: 1 });
  pending(game).rolls.forEach(
    (group, index) =>
      (group.dice = Array.from({ length: group.count }, (_, die) =>
        index === 0 && die === 0 ? 2 : 0,
      )),
  );
  game = clear(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
  assert.equal(pending(game).remaining, 3);
  game = clear(
    act(game, {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation: { might: 0, speed: 3 },
    }),
  );
  assert.equal(
    game.heroes[1].statuses.find(
      (status) => status.id === 'bloodmoon-infection',
    ).level,
    1,
  );
});
