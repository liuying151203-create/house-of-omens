import test from 'node:test';
import assert from 'node:assert/strict';
import { act, actions, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { shotRay, loadSilver, unloadSilver } from '../lib/content/firearms.mjs';
import {
  itemInstances,
  transferItemInstance,
  dropItemInstance,
  pickupItemInstance,
  addItemInstance,
} from '../lib/item-instances.mjs';
import { resolveGameSet } from '../lib/game-sets.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
const clear = (game) => {
  for (let i = 0; pending(game) && i < 30; i++) {
    if (['diceRequest', 'damage', 'reaction'].includes(pending(game).kind))
      break;
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  }
  return game;
};
const fixture = (focus = 'bloodmoon-pistol') =>
  clear(createHauntPlaytest('werewolf', 31, 3, focus));
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));
const shot = (game) =>
  actions(game).abilities.find((action) => action.handler === 'firearm.shoot');
const load = (game) =>
  act(
    game,
    actions(game).abilities.find((action) => action.handler === 'firearm.load')
      .command,
  );

test('pistol belongs to generic expanded sets and classic decks stay unchanged', () => {
  assert(!resolveGameSet('classic').decks.item.includes('pistol'));
  assert(resolveGameSet('expanded').decks.item.includes('pistol'));
  assert(!resolveGameSet('expanded').decks.item.includes('silver-bullet'));
});
test('rays require straight same-floor connected doors, range and empty intervening rooms', () => {
  const game = fixture();
  assert.deepEqual(shotRay(game, 'foyer', 'shoot-room-2'), [
    'foyer',
    'shoot-room-1',
    'shoot-room-2',
  ]);
  assert.equal(shotRay(game, 'foyer', 'shoot-room-3'), null);
  game.heroes[1].pos = 'shoot-room-3';
  assert.equal(shotRay(game, 'foyer', 'shoot-room-3', Infinity).length, 4);
  assert.equal(shotRay(game, 'foyer', 'foyer'), null);
  assert.equal(shotRay(game, 'foyer', 'upper', Infinity), null);
  game.rooms.find((room) => room.id === 'shoot-room-1').rotation = 1;
  assert.equal(shotRay(game, 'foyer', 'shoot-room-3', Infinity), null);
  game.rooms.find((room) => room.id === 'shoot-room-1').rotation = 2;
  assert(shotRay(game, 'foyer', 'shoot-room-3', Infinity));
  game.heroes[2].pos = 'shoot-room-1';
  assert.equal(shotRay(game, 'foyer', 'shoot-room-3', Infinity), null);
  game.heroes[2].dead = true;
  assert(shotRay(game, 'foyer', 'shoot-room-3', Infinity));
  game.rooms.find((room) => room.id === 'shoot-room-3').y = 1;
  assert.equal(shotRay(game, 'foyer', 'shoot-room-3', Infinity), null);
});
test('load unload and carrying retain the bullet identity and reload budget through trade, drop and pickup', () => {
  const game = fixture('bloodmoon-silver-first'),
    owner = game.heroes[0],
    recipient = game.heroes[2];
  assert(loadSilver(owner, 'test-pistol', 'test-silver-1', game.round));
  assert.equal(owner.items.filter((id) => id === 'silver-bullet').length, 1);
  assert(!owner.attacked);
  assert(transferItemInstance(owner, recipient, 'test-pistol'));
  assert(dropItemInstance(recipient, game.rooms[0], 'test-pistol'));
  assert(pickupItemInstance(owner, game.rooms[0], 'test-pistol'));
  const saved = restore(game);
  assert.equal(
    itemInstances(saved.heroes[0]).find(
      (item) => item.instanceId === 'test-pistol',
    ).state.loadedBullet.instanceId,
    'test-silver-1',
  );
  assert(unloadSilver(saved.heroes[0], 'test-pistol'));
  assert(
    itemInstances(saved.heroes[0]).some(
      (item) => item.instanceId === 'test-silver-1',
    ),
  );
  assert(
    !loadSilver(saved.heroes[0], 'test-pistol', 'test-silver-1', game.round),
  );
  assert(
    loadSilver(saved.heroes[0], 'test-pistol', 'test-silver-1', game.round + 1),
  );
});
test('illegal and stale shots neither consume ammo nor spend an attack', () => {
  const game = load(fixture('bloodmoon-silver-first'));
  const command = shot(game).command;
  game.heroes[2].pos = 'shoot-room-1';
  assert.deepEqual(act(game, command), game);
  assert.deepEqual(act(game, { ...command, targetId: 2, silver: true }), game);
  assert(
    game.heroes[0].itemInstances.find(
      (item) => item.instanceId === 'test-pistol',
    ).state.loadedBullet,
  );
  assert(!game.heroes[0].attacked);
});
test('ordinary shot restores defender-owned dodge dice and waits for manual injury after failure', () => {
  let game = fixture();
  const original = structuredClone(game.heroes[1].stats);
  game = act(game, shot(game).command);
  assert.equal(pending(game).rolls[0].heroId, 1);
  assert.match(pending(game).outcomes[1].effect, /2点身体伤害.*自行/);
  game = restore(game);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 2);
  assert.deepEqual(game.heroes[1].stats, original);
  game = clear(
    act(restore(game), {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation: { might: 1, speed: 1 },
    }),
  );
  assert.equal(game.heroes[1].stats.might, original.might - 1);
  assert.equal(
    game.events.filter((event) => event.type === 'ShotResolved').length,
    1,
  );
  assert.equal(shot(game), undefined);
});
test('successful dodge inflicts no damage and still spends the attack', () => {
  let game = fixture();
  game = act(game, shot(game).command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(2);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game), null);
  assert(!game.events.some((event) => event.type === 'DamageApplied'));
  assert(game.heroes[0].attacked);
});
test('defender ring result stays pending before gun injury and preserves the target-owned dice through restore', () => {
  let game = fixture();
  addItemInstance(game.heroes[1], 'family-ring', 'dodge-ring');
  game = act(game, shot(game).command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(pending(game).kind, 'choiceRequest');
  assert.equal(pending(game).heroId, 1);
  game = act(restore(game), {
    type: 'resolveChoice',
    requestId: pending(game).uid,
    choice: '0:0',
  });
  assert.equal(pending(game).kind, 'ringResult');
  assert.equal(pending(game).heroId, 1);
  assert(!game.events.some((event) => event.type === 'DamageApplied'));
  const request = pending(game);
  assert.deepEqual(act(restore(game), { type: 'endHero' }), restore(game));
  game = act(restore(game), { type: 'advance', requestId: request.uid });
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 2);
  assert.equal(pending(game).heroId, 1);
});
test('silver is consumed exactly once, bypasses dice and awaits seven manually allocated points after save restore', () => {
  let game = load(fixture('bloodmoon-silver-first'));
  const command = shot(game).command;
  assert.equal(shot(game).silver, true);
  game = act(game, command);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(pending(game).remaining, 7);
  assert.equal(pending(game).heroId, 1);
  assert.equal(pending(game).causeTag, 'silverShot');
  assert(
    !game.heroes[0].itemInstances.find(
      (item) => item.instanceId === 'test-pistol',
    ).state.loadedBullet,
  );
  assert.deepEqual(act(restore(game), command), restore(game));
  assert(game.heroes[0].items.includes('silver-bullet'));
  game = clear(
    act(restore(game), {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation: { might: 3, speed: 4 },
    }),
  );
  assert.equal(game.heroes[1].stats.might, 4);
  assert.equal(game.heroes[1].stats.speed, 3);
  assert.equal(
    game.events.filter((event) => event.type === 'DamageApplied').length,
    1,
  );
});
test('ordinary gun works against legacy HP enemies without applying environment movement stop', () => {
  let game = clear(createHauntPlaytest('bells', 31, 3));
  game.enemies[0].pos = 'stairs';
  game.heroes[0].pos = 'foyer';
  game.heroes.slice(1).forEach((hero) => {
    hero.pos = 'entrance';
  });
  addItemInstance(game.heroes[0], 'pistol', 'legacy-pistol');
  const hp = game.enemies[0].hp;
  game = act(game, shot(game).command);
  pending(game).rolls[0].dice = Array(pending(game).rolls[0].count).fill(0);
  game = act(game, { type: 'resolveDice', requestId: pending(game).uid });
  assert.equal(game.enemies[0].hp, hp - 2);
  assert.equal(game.enemies[0].movementStoppedRound, undefined);
});
test('LAN shooter may not roll target dice or allocate target injury', () => {
  const api = createRoomService({
    gameFactory: () => {
      const game = fixture();
      game.traitRules.push({
        id: 'test-single-dodge',
        heroId: 1,
        trait: 'speed',
        patch: { track: [0, 1, 1, 1, 1, 1, 1, 1] },
      });
      return game;
    },
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
  room = update(host.key, shot(room.game).command);
  const request = pending(room.game);
  assert.throws(
    () => update(host.key, { type: 'rollDice', sideId: request.rolls[0].id }),
    /负责的骰子/,
  );
  room = update(guest.key, { type: 'rollDice', sideId: request.rolls[0].id });
  room = update(host.key, { type: 'resolveDice', requestId: request.uid });
  assert.equal(pending(room.game)?.kind, 'privateRequest');
  const injury = pending(api.read(host.code, guest.key).game);
  assert.equal(injury.kind, 'damage');
  assert.equal(injury.remaining, 2);
  assert.throws(
    () =>
      update(host.key, {
        type: 'allocateDamage',
        requestId: injury.uid,
        allocation: { might: 1, speed: 1 },
      }),
    /当前角色/,
  );
  room = update(guest.key, {
    type: 'allocateDamage',
    requestId: injury.uid,
    allocation: { might: 1, speed: 1 },
  });
  assert.notEqual(pending(room.game)?.kind, 'damage');
});
