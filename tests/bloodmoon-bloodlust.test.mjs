import test from 'node:test';
import assert from 'node:assert/strict';
import { act, pending, restoreGameSave } from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import { bloodlustTriggers } from '../lib/content/bloodmoon-bloodlust.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { createRoomService } from '../scripts/room-server.mjs';

const clear = (game) => {
  while (
    pending(game) &&
    !['diceRequest', 'damage', 'choiceRequest'].includes(pending(game).kind)
  )
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  return game;
};
const fixture = (focus = 'bloodmoon-bloodlust-full') =>
  clear(createHauntPlaytest('werewolf', 31, 3, focus));
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));
const choose = (game, choice) =>
  clear(
    act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice }),
  );
function attack(game, amount = 3) {
  game = act(game, { type: 'actorAttack', targetId: 1 });
  pending(game).rolls.forEach((group, index) => {
    let left = index === 0 ? amount : 0;
    group.dice = Array.from({ length: group.count }, () => {
      const face = Math.min(2, left);
      left -= face;
      return face;
    });
    assert.equal(left, 0);
  });
  return clear(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
}
const allocate = (game, allocation) =>
  clear(
    act(game, {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation,
    }),
  );

test('bloodlust waits for actual injury then freely restores exactly its amount, preserving current movement', () => {
  let game = fixture();
  const moves = game.heroes[0].moves;
  game = attack(game);
  assert.equal(pending(game).kind, 'damage');
  assert.equal(game.heroes[0].stats.might, 2);
  game = allocate(restore(game), { might: 2, speed: 1 });
  assert.equal(pending(game).title, '嗜血 · 分配身体恢复');
  game = choose(restore(game), 'might');
  assert.equal(pending(game).workflow.locals.remaining, 2);
  game = choose(restore(game), 'speed');
  game = choose(game, 'speed');
  assert.equal(game.heroes[0].stats.might, 3);
  assert.equal(game.heroes[0].stats.speed, 4);
  assert.equal(game.heroes[0].moves, moves);
  assert(!pending(game));
  assert.equal(
    game.events.filter((event) => event.type === 'BloodlustRestored').length,
    1,
  );
});

test('full moon and permanent weakening cap restoration at four; blood moon reaches seven', () => {
  for (const [focus, cap] of [
    ['bloodmoon-bloodlust-full', 4],
    ['bloodmoon-bloodlust-blood', 7],
    ['bloodmoon-bloodlust-silver', 4],
  ]) {
    let game = allocate(attack(fixture(focus), 5), { might: 2, speed: 3 });
    while (pending(game)?.kind === 'choiceRequest')
      game = choose(game, pending(game).options[0].value);
    assert.equal(game.heroes[0].stats.might, cap);
    assert.equal(game.heroes[0].stats.speed, cap);
    const receipt = game.events.findLast(
      (event) => event.type === 'BloodlustRestored',
    );
    assert.equal(receipt.amount, 5);
    assert.equal(receipt.unused, focus.endsWith('silver') ? 3 : 1);
  }
});

test('bloodlust uses prevented actual damage rather than raw attack difference', () => {
  let game = fixture();
  game.ruleTriggers = [
    {
      id: 'prevent',
      sourceId: 'test',
      when: 'BeforeDamage',
      effects: [{ op: 'damage.adjust', params: { delta: -2 } }],
    },
  ];
  game = allocate(attack(game, 3), { might: 1, speed: 0 });
  assert.equal(pending(game).workflow.locals.remaining, 1);
  game = choose(game, 'speed');
  assert.equal(game.heroes[0].stats.speed, 3);
  assert(!pending(game));
});

test('initial awakening, counters, secondary wolves, firearms and environment do not trigger bloodlust', () => {
  for (const focus of [
    'bloodmoon-control',
    'bloodmoon-secondary',
    'bloodmoon-bloodlust-full',
  ]) {
    const game = fixture(focus),
      event = {
        when: 'AfterDamage',
        sourceHeroId: 0,
        causeTag: 'actorAttack',
        damageType: 'physical',
        actualAmount: 3,
      };
    if (focus === 'bloodmoon-bloodlust-full') {
      for (const causeTag of [
        'actorCounter',
        'pistolShot',
        'silverShot',
        'steam',
        'trapHit',
      ])
        assert.deepEqual(bloodlustTriggers(game, { ...event, causeTag }), []);
    } else if (focus === 'bloodmoon-secondary') {
      game.elapsed = 4;
      assert.deepEqual(
        bloodlustTriggers(game, { ...event, sourceHeroId: 1 }),
        [],
      );
    } else assert.deepEqual(bloodlustTriggers(game, event), []);
  }
});

test('nested badge response finishes before bloodlust, with no duplicated injury after restore', () => {
  let game = fixture();
  addItemInstance(game.heroes[1], 'saint-badge', 'badge');
  game = allocate(attack(game), { might: 2, speed: 1 });
  assert.equal(pending(game).title, '圣者徽章 · 庇护');
  assert.equal(game.heroes[0].stats.might, 2);
  game = choose(restore(game), 'skip');
  assert.equal(pending(game).title, '嗜血 · 分配身体恢复');
  game = choose(game, 'might');
  game = choose(game, 'might');
  game = choose(game, 'speed');
  assert.equal(
    game.events.filter((event) => event.type === 'DamageApplied').length,
    1,
  );
  assert.equal(
    game.events.filter((event) => event.type === 'BloodlustRestored').length,
    1,
  );
});

test('LAN bloodlust choices are owned by alpha and hidden from the victim player', () => {
  const api = createRoomService({
    gameFactory: () => allocate(attack(fixture()), { might: 2, speed: 1 }),
  });
  const host = api.create({ scenario: 'werewolf', count: 3 }),
    guest = api.join({ code: host.code });
  const room = api.update(host.code, host.key, {
    type: 'start',
    revision: guest.revision,
  });
  const request = pending(room.game);
  assert.equal(request.title, '嗜血 · 分配身体恢复');
  const hidden = pending(api.read(host.code, guest.key).game);
  assert.equal(hidden.kind, 'privateRequest');
  assert.equal(hidden.options, undefined);
  assert.throws(
    () =>
      api.update(host.code, guest.key, {
        type: 'action',
        revision: room.revision,
        action: {
          type: 'resolveChoice',
          requestId: request.uid,
          choice: 'speed',
        },
      }),
    /当前角色/,
  );
  const next = api.update(host.code, host.key, {
    type: 'action',
    revision: room.revision,
    action: { type: 'resolveChoice', requestId: request.uid, choice: 'speed' },
  });
  assert.equal(next.game.heroes[0].stats.speed, 3);
});
