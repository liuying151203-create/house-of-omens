import test from 'node:test';
import assert from 'node:assert/strict';
import {
  act,
  pending,
  executeRuleEffects,
  restoreGameSave,
} from '../lib/game-engine.mjs';
import { createHauntPlaytest } from '../lib/playtest.mjs';
import {
  infectionOf,
  infectionStatus,
} from '../lib/content/bloodmoon-infection.mjs';
import { addItemInstance } from '../lib/item-instances.mjs';
import { heroStatuses } from '../lib/hero-status.mjs';

const clear = (game) => {
  while (
    pending(game) &&
    !['diceRequest', 'damage', 'choiceRequest'].includes(pending(game).kind)
  )
    game = act(game, { type: 'advance', requestId: pending(game).uid });
  return game;
};
const fixture = (focus = 'bloodmoon-control') =>
  clear(createHauntPlaytest('werewolf', 31, 3, focus));
const restore = (game) => restoreGameSave(JSON.parse(JSON.stringify(game)));
const choose = (game, choice) =>
  clear(
    act(game, { type: 'resolveChoice', requestId: pending(game).uid, choice }),
  );
const allocate = (game, allocation) =>
  clear(
    act(game, {
      type: 'allocateDamage',
      requestId: pending(game).uid,
      allocation,
    }),
  );
function dice(game, totals) {
  pending(game).rolls.forEach((group, index) => {
    let remaining = totals[index];
    group.dice = Array.from({ length: group.count }, () => {
      const face = Math.min(2, remaining);
      remaining -= face;
      return face;
    });
    assert.equal(remaining, 0);
  });
  return clear(
    act(game, { type: 'resolveDice', requestId: pending(game).uid }),
  );
}
function bite(game, amount = 3) {
  game.heroes[0].attacked = false;
  return dice(act(game, { type: 'actorAttack', targetId: 1 }), [amount, 0]);
}
function gain(game, level) {
  executeRuleEffects(game, [
    {
      op: 'status.gain',
      params: { heroId: 1, status: infectionStatus(level) },
    },
  ]);
  return game;
}

test('infection uses settled actual damage, at most one level per active bite and survives damage restore', () => {
  let game = fixture();
  game.heroes[1].stats.might = game.heroes[1].stats.speed = 7;
  game = bite(game);
  assert(!infectionOf(game.heroes[1]));
  game = allocate(restore(game), { might: 3, speed: 0 });
  assert.equal(infectionOf(game.heroes[1]).level, 1);
  const before = { ...game.heroes[1].stats };
  game = allocate(bite(game), { might: 0, speed: 3 });
  assert.equal(infectionOf(game.heroes[1]).level, 2);
  assert.equal(game.heroes[1].stats.might, before.might + 2);
  assert.equal(game.heroes[1].stats.speed, before.speed - 1);
  assert.equal(game.heroes[1].stats.sanity, before.sanity - 1);
  assert.match(heroStatuses(game, game.heroes[1])[0].description, /理智3\+/);
});

test('prevented injury, subthreshold bite, alpha counterattack and secondary attacks never transmit infection', () => {
  let game = fixture();
  game = allocate(bite(game, 2), { might: 1, speed: 1 });
  assert(!infectionOf(game.heroes[1]));
  game = fixture();
  game.ruleTriggers = [
    {
      id: 'prevent',
      sourceId: 'test',
      when: 'BeforeDamage',
      effects: [{ op: 'damage.adjust', params: { delta: -3 } }],
    },
  ];
  game = bite(game);
  assert(!pending(game));
  assert(!infectionOf(game.heroes[1]));
  game = fixture();
  game.active = 1;
  game = allocate(
    dice(act(game, { type: 'actorAttack', targetId: 0 }), [0, 3]),
    { might: 1, speed: 2 },
  );
  assert(!infectionOf(game.heroes[1]));
  game = fixture('bloodmoon-secondary');
  game.active = 1;
  game = allocate(
    dice(act(game, { type: 'actorAttack', targetId: 2 }), [3, 0]),
    { might: 1, speed: 2 },
  );
  assert(!infectionOf(game.heroes[2]));
});

test('badge can block an infection upgrade before any first-II attribute movement', () => {
  let game = gain(fixture(), 1);
  addItemInstance(game.heroes[1], 'saint-badge', 'badge');
  game = allocate(bite(game), { might: 1, speed: 2 });
  assert.equal(pending(game).kind, 'choiceRequest');
  const before = { ...game.heroes[1].stats };
  game = choose(restore(game), 'protect');
  game = dice(game, [4]);
  assert.equal(infectionOf(game.heroes[1]).level, 1);
  assert.deepEqual(game.heroes[1].stats, before);
  assert(!game.heroes[1].infectionIIApplied);
  assert(!pending(game));
});

test('cleansing and reinfection retain historical movements without applying first-II twice', () => {
  const game = gain(fixture(), 2);
  const before = { ...game.heroes[1].stats };
  executeRuleEffects(game, [
    {
      op: 'status.remove',
      params: { heroId: 1, statusId: 'bloodmoon-infection' },
    },
  ]);
  gain(game, 2);
  assert.deepEqual(game.heroes[1].stats, before);
  assert.equal(
    game.events.filter((event) => event.type === 'InfectionGained').length,
    2,
  );
});

test('turn ending allows purification before rechecking infection and survives a paused save', () => {
  let game = fixture('bloodmoon-conversion');
  game = clear(act(game, { type: 'select', id: 1 }));
  game = clear(act(game, { type: 'endHero' }));
  assert.equal(pending(game).title, '消毒杀菌室 · 净化');
  game = choose(
    restore(game),
    pending(game).options.find((option) => option.value !== 'skip').value,
  );
  assert.equal(infectionOf(game.heroes[1]).level, 1);
  assert(!pending(game));
  assert.equal(game.heroes[1].faction, 'heroes');
});

test('failed end-turn check converts the same player seat and original tracks; last hero conversion wins', () => {
  let game = fixture('bloodmoon-conversion');
  game.heroes[2].dead = true;
  const tracks = structuredClone(game.heroes[1].tracks);
  game = clear(act(game, { type: 'select', id: 1 }));
  game = choose(clear(act(game, { type: 'endHero' })), 'skip');
  assert.equal(pending(game).title, '感染Ⅱ · 抵抗狼化');
  game = dice(restore(game), [0]);
  assert.equal(game.heroes[1].faction, 'wolves');
  assert.equal(game.heroes[1].combatRole, 'wolf');
  assert.equal(game.heroes[1].traitor, false);
  assert.deepEqual(game.heroes[1].tracks, tracks);
  assert(!infectionOf(game.heroes[1]));
  assert.equal(game.phase, 'over');
});

test('successful end-turn check keeps infection II and checks exactly once during a round', () => {
  let game = gain(fixture(), 2);
  game.active = 1;
  game = dice(clear(act(game, { type: 'endHero' })), [3]);
  assert.equal(game.heroes[1].faction, 'heroes');
  assert.equal(infectionOf(game.heroes[1]).level, 2);
  game = clear(act(game, { type: 'endRound' }));
  assert(!pending(game));
  assert.equal(
    game.events.filter(
      (event) =>
        event.type === 'CheckResolved' && event.title === '感染Ⅱ · 抵抗狼化',
    ).length,
    1,
  );
});
