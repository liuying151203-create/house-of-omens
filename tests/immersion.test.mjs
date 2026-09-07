import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInteractiveGame,
  act,
  drawCard,
  pending,
  validSave,
  HEROES,
} from '../lib/game-engine.mjs';
import { suggestDamage } from '../lib/damage-plan.mjs';
import { createRoomService } from '../scripts/room-server.mjs';
const start = () =>
  act(createInteractiveGame('mirror', 28, 3), { type: 'advance' });
const contested = () => {
  const s = start();
  s.phase = 'haunt';
  s.heroes[2].traitor = true;
  s.heroes[2].ended = true;
  s.enemies = [
    {
      id: 'keeper',
      kind: 'keeper',
      name: '守钟人',
      pos: 'entrance',
      hp: 99,
      maxHp: 99,
      might: 3,
      speed: 1,
    },
  ];
  return s;
};
test('default allocation fills the budget and avoids death whenever a safe split exists', () => {
  for (const template of HEROES)
    for (const damageType of ['physical', 'mental'])
      for (let amount = 1; amount <= 6; amount++) {
        const hero = {
          ...structuredClone(template),
          stats: { ...template.start },
        };
        const a = suggestDamage(hero, damageType, amount, 'haunt'),
          keys = Object.keys(a);
        assert.equal(
          Object.values(a).reduce((n, v) => n + v, 0),
          amount,
        );
        const safeCapacity = keys.reduce((n, k) => n + hero.stats[k] - 1, 0);
        if (amount <= safeCapacity)
          assert(keys.every((k) => hero.stats[k] - a[k] > 0));
      }
});
test('default allocation preserves numeric ability when a track has repeated values', () => {
  const h = {
    stats: { might: 3, speed: 3 },
    tracks: { might: [0, 1, 2, 2, 3], speed: [0, 1, 2, 3, 4] },
  };
  assert.deepEqual(suggestDamage(h, 'physical', 1, 'haunt'), {
    might: 1,
    speed: 0,
  });
});
test('event dice wait for explicit input, expose no result early, and survive save restore', () => {
  let s = start();
  s.decks.event = ['cipher'];
  drawCard(s, 'event', s.heroes[0]);
  const stats = structuredClone(s.heroes[0].stats),
    seed = s.seed;
  s = act(s, { type: 'advance' });
  assert.equal(pending(s).kind, 'diceRequest');
  assert.equal(s.seed, seed);
  assert(pending(s).rolls.every((r) => r.dice === null));
  assert.deepEqual(s.heroes[0].stats, stats);
  assert.deepEqual(act(s, { type: 'advance' }), s);
  assert(validSave(s));
  s = act(JSON.parse(JSON.stringify(s)), { type: 'rollAll' });
  assert.notEqual(s.seed, seed);
  assert.deepEqual(s.heroes[0].stats, stats);
  const rolled = structuredClone(s);
  assert.deepEqual(act(s, { type: 'rollDice', sideId: 'side-0' }), rolled);
  s = act(s, { type: 'advance' });
  assert.equal(pending(s).kind, 'cardResult');
  assert(pending(s).dicePresented);
});
test('opposed rolls keep damage and enemy health unchanged until both groups are rolled and confirmed', () => {
  let s = contested();
  s = act(s, { type: 'attack', id: 'keeper' });
  const p = pending(s);
  assert.equal(p.kind, 'diceRequest');
  assert.equal(p.rolls.length, 2);
  assert.equal(p.rolls[0].heroId, 0);
  assert.equal(p.rolls[1].heroId, 2);
  assert.equal(s.enemies[0].hp, 99);
  assert(!s.heroes[0].attacked);
  s = act(s, { type: 'rollDice', sideId: p.rolls[0].id });
  assert.deepEqual(act(s, { type: 'advance' }), s);
  s = act(s, { type: 'rollDice', sideId: p.rolls[1].id });
  assert.equal(s.enemies[0].hp, 99);
  s = act(s, { type: 'advance' });
  assert(s.heroes[0].attacked);
  assert.equal(pending(s).kind, 'combat');
});
test('network peers can only roll their own combat side, regardless of active explorer', () => {
  const api = createRoomService({ gameFactory: contested }),
    host = api.create({ count: 3, scenario: 'mirror', name: '甲' }),
    guest = api.join({ code: host.code, name: '乙' });
  let r = api.update(host.code, guest.key, {
    type: 'seat',
    seat: 2,
    revision: guest.revision,
  });
  r = api.update(host.code, host.key, { type: 'start', revision: r.revision });
  const send = (key, action) => {
    r = api.update(host.code, key, {
      type: 'action',
      action,
      revision: r.revision,
    });
  };
  send(host.key, { type: 'attack', id: 'keeper' });
  assert.throws(
    () => send(host.key, { type: 'rollDice', sideId: 'side-1' }),
    /只能投掷/,
  );
  assert.throws(
    () => send(guest.key, { type: 'rollAll', sideIds: ['side-0', 'side-1'] }),
    /只能投掷/,
  );
  send(guest.key, { type: 'rollDice', sideId: 'side-1' });
  assert.equal(pending(r.game).rolls[0].dice, null);
  assert.throws(() => send(guest.key, { type: 'advance' }), /等待/);
  send(host.key, { type: 'rollAll', sideIds: ['side-0'] });
  send(host.key, { type: 'advance' });
  assert.equal(pending(r.game).kind, 'combat');
  assert.deepEqual(api.read(host.code, guest.key).game, r.game);
});
